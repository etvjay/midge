# Midge design system

*The rules, tokens and components behind midge.vercel.app, written from the code in `site/` on 2026-11-05. When the code and this file disagree, the code is current and this file needs updating.*

## 1. Direction

| | |
|---|---|
| **Product** | A network where groups decide together in private and settle on NEAR under rules no one can change. |
| **Character** | Exact, discreet, quietly alive. |
| **World** | Ink on paper for reading; a dark room for the private work; instrument drawings for the mechanism. |
| **Moments** | The hero network and the architecture flow carry the colour and the 3D. Everything else stays quiet. |
| **Signature** | Text that decodes from ciphertext as it comes into view (section kickers). Used only where something is revealed. |

**The layout idea:** a light editorial page you read, with dark *stages* where the motion plays. One stage per concept, each explaining one thing. The hero is a full-bleed dark stage.

## 2. Principles

1. **Plain words first.** Say what happens to the reader's money and decision, not how the cryptography works. Technical terms (TEE, attestation, nonce, hatch_out) live in the docs, not on the page.
2. **Motion explains.** Every animation shows a mechanism: bids sealing, a payment refused, a member leaving. Decorative motion (tickers, cursor followers, grain, breathing glows on static things) is out.
3. **Static first.** The page is complete with no JavaScript, no WebGL and reduced motion. Motion and 3D are added on top and can fail without losing the message.
4. **One rich moment per section.** Chrome (nav, buttons, text) uses the neutral ramp and one accent; the stage, plate or drawing carries the colour.
5. **Honest without badges.** No status pills on cards. What is live, built and next is said once, plainly, in "What works today", and a simulation is called a simulation in the sentence where it appears.
6. **Real data only.** Numbers on the page come from the chain or from recorded runs (`site/data/proof.json`). No illustrative figures presented as real.

## 3. Colour

Two ramps from one tinted neutral (a cool green-grey), one accent per ramp, and three signal colours used only for meaning.

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#eef0ec` | Light page background |
| `--card` | `#f7f8f5` | Raised surface on the light page, alternate section background |
| `--raised` | `#e3e6e0` | Inset control track (the room switch) |
| `--ink` | `#15181a` | Primary text |
| `--ink-2` | `#4a5250` | Secondary text, body copy in cards |
| `--ink-3` | `#5f6764` | Muted text, captions, kickers |
| `--line` | `rgba(21,24,26,0.10)` | Hairline borders on light |
| `--lake` | `#1f5f5b` | The accent on light: links, step labels, focus ring, drawing strokes |
| `--dusk` | `#0f1416` | Dark stage and dark section background |
| `--dusk-card` / `--dusk-raised` | `#151b1e` / `#1d2427` | Panels and controls on dark |
| `--d-1` / `--d-2` / `--d-3` | `#e9ece8` / `#a6aeab` / `#858d8a` | Primary, secondary, muted text on dark |
| `--d-line` | `rgba(233,236,232,0.10)` | Hairlines on dark |
| `--d-lake` | `#7cc4b8` | The accent on dark: the room, allowed payments, focus ring |
| `--glow` | `#d9824a` | Signal: the agent, a member's own share, injected input |
| `--deny` | `#e0675a` | Signal: refused, struck through |

**Measured contrast (WCAG 2.2, all at or above AA 4.5:1 for text):**

| Pair | Ratio | Pair | Ratio |
|---|---|---|---|
| ink on paper | 15.55 | d-1 on dusk | 15.57 |
| ink-2 on paper | 7.01 | d-2 on dusk | 8.18 |
| ink-3 on paper | 5.07 | d-3 on dusk | 5.45 |
| ink-3 on card | 5.46 | d-3 on dusk-card | 5.11 |
| lake on paper | 6.43 | d-lake on dusk | 9.23 |
| lake on card | 6.92 | glow on dusk | 6.40 |
| dusk on d-1 (light button) | 15.57 | deny on dusk | 5.53 |

Focus ring: `--lake` on light (6.43:1), `--d-lake` on dark; measured 5.31:1 on screen against the translucent header, anti-aliased edge included.

**Do not:** hue gradients on surfaces, gradient text, coloured glows on chrome, neon borders, more than one accent per ramp. Radial light is allowed only inside a stage, behind the object it lights.

