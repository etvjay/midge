---
name: midge-design
description: Use when changing anything a visitor sees on the Midge site (site/index.html, styles.css, main.js, src/scene3d.js, models, images, page copy), adding a section, stage, 3D scene, rendered image or drawing, or checking the site before a deploy. Applies the Midge design system in docs/DESIGN_SYSTEM.md and runs its checks.
---

# Midge design

The source of truth is `docs/DESIGN_SYSTEM.md`. Read the sections that touch your change before editing; this skill is the working procedure around it.

## Before you change anything

1. Read `docs/DESIGN_SYSTEM.md` §1-2 (direction, principles) and the section for what you are touching (colour §3, type §4, space §5, motion §6, components §7, imagery and 3D §8, writing §9).
2. Look at the page as a visitor first: serve `site/` (never with `.env.local` or `.vercel/` reachable; serve a copy of the public files) and screenshot it at 1440 and 390.

## Rules that are easy to break

- **Plain words.** No TEE, attestation, nonce, policy hash or hatch_out on the page or inside a stage. Say what happens to the member's money and decision.
- **No status badges.** Honesty lives in the "What works today" list and in the sentence itself ("as simulations today").
- **Motion explains one thing.** Each stage shows one mechanism. No tickers, cursor followers, grain, sounds or breathing glows on static things.
- **Static first.** The page must work with no JavaScript, no WebGL and reduced motion. New motion needs a reduced-motion rule; a new scene needs a `still` time.
- **Tokens only.** Colours from §3, sizes from the type scale, spacing on the 4px grid, radii nested, transitions on named properties with `--ease`, `--press` or `--spring`.
- **One primary button per screen.** Captions go under a stage, never on top of it.
- **Real data only.** Numbers come from the chain or `site/data/proof.json`.
- **3D:** one renderer for the page, started after first paint, skipped on software WebGL, Save-Data, low memory and reduced motion; something useful (a rendered image or a 2D scene) is always underneath. Labels are DOM text.
- **Blender:** the Nest and the enclosure lie flat only after a 90° X rotation; render with Cycles (EEVEE does not run here); keep PNG masters out of git and deploys.

## After a change

1. Rebuild what you touched: `npm run build:site` (proof data and the 3D bundle); Blender assets with the scripts in `scripts/blender/` (see §8 for commands and timings).
2. Check in a browser at 1440 and 390, with motion and with `reducedMotion: 'reduce'`, and once with `?3d`:
   - no console errors, no horizontal overflow;
   - the `ux-ui-audit` probes: 0 contrast failures, no unnamed or ambiguous links, targets at least 24px;
   - the first paint still under 1 s on a warm load (see §10 for how it was measured);
   - focus visible on light and dark, the phone menu opens and closes, section links land under the header.
3. If a token, component, motion value or budget changed, update `docs/DESIGN_SYSTEM.md` in the same commit, with the measured number.
4. Commit separately per concern; push and deploy only with the user's explicit approval.
