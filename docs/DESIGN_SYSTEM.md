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
| `--raised` | `#e3e6e0` | Inset control track (no component uses it since the 2026-11 card rebuild) |
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
- Figures use tabular digits (`font-variant-numeric: tabular-nums` on the figure strips, the live chip, the live list, the proof legend and lens, and the footer line; prose keeps proportional digits) and `toLocaleString('en-US')`. NEAR amounts show two to four decimals (`0.00`, `0.05`), never a bare `0`.
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
| Hero image | drifts at most 20px with scroll |
| Live 3D arrival | crossfades in over 600 ms on its first drawn frame |
| Card scene | one 7 s loop per scene, in CSS on static SVG; restarts when its tab is chosen; paused while off screen; tabs never advance on their own |

**Bento motion** (the sections after the hero; plan 2026-11-10-site-bento-direction). Entrances are revealed gradually with scroll: CSS scroll-driven animation (`animation-timeline: view()`) ties each one to its position on screen; where a browser lacks it, `main.js` adds `.in` as the element enters and it plays once. Loops run on the site's 7 s cycle and pause while their section is off screen (`.paused`). Figures count up once on entry (a 600 ms tween in `main.js`; the static text is the final number).

| Class | What moves | Kind |
|---|---|---|
| `mo-rise`, `mo-row`, `mo-slide` | cards, table rows and bid-book rows fade in and rise or slide 8 to 12 px, staggered by `--i` | entrance |
| `mo-flash` | the watcher's row arrives last with one red flash | entrance |
| `mo-draw`, `mo-pop`, `mo-spin` | diagram strokes draw, the lock tile pops on the spring, the trust sparkle turns a quarter | entrance |
| `mo-line`, `mo-bullet` | the uses list's connector draws down; bullets light in turn | entrance |
| `mo-type` | the rules panel appears line by line (a stepped clip) | entrance |
| `mo-strike` | a red strike draws through the refused recipient | entrance |
| `mo-dot` | the 324 proof dots light in recorded order | entrance |
| `mo-tr`, `mo-tr2` | dots travel a diagram's paths (organizer, black box, room, rules, payout, exit) | loop |
| `mo-pulse`, `mo-tick`, `mo-blink` | the lock tile pulses on arrival, the check ticks, the chip's pins blink | loop |
| `mo-breathe` | the status dot of a Live partner | loop |
| `mo-drift`, `mo-flickA`, `mo-flickB` | the light band drifts (40 s), the pixel field flickers in steps | loop |

Keyframes move only transform, opacity, stroke-dashoffset, offset-distance, clip-path, and one background flash; `tests/site-home.test.js` checks it. Under reduced motion every animation in the sections stops at its final frame and travelling dots are hidden.

**Transitions name their properties** (`transform`, `opacity`, `background-color`, `border-color`, `color`, `clip-path`). Never `transition: all`, never width/height/top/left.

**Reduced motion** (`prefers-reduced-motion: reduce`): no transforms, no scroll-linked effects, no magnet, no word splitting, card scenes show their end state, the footer field is drawn once, the menu has no animation, and the three.js module is never downloaded.

## 7. Components

Each lives in `site/index.html` (markup), `site/styles.css` (style) and `site/main.js` (behaviour).