## 4. Type

| Role | Family | Size | Weight | Notes |
|---|---|---|---|---|
| Display (h1) | Newsreader | `clamp(40px, 6.6vw, 84px)` / 1.02 | 300 | tracking −0.03em; a `<br>` with a space before it, hidden under 760px |
| Section title (h2 `.title`) | Newsreader | `clamp(32px, 4.4vw, 52px)` / 1.08 | 300 | max 22ch; words rise in on reveal |
| Chapter title | Newsreader | `clamp(28px, 3vw, 36px)` | 300 | |
| h3 | Newsreader | 24px / 1.2 | 400 | |
| Lede | Geist | 18-20px / 1.6 | 400 | max 38rem |
| Body | Geist | 16px / 1.55 | 400 | |
| Small, card body | Geist | 14px / 1.6 | 400 | |
| Kicker, caption, label, data | Geist Mono | 12-14px | 400 | sentence case, no tracking |

- Scale tokens: `--t-12 14 16 18 20 24`, plus the fluid display sizes. 12 distinct sizes on the page at desktop, 10 on a phone (measured).
- Weights 300, 400, 500 only. Hierarchy from size and colour, not weight.
- Sentence case everywhere. No uppercase labels with wide tracking. No italic for emphasis.
- Headlines, labels, buttons and captions have no trailing period; paragraphs do.
- Numbers use tabular figures (`font-variant-numeric: tabular-nums` on `body`) and `toLocaleString('en-US')`.
- Fonts load from Google Fonts with `display=swap`. Newsreader is requested **without** its optical-size axis (latin file 58 KB instead of 132 KB).

## 5. Space, radius, layout

- **4px grid.** Every margin, padding and gap is a multiple of 4 (15 distinct spacing values on the page, measured). Space inside a group is smaller than space between groups.
- **Section padding:** `clamp(80px, 11vw, 144px)` top and bottom. **Gutter:** `clamp(16px, 4vw, 40px)`. **Content width:** 1240px.
- **Grids:** `.grid-2/3/4/5`, gap 20px, collapsing at 1080 / 820 / 520px. Chapters: 5fr text, 7fr stage, gap `clamp(32px, 5vw, 80px)`, sides alternating. Splits: 5fr / 6fr.
- **Radius, nested:** cards 16px with 8px padding, so a stage inside a card is 8px; stages 12px (16px when large); buttons and controls 8px; the switch track 12px with an 8px highlight inside 4px of padding; pills 999px only for the live chain chip.
- **Depth:** hairlines and surface steps, no drop shadows on the light page.

## 6. Motion

One easing curve for movement, one press curve, one sampled spring for release.

| Token | Value | Use |
|---|---|---|
| `--ease` | `cubic-bezier(0.22, 1, 0.36, 1)` | Entrances, colour changes, fades |
| `--press` | `cubic-bezier(0.2, 0, 0, 1)` | The press of a button |
| `--spring` | `linear(...)`: stiffness 500, damping 32, mass 1, about 4% overshoot, sampled over 500 ms | Release after a press; moving the switch highlight; markers appearing |

| Interaction | Spec |
|---|---|
| Press (buttons, copy, menu, switch) | `scale(0.97)` in 100 ms on `--press`; release on `--spring` over 500 ms |
| Hover (fine pointers only) | lift `translateY(-1px)` in 160 ms |
| Magnetic primary button | label layer moves up to 4px toward the pointer (strength 0.12); the hit area never moves |
| Section reveal | opacity 0→1 and 12px rise, 320 ms; grid siblings 40 ms apart, capped at 160 ms; runs once |
| Section title words | each word rises in 280 ms, 30 ms apart, the line within 500 ms; the intact text stays the accessible name |
| Kicker | decodes from hex characters to the label in 700 ms (the signature) |
| Phone menu | enters with fade and 8px rise in 240 ms; exits with a 140 ms fade |
| Section jump | 220 ms crossfade with View Transitions where supported; a normal jump otherwise |
| Steps rail | fills with reading progress through the three chapters; markers turn on at each step |
| Hero image | drifts at most 20px with scroll |
| Live 3D arrival | crossfades in over 600 ms on its first drawn frame |
| Line drawings | stroke draws in over 1400 ms (faint edges 240 ms later); numbered markers pop in on the spring after 900 ms |

