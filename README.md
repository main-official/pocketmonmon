# 🐟 Pocket Monmon

A tiny pocket-pet salmon game. Hatch an egg, name your fish, and watch it grow
through five real salmon life stages over time — drag to guide it through the
water, and swipe up to make it leap!

No image files or external assets are used — every sprite (egg, alevin, fry,
parr, smolt, adult salmon, water, bubbles, splashes) is drawn live with the
Canvas 2D API, so the whole game is just three plain files.

## How to run it on Replit

1. Create a new Repl → choose the **"HTML/CSS/JS"** template (sometimes listed
   as "Static Site" or "Vanilla").
2. Delete the placeholder `index.html`, `style.css`, `script.js` it creates.
3. Upload (or copy-paste) these three files into the Repl's file list:
   - `index.html`
   - `style.css`
   - `script.js`
4. Click **Run**. Replit will open the webview with the game — that webview
   URL is also your shareable link once the Repl is public.
5. That's it — no `npm install`, no build step, no server code needed.

## How to play

- **Day 0:** an egg sits at the bottom of the tank. Tap it to hatch it.
- **Name it:** a little dialog pops up — type a name and confirm.
- **Follow your finger:** press and drag anywhere in the water; the salmon
  eases toward your finger/cursor.
- **Swipe up:** flick upward on the water and your salmon leaps out with a
  splash animation.
- **Watch it grow:** every real-world **14 days**, your salmon advances to the
  next life stage, with a little celebration pop-up:
  1. **Alevin** (day 0) — tiny, still carries its yolk sac
  2. **Fry** (day 14) — faint parr marks appear
  3. **Parr** (day 28) — bold marks + speckles
  4. **Smolt** (day 42) — silvery coat comes in
  5. **Adult Salmon** (day 56) — fully grown, pink belly, hooked jaw (kype)

Progress is saved in the browser's `localStorage`, so closing the tab and
coming back the next day picks up right where you left off (same egg/fish,
same name, real elapsed time).

Tap the **ℹ️ info icon** in the top right any time for a quick reminder of
these instructions in-game.

## Testing without waiting two weeks

Growth is based on real elapsed time since the hatch, which is great for a
long-term pocket pet but slow to test. Tap the **⚙️ gear icon** in the top
right for two dev tools:

- **⏩ Skip forward 1 day** — instantly advances the save by one day so you
  can watch every growth stage without waiting.
- **🗑️ Release & start over** — wipes the save and gives you a fresh egg.

Feel free to remove the gear icon / settings panel from `index.html` before
sharing publicly if you'd rather players only experience real-time growth.

## Customizing

Everything about how the fish looks and grows lives in a few arrays at the
top of `script.js`:

- `STAGE_DAYS` — how many days each stage lasts (default 14).
- `STAGES` — names + flavor text shown on stage-up.
- `SCALES`, `PARR_MARK`, `SPOT_STRENGTH`, `SILVER_AMOUNT`, `KYPE_AMOUNT`,
  `FIN_SCALE`, `BACK_COLORS`, `BELLY_COLORS` — one keyframe value per stage;
  the game smoothly interpolates between them across the two weeks, so the
  fish visibly changes a little every day rather than "popping" at each stage.

Colors, fonts, and the modal/HUD styling are all in `style.css` — the palette
is defined as CSS variables at the top of the file.
