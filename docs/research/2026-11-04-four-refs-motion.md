# How Thayon, Agentcard, HIFI and Airloom handle 3D, motion and generated content

*Measured 2026-11-04 by loading each live page in Chromium (1440x900), scrolling it, and recording videos, canvas contexts, animation libraries, image formats and network weight; plus A1 Gallery tags. Headless numbers can differ from a normal browser (for example video metadata loads lazily, and WebGL runs in software).*

| | Thayon (thayon.com) | Agentcard (agentcard.sh) | HIFI (hifibridge.com) | Airloom (airloom.energy) |
|---|---|---|---|---|
| Built with | Framer, Lenis smooth scroll | Next.js | Next.js, Lenis | Next.js |
| 3D | Pre-rendered: iridescent glass objects in looping video inside the case-study cards | Live WebGL: 10 WebGL contexts (8 webgl2, 2 webgl) and 44 2D contexts; two full-viewport canvases; rendered 3D "toy" icons as images in the margins | None live; glow-horizon backgrounds and ASCII/unicode art as video | Pre-rendered: the turbine as photoreal renders and as a white wireframe drawing, in video |
| Video | 2 autoplay, muted, looping (webm 385 KB hero gradient 1280x720, mp4 957 KB) | none | 3 autoplay loops: 1.2 MB, 426 KB, 8.2 MB (11 MB of media in total) | 10 videos streamed as blobs; 3 autoplay loops, the rest start paused (played as you reach them) |
| Diagrams | Hairline grid, quiet | Partner network as cards joined by lines | Line-art micro diagrams (inflows, controls, outflows, tokenization) with a single accent | Technical roadmap, wireframe drawings |
| Motion handling | 0 reduced-motion rules found | 33 reduced-motion rules, 22 running animations | 3 reduced-motion rules, 25 running animations | 0 reduced-motion rules found |
| Weight observed | 1.3 MB media | 2.0 MB images | 11 MB media, 198 KB script | 1.6 MB images, 177 KB script |
| First screen | Centered serif headline over a soft gradient video | A full-screen blue logo intro, still showing ~7 s after load in headless Chromium | Big type with one yellow accent over a dark glow video | Big type, then a large product render |

## What they have in common

1. **The 3D is the product's own object, rendered well, one per section.** A turbine, a payment card, a glass prism next to a placement. Not abstract decoration.
2. **Three of four ship 3D as pre-rendered video or images**, made in a 3D tool, not live WebGL. Only Agentcard renders live, and it pays for it with ten WebGL contexts.
3. **A technical line-drawing language explains the mechanism**: Airloom's wireframe turbine, HIFI's line diagrams. Rich renders for the object, thin lines for how it works.
4. **Chrome stays quiet** (monochrome, one accent), so the rendered object carries the color.
5. **Weak spots**: two of four have no reduced-motion handling; HIFI moves 11 MB of video; Agentcard holds the visitor on an intro screen.

## What this means for Midge

- Use Blender for **rendered object moments**: the room (a sealed vault), the Nest, the TEE enclosure, rendered as stills or short loops, one per section where the object is the subject.
- Keep **live three.js only where the content is live or interactive**: the hero network (it reads the real syndicate count) and the architecture flow. One WebGL context for both, not ten.
- Draw mechanisms as **wireframe and line**, in the instrument style, from the same Blender models (edges), so the renders and the diagrams match.
- Keep what they skip: reduced-motion fallbacks, a small media budget, no intro screen.