**Transitions name their properties** (`transform`, `opacity`, `background-color`, `border-color`, `color`, `clip-path`). Never `transition: all`, never width/height/top/left.

**Reduced motion** (`prefers-reduced-motion: reduce`): no transforms, no scroll-linked effects, no magnet, no word splitting, drawings appear fully drawn, the menu has no animation, the canvas stages draw one still frame each, and the three.js module is never downloaded.

## 7. Components

Each lives in `site/index.html` (markup), `site/styles.css` (style) and `site/main.js` (behaviour).

| Component | What it is for | Key rules |
|---|---|---|
| **Header and nav** | Brand, section links, one button | Dark and translucent over dark zones, light and blurred over the page (`.on-light`, switched by scroll position). Nav links 32px tall; under 900px they collapse into a Menu button with 44px rows. The header button stays outlined while the hero is on screen so the hero's button is the only filled one. |
| **Buttons** | `.btn-light` (filled, the primary on dark), `.btn-ghost-dark` (outlined), `.btn-head`, `.btn-sm`, `.btn-magnet` | 48px (36px small), radius 8, one primary per screen. Busy state: `aria-busy` and a label change ("Checking…"); done state: a lake border. |
| **Card / mini** | A unit of content on the light page | 16px radius, 8px padding, text inset 16px; a stage inside sits at radius 8. |
| **Stage** | A dark frame that plays one scene | `.stage` + size (`-xs` 4:3, `-sm` 16:10, `-md` 16:9, `-lg` 4:3, `-xl` 5:4) with a `<canvas data-scene>`; wrapped in `.stage-fig` with a mono `.stage-cap` caption below (never on top of the scene). |
| **Chapter** | One step of "How it works" | Plate, step label ("1 · The room"), title, one or two short paragraphs; the stage on the other side. |
| **Plate** | A rendered object that opens a chapter | WebP with alpha from Cycles, 280px wide, radial mask so the shadow fades into the page. |
| **Room switch** | Choosing between the two ways the room runs | A segmented control whose highlight is one element moved with `clip-path` on the spring (nothing is scaled, corners stay round). Pinning a choice holds the stage on it; choosing it again releases it. |
| **Steps rail** | Where you are in the three steps | A 1px line beside the chapters that fills with scroll; numbered markers. Hidden under 1360px. |
| **Drawing** | A technical line drawing of one piece | Inline SVG from Blender, strong strokes in `--lake` where the key points, faint strokes muted; numbered markers on the drawing and a numbered key in the caption (no floating labels). |
| **Agent console** | A recorded run, replayed as text | Mono 12px on `#0b0f10`; colour by role: input `--glow`, attempt `--d-1`, refused `--deny`, allowed `--d-lake`, notes `--d-3`. Types out once when it comes into view. |
| **Panel and check list** | A live check the reader runs | Dark panel, a list of rows with a status pip, label, detail in mono, and Pass/Fail. Results come from the reader's own browser. |
| **Proof grid** | Every recorded transaction | One 24px (minimum) square per real transaction, coloured by kind, each a link to the explorer with its own accessible name; a skip link before the grid; a legend in plain words. |
| **What works today** | The single honest status | Three plain lists on dark: running on testnet, built but not live, next. |
| **Command block** | Something to run | Dark block, mono 12px, a Copy button that confirms ("Copied"). |
| **Live chain chip** | Proof the page is reading the chain | A pill with a dot that turns lake when the contract answers: "Contract live · N syndicates · block N". |

## 8. Imagery and 3D

**Blender** (5.2.3 LTS, through the Blender Lab MCP server or `blender -b --python`). Scripts in `scripts/blender/`:

