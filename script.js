/* =========================================================
   POCKET MONMON — a tiny pocket-pet salmon game
   Vanilla JS + Canvas 2D. No build step, no assets needed —
   every sprite is drawn procedurally so it's easy to tweak.
   ========================================================= */

(() => {
  "use strict";

  /* ---------------- CONFIG ---------------- */
  const STAGE_DAYS = 14; // days per life stage
  const STORAGE_KEY = "pocketMonmonSave";

  const STAGES = [
    { key: "alevin", name: "Alevin",       blurb: "Your alevin is tiny and still lives off its yolk sac." },
    { key: "fry",     name: "Fry",         blurb: "Fry! Faint stripes called parr marks are starting to show." },
    { key: "parr",    name: "Parr",        blurb: "Parr now — bold marks and speckles help it hide from predators." },
    { key: "smolt",   name: "Smolt",       blurb: "Smolt stage! A shiny silver coat is coming in for the big journey." },
    { key: "adult",   name: "Adult Salmon",blurb: "Fully grown! Your salmon is a strong, handsome adult now." },
  ];

  // Visual keyframes per stage index (interpolated within a stage)
  const SCALES        = [0.40, 0.55, 0.72, 0.92, 1.18];
  const PARR_MARK      = [0.00, 0.55, 1.00, 0.25, 0.00];
  const SPOT_STRENGTH  = [0.00, 0.20, 0.85, 0.55, 0.70];
  const SILVER_AMOUNT  = [0.00, 0.10, 0.20, 0.85, 0.55];
  const KYPE_AMOUNT    = [0.00, 0.00, 0.00, 0.00, 1.00];
  const FIN_SCALE      = [0.55, 0.72, 0.85, 0.95, 1.10];

  const BACK_COLORS  = [
    [235,190,170], [120,150,90], [95,130,80], [150,172,188], [45,98,112],
  ];
  const BELLY_COLORS = [
    [250,225,205], [225,235,235], [215,225,220], [236,241,246], [251,214,208],
  ];

  /* ---------------- STORAGE ---------------- */
  function loadSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function writeSave(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }

  let save = loadSave() || {
    name: "",
    hatched: false,
    hatchTimestamp: null,
    lastCelebratedStage: -1,
  };

  /* ---------------- DOM ---------------- */
  const canvas   = document.getElementById("game");
  const ctx      = canvas.getContext("2d");
  const hudName  = document.getElementById("hud-name");
  const hudStage = document.getElementById("hud-stage");
  const dayCount = document.getElementById("day-count");
  const growthFill  = document.getElementById("growth-fill");
  const growthLabel = document.getElementById("growth-label");
  const hint     = document.getElementById("hint");

  const modalOverlay = document.getElementById("modal-overlay");
  const nameInput     = document.getElementById("name-input");
  const nameConfirm   = document.getElementById("name-confirm");

  const stageupOverlay = document.getElementById("stageup-overlay");
  const stageupTitle   = document.getElementById("stageup-title");
  const stageupText    = document.getElementById("stageup-text");
  const stageupConfirm = document.getElementById("stageup-confirm");

  const gearBtn        = document.getElementById("gear-btn");
  const settingsOverlay= document.getElementById("settings-overlay");
  const settingsClose  = document.getElementById("settings-close");
  const skipDayBtn      = document.getElementById("skip-day-btn");
  const resetBtn        = document.getElementById("reset-btn");

  /* ---------------- CANVAS SIZING ---------------- */
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width  = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    waterY = H * 0.30;
  }
  let waterY = 150;
  window.addEventListener("resize", resize);

  /* ---------------- RNG helper (seeded) ---------------- */
  function seedFromString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }
  function makeSpots(seedStr, count) {
    const rand = seedFromString(seedStr || "monmon");
    const spots = [];
    for (let i = 0; i < count; i++) {
      spots.push({
        x: -0.30 + rand() * 0.75,          // local unit position along body
        y: -0.30 + rand() * 0.6,
        r: 0.03 + rand() * 0.035,
        red: rand() > 0.55,                 // some spots are reddish (adult)
      });
    }
    return spots;
  }
  let spots = makeSpots(save.name, 26);

  /* ---------------- GAME STATE ---------------- */
  const fish = {
    x: 0, y: 0, vx: 0, vy: 0, angle: 0,
    tailPhase: 0,
    mode: "swim",       // "swim" | "jump"
    jump: null,
  };
  const pointer = { x: 0, y: 0, dragging: false };
  let target = { x: 0, y: 0 };
  const swipeTrack = []; // {x,y,t}

  // --- autonomous wandering (used whenever the player isn't dragging) ---
  const autoTarget = { x: 0, y: 0 };
  let autoTargetTimer = 0;
  let autoResumeDelay = 0; // brief pause after the player lets go, before wandering resumes
  function pickNewAutoTarget() {
    const margin = 60;
    const minY = waterY + 40;
    const maxY = H - 50;
    autoTarget.x = margin + Math.random() * Math.max(10, W - margin * 2);
    autoTarget.y = minY + Math.random() * Math.max(10, maxY - minY);
    autoTargetTimer = 2200 + Math.random() * 2800; // pick a fresh spot every ~2-5s
  }
  const particles = [];  // bubbles + splashes
  let lastBubbleSpawn = 0;
  let lastHudUpdate = 0;
  let phase = save.hatched ? "fish" : "egg";
  let eggWobble = 0;

  function daysSinceHatch() {
    if (!save.hatched || !save.hatchTimestamp) return 0;
    const ms = Date.now() - save.hatchTimestamp;
    return Math.max(0, Math.floor(ms / 86400000));
  }
  function getStageIndex(days) {
    let idx = 0;
    for (let i = 0; i < STAGES.length; i++) {
      const minDay = i * STAGE_DAYS;
      if (days >= minDay) idx = i;
    }
    return idx;
  }
  function getStageProgress(days, stageIdx) {
    if (stageIdx >= STAGES.length - 1) return 1;
    const into = days - stageIdx * STAGE_DAYS;
    return Math.min(1, Math.max(0, into / STAGE_DAYS));
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpKeyframe(arr, stageIdx, progress) {
    const a = arr[stageIdx];
    const b = stageIdx < arr.length - 1 ? arr[stageIdx + 1] : a;
    const t = stageIdx < arr.length - 1 ? progress : 0;
    return lerp(a, b, t);
  }
  function lerpColor(c1, c2, t) {
    return [
      Math.round(lerp(c1[0], c2[0], t)),
      Math.round(lerp(c1[1], c2[1], t)),
      Math.round(lerp(c1[2], c2[2], t)),
    ];
  }

  function getLook() {
    const days = daysSinceHatch();
    const stageIdx = getStageIndex(days);
    const progress = getStageProgress(days, stageIdx);
    const nextIdx = Math.min(stageIdx + 1, STAGES.length - 1);
    return {
      days, stageIdx, progress,
      scale: lerpKeyframe(SCALES, stageIdx, progress),
      parrMark: lerpKeyframe(PARR_MARK, stageIdx, progress),
      spotStrength: lerpKeyframe(SPOT_STRENGTH, stageIdx, progress),
      silver: lerpKeyframe(SILVER_AMOUNT, stageIdx, progress),
      kype: lerpKeyframe(KYPE_AMOUNT, stageIdx, progress),
      finScale: lerpKeyframe(FIN_SCALE, stageIdx, progress),
      yolk: stageIdx === 0 ? (1 - progress) : 0,
      backColor: lerpColor(BACK_COLORS[stageIdx], BACK_COLORS[nextIdx], stageIdx < 4 ? progress : 0),
      bellyColor: lerpColor(BELLY_COLORS[stageIdx], BELLY_COLORS[nextIdx], stageIdx < 4 ? progress : 0),
    };
  }

  /* ---------------- INPUT ---------------- */
  function localPos(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x: cx, y: cy };
  }

  function onPointerDown(e) {
    const p = localPos(e);
    if (phase === "egg") {
      // tap-to-hatch: only counts if reasonably near the egg
      const eggX = W / 2, eggY = (waterY + H) / 2;
      const d = Math.hypot(p.x - eggX, p.y - eggY);
      if (d < Math.max(90, W * 0.22)) {
        openNamingModal();
      }
      return;
    }
    pointer.dragging = true;
    pointer.x = p.x; pointer.y = p.y;
    target.x = p.x; target.y = clampTargetY(p.y);
    swipeTrack.length = 0;
    swipeTrack.push({ x: p.x, y: p.y, t: performance.now() });
    canvas.style.cursor = "grabbing";
  }
  function onPointerMove(e) {
    if (!pointer.dragging || phase !== "fish") return;
    const p = localPos(e);
    pointer.x = p.x; pointer.y = p.y;
    target.x = p.x; target.y = clampTargetY(p.y);
    swipeTrack.push({ x: p.x, y: p.y, t: performance.now() });
    const cutoff = performance.now() - 250;
    while (swipeTrack.length && swipeTrack[0].t < cutoff) swipeTrack.shift();
  }
  function onPointerUp(e) {
    if (!pointer.dragging) return;
    pointer.dragging = false;
    canvas.style.cursor = "grab";
    autoResumeDelay = 900; // let the fish coast a moment before it starts wandering again
    if (phase !== "fish" || fish.mode === "jump") return;
    if (swipeTrack.length >= 2) {
      const first = swipeTrack[0];
      const last  = swipeTrack[swipeTrack.length - 1];
      const dx = last.x - first.x;
      const dy = last.y - first.y;
      const dt = Math.max(1, last.t - first.t);
      const speed = Math.abs(dy) / dt; // px per ms
      if (dy < -45 && Math.abs(dy) > Math.abs(dx) * 1.15 && speed > 0.35) {
        triggerJump(Math.sign(dx) || (fish.vx >= 0 ? 1 : -1));
      }
    }
  }
  function clampTargetY(y) {
    const minY = waterY + 26;
    const maxY = H - 30;
    return Math.min(maxY, Math.max(minY, y));
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  /* ---------------- JUMP ---------------- */
  function triggerJump(dir) {
    fish.mode = "jump";
    fish.jump = {
      startTime: performance.now(),
      duration: 850,
      startX: fish.x,
      startY: fish.y,
      dir: dir,
      forward: 85 + Math.random() * 25,
      peak: 120 + Math.random() * 30,
    };
    spawnSplash(fish.x, waterY, 14);
  }

  function updateJump(now) {
    const j = fish.jump;
    const t = Math.min(1, (now - j.startTime) / j.duration);
    const x = j.startX + j.dir * j.forward * t;
    const y = j.startY - j.peak * 4 * t * (1 - t);
    const dxdt = j.dir * j.forward;
    const dydt = -j.peak * 4 * (1 - 2 * t);
    fish.x = x; fish.y = Math.min(y, j.startY);
    if (Math.abs(dxdt) > 0.001 || Math.abs(dydt) > 0.001) {
      fish.angle = Math.atan2(dydt, dxdt);
    }
    if (t >= 1) {
      fish.mode = "swim";
      fish.jump = null;
      spawnSplash(fish.x, waterY, 18);
      target.x = fish.x;
      target.y = Math.max(waterY + 40, fish.y);
    }
  }

  /* ---------------- PARTICLES ---------------- */
  function spawnSplash(x, y, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI - Math.PI / 2 - Math.PI / 2; // upward spread
      const speed = 1 + Math.random() * 2.4;
      particles.push({
        kind: "splash",
        x, y,
        vx: Math.cos(a) * speed * 1.6,
        vy: Math.sin(a) * speed * 1.6 - 1,
        r: 2 + Math.random() * 3,
        life: 1,
      });
    }
  }
  function spawnBubble() {
    particles.push({
      kind: "bubble",
      x: Math.random() * W,
      y: H + 10,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -0.35 - Math.random() * 0.5,
      r: 1.5 + Math.random() * 3,
      life: 1,
    });
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      if (p.kind === "splash") {
        p.vy += 0.012 * dt * 0.06 * 16; // gravity
        p.life -= dt * 0.0016;
      } else {
        p.life -= dt * 0.00025;
        if (p.y < waterY - 4) p.life = 0;
      }
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  /* ---------------- DRAW: BACKGROUND ---------------- */
  function drawBackground(now) {
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, waterY);
    sky.addColorStop(0, "#bfeaf5");
    sky.addColorStop(1, "#e7f8f2");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, waterY + 2);

    // sun glow
    ctx.save();
    ctx.globalAlpha = 0.5;
    const rg = ctx.createRadialGradient(W * 0.82, waterY * 0.35, 4, W * 0.82, waterY * 0.35, 70);
    rg.addColorStop(0, "#fff3c4");
    rg.addColorStop(1, "rgba(255,243,196,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, waterY);
    ctx.restore();

    // water body
    const water = ctx.createLinearGradient(0, waterY, 0, H);
    water.addColorStop(0, "#3aa8c2");
    water.addColorStop(0.35, "#1c8aa8");
    water.addColorStop(1, "#0e5f7a");
    ctx.fillStyle = water;
    ctx.fillRect(0, waterY, W, H - waterY);

    // caustic shimmer bands
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = "#eafcff";
    ctx.lineWidth = 6;
    for (let i = 0; i < 4; i++) {
      const yy = waterY + 30 + i * ((H - waterY) / 4.2);
      ctx.beginPath();
      for (let x = -20; x <= W + 20; x += 14) {
        const yOff = Math.sin(x * 0.02 + now * 0.0012 + i) * 8;
        if (x === -20) ctx.moveTo(x, yy + yOff);
        else ctx.lineTo(x, yy + yOff);
      }
      ctx.stroke();
    }
    ctx.restore();

    // surface wave line
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 10) {
      const y = waterY + Math.sin(x * 0.045 + now * 0.0022) * 3.5;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // gentle seafloor decoration
    drawSeafloor(now);
  }

  function drawSeafloor(now) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let i = 0; i < 3; i++) {
      const bx = W * (0.15 + i * 0.35);
      const by = H - 6;
      const sway = Math.sin(now * 0.0015 + i * 2) * 6;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + 10 + sway, by - 30, bx + sway * 0.5, by - 55);
      ctx.quadraticCurveTo(bx - 10 + sway, by - 30, bx, by);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.kind === "splash" ? "#eafcff" : "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ---------------- DRAW: EGG ---------------- */
  function drawEgg(now) {
    const x = W / 2;
    const baseY = (waterY + H) / 2;
    const bob = Math.sin(now * 0.002) * 6;
    const y = baseY + bob;
    eggWobble = Math.sin(now * 0.006) * 0.05;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(eggWobble);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#04303f";
    ctx.beginPath();
    ctx.ellipse(0, 58, 40, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // egg body
    const g = ctx.createRadialGradient(-12, -18, 6, 0, 0, 60);
    g.addColorStop(0, "#fff3df");
    g.addColorStop(0.55, "#f3caa0");
    g.addColorStop(1, "#e2a877");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 42, 52, 0, 0, Math.PI * 2);
    ctx.fill();

    // speckles
    ctx.fillStyle = "rgba(180,120,80,0.35)";
    const speckleRand = seedFromString("eggspeckles");
    for (let i = 0; i < 16; i++) {
      const a = speckleRand() * Math.PI * 2;
      const r = speckleRand() * 34;
      const sx = Math.cos(a) * r * 0.9;
      const sy = Math.sin(a) * r;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.6 + speckleRand() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // shine
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(-14, -22, 10, 15, -0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // prompt
    ctx.save();
    ctx.globalAlpha = 0.75 + Math.sin(now * 0.005) * 0.2;
    ctx.fillStyle = "#fff6e6";
    ctx.font = "700 15px Quicksand, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Tap the egg to hatch it", x, y + 92);
    ctx.restore();
  }

  /* ---------------- DRAW: FISH ---------------- */
  function drawFish(now, dt) {
    const look = getLook();
    const L = 118 * look.scale;   // body length
    const Hh = 46 * look.scale;   // body height

    // idle life + speed-based tail wiggle
    const speed = Math.hypot(fish.vx, fish.vy);
    const wiggleSpeed = 0.008 + Math.min(0.03, speed * 0.004);
    fish.tailPhase += dt * wiggleSpeed;
    const tailWiggle = Math.sin(fish.tailPhase) * (fish.mode === "jump" ? 0.25 : lerp(0.35, 0.55, Math.min(1, speed / 4)));

    const idleBob = fish.mode === "swim" && speed < 0.15 ? Math.sin(now * 0.0025) * 3 : 0;
    const drawX = fish.x;
    const drawY = fish.y + idleBob;

    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.rotate(fish.angle);

    const [br, bg, bb] = look.backColor;
    const [pr, pg, pb] = look.bellyColor;

    // ---- tail fin (drawn first, behind body) ----
    ctx.save();
    ctx.translate(-L * 0.42, 0);
    ctx.rotate(tailWiggle);
    ctx.fillStyle = `rgba(${br},${bg},${bb},0.9)`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-L * 0.30, -Hh * 0.55 * look.finScale, -L * 0.46, -Hh * 0.62 * look.finScale);
    ctx.quadraticCurveTo(-L * 0.22, -Hh * 0.08, -L * 0.20, 0);
    ctx.quadraticCurveTo(-L * 0.22, Hh * 0.08, -L * 0.46, Hh * 0.62 * look.finScale);
    ctx.quadraticCurveTo(-L * 0.30, Hh * 0.55 * look.finScale, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ---- dorsal fin ----
    ctx.fillStyle = `rgba(${br},${bg},${bb},0.85)`;
    ctx.beginPath();
    ctx.moveTo(-L * 0.05, -Hh * 0.42);
    ctx.quadraticCurveTo(L * 0.02, -Hh * 0.95 * look.finScale, L * 0.16, -Hh * 0.40);
    ctx.quadraticCurveTo(L * 0.05, -Hh * 0.48, -L * 0.05, -Hh * 0.42);
    ctx.fill();

    // ---- adipose fin (small fin near tail, salmon-authentic detail) ----
    if (look.stageIdx >= 1) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, look.stageIdx * 0.4);
      ctx.fillStyle = `rgba(${br},${bg},${bb},0.9)`;
      ctx.beginPath();
      ctx.ellipse(-L * 0.30, -Hh * 0.46, 5 * look.scale, 3.2 * look.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ---- pectoral fins ----
    ctx.fillStyle = `rgba(${pr},${pg},${pb},0.95)`;
    ctx.save();
    ctx.translate(L * 0.10, Hh * 0.30);
    ctx.rotate(0.5 + tailWiggle * 0.3);
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.14 * look.finScale, Hh * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ---- body ----
    const bodyGrad = ctx.createLinearGradient(0, -Hh / 2, 0, Hh / 2);
    bodyGrad.addColorStop(0, `rgb(${br},${bg},${bb})`);
    bodyGrad.addColorStop(0.55, `rgb(${Math.round((br+pr)/2)},${Math.round((bg+pg)/2)},${Math.round((bb+pb)/2)})`);
    bodyGrad.addColorStop(1, `rgb(${pr},${pg},${pb})`);

    ctx.beginPath();
    ctx.moveTo(L * 0.58, 0);
    ctx.bezierCurveTo(L * 0.45, -Hh * 0.52, -L * 0.05, -Hh * 0.5, -L * 0.42, -Hh * 0.12);
    ctx.quadraticCurveTo(-L * 0.48, 0, -L * 0.42, Hh * 0.12);
    ctx.bezierCurveTo(-L * 0.05, Hh * 0.5, L * 0.45, Hh * 0.52, L * 0.58, 0);
    ctx.closePath();
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // ---- silver sheen overlay (smolt/adult shimmer) ----
    if (look.silver > 0.05) {
      ctx.save();
      ctx.globalAlpha = look.silver * 0.35;
      const sheen = ctx.createLinearGradient(-L * 0.3, -Hh * 0.3, L * 0.4, Hh * 0.2);
      sheen.addColorStop(0, "rgba(255,255,255,0)");
      sheen.addColorStop(0.5, "rgba(255,255,255,0.9)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.ellipse(0, 0, L * 0.42, Hh * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ---- parr marks (vertical bars) ----
    if (look.parrMark > 0.03) {
      ctx.save();
      ctx.globalAlpha = look.parrMark * 0.55;
      ctx.fillStyle = `rgb(${Math.max(0,br-40)},${Math.max(0,bg-30)},${Math.max(0,bb-20)})`;
      const marks = 7;
      for (let i = 0; i < marks; i++) {
        const mx = lerp(-L * 0.30, L * 0.36, i / (marks - 1));
        ctx.beginPath();
        ctx.ellipse(mx, 0, L * 0.035, Hh * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ---- speckles / spots ----
    if (look.spotStrength > 0.03) {
      ctx.save();
      ctx.globalAlpha = look.spotStrength;
      for (const s of spots) {
        ctx.fillStyle = s.red ? "rgba(214,80,60,0.75)" : "rgba(50,40,35,0.55)";
        ctx.beginPath();
        ctx.arc(s.x * L, s.y * Hh, s.r * L, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ---- yolk sac (alevin only) ----
    if (look.yolk > 0.03) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      const yg = ctx.createRadialGradient(-L*0.05, Hh*0.34, 2, -L*0.05, Hh*0.34, Hh*0.42*look.yolk+6);
      yg.addColorStop(0, "#ffe6a8");
      yg.addColorStop(1, "#ffb45c");
      ctx.fillStyle = yg;
      ctx.beginPath();
      ctx.ellipse(-L * 0.05, Hh * 0.40, (Hh * 0.5) * look.yolk + 4, (Hh * 0.42) * look.yolk + 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ---- kype (hooked jaw, adult only) ----
    if (look.kype > 0.05) {
      ctx.save();
      ctx.fillStyle = `rgb(${br},${bg},${bb})`;
      ctx.beginPath();
      ctx.moveTo(L * 0.56, Hh * 0.04);
      ctx.quadraticCurveTo(L * 0.66, Hh * 0.16 * look.kype + Hh*0.05, L * 0.58, Hh * 0.22 * look.kype);
      ctx.quadraticCurveTo(L * 0.52, Hh * 0.1, L * 0.56, Hh * 0.04);
      ctx.fill();
      ctx.restore();
    }

    // ---- gill line ----
    ctx.save();
    ctx.strokeStyle = `rgba(${Math.max(0,br-30)},${Math.max(0,bg-20)},${Math.max(0,bb-10)},0.4)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(L * 0.34, 0, Hh * 0.4, -1.1, 1.1);
    ctx.stroke();
    ctx.restore();

    // ---- eye ----
    const eyeX = L * 0.42, eyeY = -Hh * 0.06;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, Hh * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(eyeX + Hh * 0.03, eyeY, Hh * 0.095, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(eyeX + Hh * 0.06, eyeY - Hh * 0.04, Hh * 0.03, 0, Math.PI * 2);
    ctx.fill();

    // ---- mouth ----
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(L * 0.50, Hh * 0.05, Hh * 0.18, 0.2, 1.0);
    ctx.stroke();

    ctx.restore();
  }

  /* ---------------- CELEBRATION ---------------- */
  function maybeCelebrateStage() {
    if (phase !== "fish") return;
    const days = daysSinceHatch();
    const idx = getStageIndex(days);
    if (idx > save.lastCelebratedStage) {
      save.lastCelebratedStage = idx;
      writeSave(save);
      if (idx > 0) {
        const s = STAGES[idx];
        document.getElementById("stageup-emoji").textContent = "🎉";
        stageupTitle.textContent = `${save.name} became a ${s.name}!`;
        stageupText.textContent = s.blurb;
        stageupOverlay.classList.remove("hidden");
      }
    }
  }

  /* ---------------- HUD ---------------- */
  function updateHud() {
    const days = daysSinceHatch();
    const idx = getStageIndex(days);
    const stage = STAGES[idx];
    hudName.textContent = save.hatched ? save.name : "Pocket Monmon";
    hudStage.textContent = save.hatched ? stage.name : "Choose your egg";
    dayCount.textContent = `Day ${days}`;

    if (idx >= STAGES.length - 1) {
      growthFill.style.width = "100%";
      growthLabel.textContent = "Fully grown 🐡";
    } else {
      const into = days - idx * STAGE_DAYS;
      const pct = Math.min(100, (into / STAGE_DAYS) * 100);
      growthFill.style.width = pct + "%";
      growthLabel.textContent = `${into} / ${STAGE_DAYS} days to ${STAGES[idx+1].name}`;
    }
  }

  /* ---------------- MODALS ---------------- */
  function openNamingModal() {
    modalOverlay.classList.remove("hidden");
    nameInput.value = "";
    setTimeout(() => nameInput.focus(), 50);
  }
  function confirmName() {
    const val = nameInput.value.trim() || "Pip";
    save.name = val;
    save.hatched = true;
    save.hatchTimestamp = Date.now();
    save.lastCelebratedStage = 0;
    writeSave(save);
    spots = makeSpots(save.name, 26);
    phase = "fish";
    fish.x = W / 2;
    fish.y = (waterY + H) / 2;
    target.x = fish.x; target.y = fish.y;
    autoTarget.x = fish.x; autoTarget.y = fish.y;
    autoTargetTimer = 600;
    modalOverlay.classList.add("hidden");
    hint.style.opacity = "0.85";
    updateHud();
  }
  nameConfirm.addEventListener("click", confirmName);
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmName(); });
  stageupConfirm.addEventListener("click", () => stageupOverlay.classList.add("hidden"));

  gearBtn.addEventListener("click", () => settingsOverlay.classList.remove("hidden"));
  settingsClose.addEventListener("click", () => settingsOverlay.classList.add("hidden"));
  skipDayBtn.addEventListener("click", () => {
    if (!save.hatched) return;
    save.hatchTimestamp -= 86400000; // push hatch day back → +1 day elapsed
    writeSave(save);
    updateHud();
    maybeCelebrateStage();
  });
  resetBtn.addEventListener("click", () => {
    if (confirm("Release your fish and start a brand new egg?")) {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
  });

  /* ---------------- MAIN LOOP ---------------- */
  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(48, now - lastTime);
    lastTime = now;

    ctx.clearRect(0, 0, W, H);
    drawBackground(now);

    // ambient bubbles
    if (now - lastBubbleSpawn > 500) { spawnBubble(); lastBubbleSpawn = now; }
    updateParticles(dt);

    if (phase === "egg") {
      drawEgg(now);
    } else {
      if (fish.mode === "jump") {
        updateJump(now);
      } else {
        let ease = 0.06;
        if (pointer.dragging) {
          // player is actively guiding the fish toward `target`
          ease = 0.08;
        } else if (autoResumeDelay > 0) {
          // brief pause right after letting go, fish just coasts
          autoResumeDelay -= dt;
          ease = 0.03;
        } else {
          // no one is touching the screen — swim around on its own
          autoTargetTimer -= dt;
          const distToAuto = Math.hypot(autoTarget.x - fish.x, autoTarget.y - fish.y);
          if (autoTargetTimer <= 0 || distToAuto < 24) pickNewAutoTarget();
          target.x = autoTarget.x;
          target.y = autoTarget.y;
          ease = 0.025; // slower, more leisurely cruising when idle
        }
        fish.vx = (target.x - fish.x) * ease;
        fish.vy = (target.y - fish.y) * ease;
        fish.x += fish.vx;
        fish.y += fish.vy;
        const minY = waterY + 20, maxY = H - 20;
        fish.y = Math.min(maxY, Math.max(minY, fish.y));
        fish.x = Math.min(W - 10, Math.max(10, fish.x));
        const spd = Math.hypot(fish.vx, fish.vy);
        if (spd > 0.08) fish.angle = Math.atan2(fish.vy, fish.vx);
      }
      drawFish(now, dt);
    }

    drawParticles();

    if (now - lastHudUpdate > 500) {
      updateHud();
      maybeCelebrateStage();
      lastHudUpdate = now;
    }

    requestAnimationFrame(frame);
  }

  /* ---------------- INIT ---------------- */
  function init() {
    resize();
    fish.x = W / 2;
    fish.y = (waterY + H) / 2;
    target.x = fish.x; target.y = fish.y;
    autoTarget.x = fish.x; autoTarget.y = fish.y;
    autoTargetTimer = 500; // start wandering almost immediately
    if (phase === "fish") {
      hint.style.opacity = "0.85";
    } else {
      hint.textContent = "Dedicated to my little bee!";
    }
    updateHud();
    requestAnimationFrame(frame);
  }

  init();
})();