| Component | What it is for | Key rules |
|---|---|---|
| **Header and nav** | Brand, section links, one button | Dark and translucent over dark zones, light and blurred over the page (`.on-light`, switched by scroll position). Nav links 32px tall; under 900px they collapse into a Menu button with 44px rows. The header button stays outlined while the hero is on screen so the hero's button is the only filled one. |
| **Buttons** | `.btn-light` (filled, the primary on dark), `.btn-ghost-dark` (outlined), `.btn-head`, `.btn-sm`, `.btn-magnet` | 48px (36px small), radius 8, one primary per screen. Busy state: `aria-busy` and a label change ("Checking…"); done state: a lake border. |
| **Card / mini** | A unit of content on the light page | 16px radius, 8px padding, text inset 16px; a stage inside sits at radius 8. |
| **Bento section** | One idea, told with components | `.bs` on `--dusk`: a head (kicker, serif title with a grey second half, lede) and a `.bento` grid of 6 columns (2 under 1200 px, 1 under 720 px), gap 12. Cards `.bc` (radius 20, padding 28) in `--dusk-card`, `.bc-raised` (`--dusk-raised`), `.bc-ink` (#0b0f10, for code and tables), `.bc-lake` (the private side of the lens); feature panels radius 28; inner tiles 16; inner panels 12; chips 999. Built static by `scripts/site-sections/render.mjs`. |
| **Diagram** | The mechanism, drawn | Inline SVG `.dg` with strokes and fills from the tokens; dots travel its paths. Two wide diagrams have stacked phone variants (`.dg-wide` / `.dg-narrow`, 300 units, 12-unit labels) so text stays at 11 px or more. |
| **Code and table panels** | What the system really holds | `.panel-head` (mono label, live state), `pre.code` (the rules as the contract returns them, read live), `.tbl` grids that scroll inside their card, never the page. |
| **Figure tile** | A recorded number | Serif 40 to 56 px with a mono caption; every value is a `{figure}` from `scripts/site-scenes/figures.mjs`, with its source sentence checked by a test. |
| **Partner card** | What runs where | Name, role in mono, a status in plain words (Live, Attested not running now, One live signature, Read-only, Not on chain) tied to a quoted figure; only Live breathes. |
| **FAQ topics** | Questions by topic | Four headed groups of native `details`; `main.js` turns them into a WAI-ARIA tablist (arrows, Home, End). |
| **Panel and check list** | A live check the reader runs | Dark panel, a list of rows with a status pip, label, detail in mono, and Pass/Fail. Results come from the reader's own browser. |
| **Proof grid and lens** | Every recorded transaction | One 24px (minimum) square per real transaction, in the HTML, coloured by kind, each a link to the explorer with its own accessible name; a skip link before the grid; a legend in plain words with counts ("Refused by the rules · 36"). The lens below names what anyone can read for the dot pointed at or focused, and what stayed private for that kind of step; the other dots dim. |
| **What works today** | The single honest status | Three plain lists on dark: running on testnet, built but not live, next. |
| **Command block** | Something to run | Dark block, mono 12px, a Copy button that confirms ("Copied"). |
| **Live chain chip** | Proof the page is reading the chain | A pill with a dot that turns lake when the contract answers: "Live · N groups · block N", kept on one line (it fits a 390px phone). The signature detail: the same read-out ends the footer. |
| **FAQ** | Five questions a visitor asks first | A dark card of `details` rows (the first open), a plus that turns to a minus; answers in plain words, each true of the deployed contract. |
| **Footer** | Where to check and build | A card with the name, one line on what Midge is, the contract and its fingerprint (the recorded one at build time, replaced by the one read from NEAR), and three link columns; a mono legal line below. Behind both, a canvas field of dots, one per recorded transaction, lit in the order they happened, densest at the bottom. |

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
- The rendered hero image is always underneath; the 3D crossfades over it and the image returns if the WebGL context is lost.
- Pixel ratio capped at 1.5 (1 on phones) and at 3 M pixels; nothing renders off screen or in a hidden tab.
- Labels are DOM text placed from projected 3D points, never text in the GPU.

**Card scenes** (`scripts/site-scenes/`): pure functions from a small model to SVG text, run at build time; the browser only plays their CSS. The plates (`plate-*.webp`) and line drawings (`wire-*.svg`) from the earlier page are no longer used by it.

## 9. Writing

- Say it the way you would to a smart friend: "Members decide in private", "Anyone can leave with their share".
- One idea per sentence. Lead with what the reader gets.
- Never: trustless, MEV eliminated, revolutionary, seamless, unlock, supercharge, an unqualified "hardware-secured".
- Always say the condition on the exit ("if the room stops"), that deposits and balances are public on NEAR, and that this is testnet with no audit.
- Members before flyers; a group before a syndicate on first mention ("A group on Midge is called a syndicate").

## 10. Performance and accessibility budgets

| Measure | Budget | Measured (2026-11-10, `node scripts/check-site.mjs`, local) |
|---|---|---|
| First contentful paint | under 1 s on a warm load | 148-364 ms across all eight runs (2026-11-10, bento page) |
| Critical page weight (HTML, CSS, JS) | under 150 KB compressed with the fonts | 61 KB gzipped (HTML 44, CSS 9, JS 8) plus the Google fonts, which this rebuild did not change |
| Deferred 3D | under 250 KB compressed | 161 KB bundle + 98 KB models (measured 2026-11-05) |
| Hero image | under 80 KB | 36 KB |
| Contrast | AA for all text, diagram text included | 0 failures in all eight runs |
| Diagram text | 11px or more as rendered, at every width | 12.3px at 1440 and 390; swept 601 to 1280px, lowest 12.3px |
| Targets | 24px minimum, 32-48px for controls | 0 under 24px in all eight runs (inline links in sentences exempt) |
| Footer field | one animation loop, at most 75 draws a second | within budget after 10 resize events; the bitmap follows the footer when the FAQ opens |
| Without main.js | the page falls back to everything stacked | nothing hidden with main.js blocked |
| NEAR not answering | the live parts say so plainly | the rules panel shows its failure text with the RPC blocked; no errors |
| Console errors | none | none |
| Horizontal overflow | none at 390px | none |

`scripts/check-site.mjs` serves `site/` and checks all of the above in Chromium at 1440 and 390 px, with motion, with reduced motion, with JavaScript off and (at 390) with main.js blocked, sweeps the scene text across the widths in between, and saves section screenshots; it exits 1 when a budget fails. Both the contrast and the target checks were seen to fail on a deliberately broken link style. Also run before shipping: a no-WebGL pass and a phone pass with the menu open and closed.

## 11. Files

| Path | What |
|---|---|
| `site/index.html`, `site/styles.css`, `site/main.js` | The page, the tokens and components, the behaviour (tabs, proof lens, footer field, live checks) |
| `site/src/scene3d.js` → `site/scene3d.js` | The three.js moments, source and bundle (`npm run build:site`) |
| `site/models/`, `site/img/` | GLB models, plates, drawings, hero |
| `site/data/proof.json` | Real transactions and the security run (`node scripts/build-site-data.mjs`) |
| `scripts/site-scenes/` | The scene kit, the scenes, the section content and the figures (`kit.mjs`, `scenes.mjs`, `content.mjs`, `figures.mjs`) |
| `scripts/build-site-cards.mjs` | Writes sections 01 to 05, the proof dots and the FAQ and footer into `site/index.html` (`npm run build:site`) |
| `scripts/check-site.mjs` | The browser checks in §10 |
| `scripts/blender/` | Model, render and drawing scripts, and the MCP client |
| *(not published)* | The direction and decisions behind this system are in a design spec kept on the author's machine |
| *(not published)* | The research the motion and 3D choices rest on is kept on the author's machine, not in this repository |