| Script | Output | Notes |
|---|---|---|
| `build-site-models.py` | `site/models/{room,nest,tee}.glb` (28, 36, 34 KB) | The Nest and the enclosure are modelled with their thin side on Blender's Y axis, which glTF turns into depth: lay them flat with a 90° X rotation wherever they are used. |
| `render-site-plates.py` | `site/img/plate-{room,rules,exit}.png` | Cycles, CPU, 960×720, 64 samples, denoised, transparent film with a shadow catcher; about 3 minutes each on 2 CPUs. |
| `plates-to-webp.py` | `.webp`, 47-60 KB | PNG masters stay out of git and deploys. |
| `draw-site-wireframes.py` | `site/img/wire-*.svg`, 9-22 KB | Projects mesh edges through a camera; weld vertices first (glTF splits them at hard edges); edges over 38° are strong, the rest faint; exports anchor points for the markers. |
| `render-hero.py` | `site/img/hero.png` → `hero.webp` (36 KB) | The network of rooms over the Nest, rooms in the right half, 1920×1080, 48 samples, about 2 minutes. |

EEVEE does not work on this server (no `libEGL`); use Cycles. The MCP add-on blocks `read_factory_settings`; use `read_homefile(use_empty=True, use_factory_startup=True)`.

**three.js** (0.186.1, bundled and tree-shaken by `scripts/build-site-3d.mjs` to `site/scene3d.js`, 161 KB gzipped):

- One `WebGLRenderer` for the page; its canvas moves into whichever 3D stage is on screen.
- Loaded after the first paint; models are fetched in parallel at parse time; a frame is yielded between heavy steps; shaders compile with `compileAsync`.
- Skipped, with a console message saying why, under reduced motion, on software WebGL (SwiftShader, llvmpipe), with Save-Data, or under 4 GB of device memory. `?3d` forces it.
- The rendered image (hero) or the 2D canvas scene (architecture) is always underneath; the 3D crossfades over it and the fallback returns if the WebGL context is lost.
- Pixel ratio capped at 1.5 (1 on phones) and at 3 M pixels; nothing renders off screen or in a hidden tab.
- Labels are DOM text placed from projected 3D points, never text in the GPU.

**2D canvas stages** (`site/main.js`): each scene is a pure function of time, runs only while on screen, and has a `still` time it draws under reduced motion.

## 9. Writing

- Say it the way you would to a smart friend: "Members decide in private", "Anyone can leave with their share".
- One idea per sentence. Lead with what the reader gets.
- Never: trustless, MEV eliminated, revolutionary, seamless, unlock, supercharge, an unqualified "hardware-secured".
- Always say the condition on the exit ("if the room stops"), that deposits and balances are public on NEAR, and that this is testnet with no audit.
- Members before flyers; a group before a syndicate on first mention ("A group on Midge is called a syndicate").

## 10. Performance and accessibility budgets

| Measure | Budget | Measured (2026-11-05) |
|---|---|---|
| First contentful paint | under 1 s on a warm load | 0.53-0.59 s through the preview tunnel, 0.23 s locally |
| Critical page weight (HTML, CSS, JS, fonts) | under 150 KB compressed | about 130 KB |
| Deferred 3D | under 250 KB compressed | 161 KB bundle + 98 KB models |
| Hero image | under 80 KB | 36 KB |
| Contrast | AA for all text | lowest 5.07:1 |
| Targets | 24px minimum, 32-48px for controls | proof dots 24px, nav 32px, phone menu 44px, buttons 36-48px |
| Horizontal overflow | none at 390px | none |

Checks to run before shipping: the `ux-ui-audit` probes at 1440 and 390 (0 contrast failures, no unnamed or ambiguous links), a reduced-motion pass, a no-WebGL pass, and a phone pass with the menu open and closed.

## 11. Files

| Path | What |
|---|---|
| `site/index.html`, `site/styles.css`, `site/main.js` | The page, the tokens and components, the behaviour and 2D scenes |
| `site/src/scene3d.js` → `site/scene3d.js` | The three.js moments, source and bundle (`npm run build:site`) |
| `site/models/`, `site/img/` | GLB models, plates, drawings, hero |
| `site/data/proof.json` | Real transactions and the security run (`node scripts/build-site-data.mjs`) |
| `scripts/blender/` | Model, render and drawing scripts, and the MCP client |
| `docs/superpowers/specs/2026-11-04-site-design.md` | The direction and the decisions behind this system |
| *(not published)* | The research the motion and 3D choices rest on is kept on the author's machine, not in this repository |
