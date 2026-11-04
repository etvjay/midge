# Framer and Motion: click weight, vibrancy, transitions, micro-interactions

*Parallel deep research (processor pro), run `trun_37d915c657c54d3ba851085475b9344c`, 2026-11-04. Values in the last table are design recommendations from the research, not measured Framer defaults. Third-party content: verify before relying on any figure.*

## Executive summary

- **Make Input Immediate, Recovery Expressive**: Nielsen's classic guidance places perceived instantaneous response at about **100 ms**. A weighty button should acknowledge the press immediately, then recover with a restrained spring - not postpone the action until an animation finishes. [executive_summary[0]] [27]
- **Specify Springs Explicitly**: Motion's documentation and current source disagree on important defaults: the documentation lists **stiffness 1**, while the spring generator source uses **100**. Set your parameters explicitly rather than copying an assumed "Framer default." [executive_summary[1]] [11][executive_summary[2]] [25]
- **Use Continuity, Not Constant Movement**: Motion's `layoutId` connects elements across layouts, while Framer Page Effects use the **View Transitions API** for navigation. Borrow those two distinct ideas: preserve the identity of an object, and make changes of context legible. [executive_summary[3]] [20][executive_summary[4]] [28]
- **Borrow The Hierarchy Of Award Winners**: Framer's **2025** awards recognize Bogdan Skripka for small interaction details, Analogue Agency's Panton site for animation and scrolling, and 27b's Elle Fanning experience for storytelling. These are different motion jobs, not one universal aesthetic. [executive_summary[5]] [16]
- **Treat Native APIs As Enhancements**: Safari's same-document View Transitions arrive in **18.0**, with cross-document transitions in **18.2**. Scroll-driven animations have a different compatibility profile. Keep navigation and reading fully functional without either. [executive_summary[6]] [23][executive_summary[7]] [18]
- **Choose The Smallest Sufficient Animation Layer**: Motion's `animate` page advertises **3.2 kb mini** and **22 kb hybrid**, but another official comparison gives older/different figures. Do not treat marketing sizes as a version-matched bundle audit. CSS and WAAPI are enough for most of this site's interaction language. [executive_summary[8]] [15][executive_summary[9]] [7]
- **Do Not Make Haptics A Dependency**: `navigator.vibrate()` requires user activation, has limited availability, and does nothing without supported hardware. A click must feel complete through visual state alone. [executive_summary[10]] [2]
- **Keep The Editorial Surface Quiet**: Framer agency ++hellohello distinguishes a chaptered reading experience from an animation-heavy festival campaign. Follow that separation: calm typography and navigation, concentrated vibrancy inside explanatory stages. [executive_summary[11]] [1]

**Scope and date:** Research assessed **November 4, 2026**. The dated evidence below distinguishes 2025 award work, 2026 product/site material, and older foundational releases. **All proposed scales, timings, colors, and motion limits are design recommendations, not measurements of Framer's homepage**, unless explicitly described otherwise.

## 1 spring defaults set the physics not the brand

### Physics and duration easing solve different problems

For an ideal spring, the displacement from its target follows:

```text
m*x'' + c*x' + k*x = 0

k = stiffness
c = damping
m = mass
```

A duration/easing animation answers, "Where should this value be at this fraction of the allotted time?" A spring answers, "How should this object respond to displacement and velocity?" Motion exposes both physical controls and a duration-oriented spring interface; its documentation states that physical parameters override `bounce` and `duration`. Setting `visualDuration` overrides `duration`. [1_spring_defaults_set_the_physics_not_the_brand[0]] [11]

That distinction matters for interruption. A pointer can leave a button before its hover animation finishes; a card can change destination halfway through a transition. A spring is useful when the object should redirect naturally. A fixed-duration easing is useful when several editorial elements must finish together.

### Actual published defaults, including the documentation/source disagreement

| Parameter | Motion documentation | Current spring-generator source | Implication |
|---|---|---|---|
| `stiffness` | **1** | **100** | Do not leave it implicit. |
| `damping` | **10** | **10** | Specify a higher value for a restrained UI spring. |
| `mass` | **1** | **1.0** | Use mass deliberately, not as a synonym for duration. |
| `bounce` | **0.25** | **0.3** in source defaults | Different published surfaces do not establish one universal default. |
| Spring `duration` | Low-level `spring()`: **800 ms** | **800 ms** | Low-level generator units differ from transition-object units. |
| `visualDuration` | Optional; no default stated in the cited documentation | **0.3 s** in source defaults | This is a perceptual coordination control, not necessarily the final settling time. |
| `restSpeed` | **0.1** | **0.01** for small deltas; **2** otherwise | Termination is sensitive to the animated value's scale. |
| `restDelta` | **0.01** | **0.005** for small deltas; **0.5** otherwise | A scale animation and a pixel translation need not stop at identical tolerances. |
| Initial velocity | Current value velocity | Implementation-dependent initialization | Preserve continuity when redirecting an animation. |

Documentation values: [1_spring_defaults_set_the_physics_not_the_brand[1]] [9][1_spring_defaults_set_the_physics_not_the_brand[0]] [11]. Source values and the small-delta distinction: [1_spring_defaults_set_the_physics_not_the_brand[2]] [25].

**Takeaway:** These are defaults at different API and implementation layers, not a stable visual specification. Pin the library version and supply explicit settings.

The transition documentation separately gives a duration default of **0.3 s**, or **0.8 s** with multiple keyframes. Do not confuse that with the low-level spring generator's **800 ms** default. [1_spring_defaults_set_the_physics_not_the_brand[0]] [11][1_spring_defaults_set_the_physics_not_the_brand[1]] [9]

### Recommended editorial presets

These are starting points to tune against your actual button dimensions and travel distances:

| Use | Explicit physics preset | Duration-oriented alternative |
|---|---|---|
| Button release | `stiffness: 500, damping: 32, mass: 1` | `visualDuration: 0.22, bounce: 0.08` |
| Hover lift returning to rest | `stiffness: 360, damping: 30, mass: 0.8` | `visualDuration: 0.24, bounce: 0.04` |
| Card/shared-object relocation | `stiffness: 300, damping: 30, mass: 1` | `visualDuration: 0.38, bounce: 0.05` |
| Large object in a dark stage | `stiffness: 220, damping: 28, mass: 1` | `visualDuration: 0.5, bounce: 0` |
| Text, opacity, coordinated UI | Prefer duration easing | **160-320 ms**, `cubic-bezier(.2,.8,.2,1)` |

Choose **one spring configuration style per animation**. Passing both physical parameters and a desired visual duration creates misleading expectations because the physical controls take precedence. [1_spring_defaults_set_the_physics_not_the_brand[0]] [11]

For this site, keep most springs in the proposed range **stiffness 220-500**, **damping 28-36**, **mass 0.8-1.2**, or use **bounce 0-0.12** with explicit visual duration. Larger, slower objects should gain weight through travel and timing rather than conspicuous oscillation.

**Decision:** Use springs for direct manipulation and recovery; use duration easing for reading rhythm and coordinated reveals.

## 2 weighty clicks acknowledge in 100 ms then settle

### Case study: Bogdan Skripka's small details

Framer's 2025 awards describe Bogdan Skripka's Best Interactions-winning portfolio as full of "small, thoughtful details that make the site feel alive." That supports studying the relationship between interaction and state, not assuming every successful button needs a dramatic bounce. The awards page does not publish his button scale, press duration, or spring parameters. [2_weighty_clicks_acknowledge_in_100_ms_then_settle[0]] [16]

For an editorial explainer, translate that principle into a short causal sequence: **contact -> compression -> action/state change -> recovery**. The compression says the control received input; the new state says what happened; the recovery restores its resting material.

### A complete click recipe

| Phase | Proposed values | Purpose and caution |
|---|---|---|
| Pointer down | Scale **0.97**, over **100 ms** | A useful midpoint within **0.95-0.98** and **80-120 ms**. Start immediately. |
| Surface compression | Reduce shadow offset, darken or fill by one state step | Reinforce contact without moving surrounding layout. |
| Activation | Execute normal `click` behavior without awaiting animation | Do not turn animation into artificial latency. |
| Release | Spring **500 / 32 / 1** | Recover promptly, with little visible overshoot. |
| Persistent result | Selected fill, checkmark, label, or changed content | Feedback should survive after the transient animation ends. |
| Optional ripple | Opacity **0.14 -> 0**, **280 ms** | Keep within the control; omit if fill/state change already communicates enough. |
| Optional audio | **15-25 ms** soft tick, user-enabled | Avoid unsolicited sound or audio on every navigation action. |
| Optional vibration | `navigator.vibrate(8)` | An enhancement only; hardware and browser behavior vary. |

The values in this table are proposed tokens, not experimentally established perceptual thresholds. In particular, **80-120 ms describes the press animation's completion time, not a delay before showing any feedback**.

### `whileTap` is a target, not a built-in material

Motion's documentation demonstrates `whileTap={{ scale: 0.9, rotate: 3 }}`. That is an example, not the default scale. `whileTap` supplies the active gesture's target; it does not automatically make every control shrink. [2_weighty_clicks_acknowledge_in_100_ms_then_settle[1]] [29]

For your calmer site, **0.97** is preferable to copying **0.9** indiscriminately. Very large controls and text-heavy cards may need **0.985-0.99** to avoid visibly compressing their typography.

Motion also integrates gestures with keyboard behavior: Enter starts and ends its tap interaction, and a draggable child cancels tap after pointer travel exceeds **3 px**. A vanilla implementation should likewise distinguish pressing, dragging, cancelling, and activating rather than treating every pointer release as a successful click. [2_weighty_clicks_acknowledge_in_100_ms_then_settle[1]] [29]

### Latency, optimistic UI, and the Doherty threshold

Nielsen's original **1993** guidance identifies approximately **0.1 s** as instantaneous-feeling response and **1 s** as the boundary for uninterrupted thought. These are useful historical heuristics, not guarantees for every interaction. [2_weighty_clicks_acknowledge_in_100_ms_then_settle[2]] [27]

The commonly cited **400 ms Doherty threshold** is a responsiveness/productivity concept, not a recommended button animation duration. An IBM presentation repeats the 400 ms interpretation, but also contains an inconsistent "0.4ms" notation; it should not be used to justify waiting 400 ms before acknowledging a press. [2_weighty_clicks_acknowledge_in_100_ms_then_settle[3]] [24]

For local tabs, explanations, and stage changes, update state immediately. For remote actions, show pending intent immediately but distinguish it from confirmed success; optimistic UI needs a visible failure/retry path. For destructive or irreversible actions, do not animate an unconfirmed success.

**Decision:** Make the first response fast and the final state unmistakable. Weight comes from coherent resistance and recovery, not slowness.

## 3 translate framer s effects into a small vanilla system

Framer exposes visual controls; Motion exposes animation primitives. Your static site needs the underlying mechanisms, not either product's full interaction model.

### Mechanism-to-implementation map

| Effect | Framer/Motion mechanism | Static-site equivalent | Proposed editorial envelope |
|---|---|---|---|
| Hover | `whileHover` target | `:hover` under a fine-pointer media query | Lift **1-2 px**, **160 ms**; avoid scaling text blocks. |
| Press/tap | `whileTap` target and gesture lifecycle | Semantic button plus `:active`; pointer handlers only for advanced behavior | Scale **0.97**, **100 ms**, spring release. |
| Drag | Pointer displacement, constraints, elasticity, momentum | Pointer Events, pointer capture, constrained transform | Use only for genuinely manipulable objects; provide buttons/keyboard alternatives. |
| Layout animation | `layout` measures size/position changes | FLIP: First, Last, Invert, Play | **280-400 ms**, nearly no bounce. |
| Shared element | Matching `layoutId` | View Transition names or a FLIP overlay | Preserve an object's identity across explanation states. |
| Exit animation | `AnimatePresence` retains an exiting React element | Animate with WAAPI, then remove | Exit **120-180 ms**, entrance **220-320 ms**. |
| Scroll-linked progress | `useScroll`/scroll motion values | `animation-timeline: scroll()` or Motion `scroll()` | Progress bar or bounded stage state. |
| Entering viewport | Appear/scroll-trigger effects | IntersectionObserver or Motion `inView()` | Opacity plus **12 px** travel, **320 ms**, once. |
| Split/reveal text | Split into line/word/character units | Wrapped spans and clipping masks | Line/word stagger **25-40 ms**; total headline budget about **500 ms**. |
| Scramble | Repeated intermediate glyph substitution | Short, bounded text replacement | **250-350 ms**, labels only; never paragraphs. |
| Magnetic button | Pointer-relative attraction plus spring return | Cached bounds, normalized pointer offset, transform | Maximum displacement **4 px**, strength **0.12**. |
| Cursor follower | Pointer sample plus interpolation | Fixed, non-interactive overlay updated in one animation loop | **8-12 px** marker; **80-120 ms** equivalent lag. |
| Ticker/marquee | Repeated content moving continuously | Duplicated track, linear transform | **20-30 px/s**, pause controls, no essential text. |
| Parallax | Different displacement rates versus scroll | Scroll timeline or progress-to-transform mapping | Background travel **16-24 px** inside a clipped stage. |

The React layout mechanisms and gesture behavior are documented by Motion. Framer's **November 13, 2025** Ticker Effect release adds breakpoint-specific settings, draggable support, and automatic orientation detection. Magnetic buttons also exist as marketplace components; they should not be mistaken for a universal built-in Framer behavior. [3_translate_framer_s_effects_into_a_small_vanilla_system[0]] [20][3_translate_framer_s_effects_into_a_small_vanilla_system[1]] [29][3_translate_framer_s_effects_into_a_small_vanilla_system[2]] [22]

**Takeaway:** Give each effect a job. A ticker conveys a stream; a shared element conveys continuity; a reveal establishes hierarchy. They are not interchangeable decorations.

### Layout and exits: preserve identity and lifecycle

Motion's `layout` animates layout changes through transforms; `layoutId` connects distinct elements, and `layoutScroll` accounts for a scrollable container's offset. The documented layout animations are interruptible. [3_translate_framer_s_effects_into_a_small_vanilla_system[0]] [20]

For a static explainer, consider a diagram card that becomes the detail panel. FLIP measures its old rectangle, changes the DOM, measures the new rectangle, applies the inverse transform, and animates that transform back to identity. Batch all measurements before writes. Avoid scaling a large block of body text; animate a surrounding surface or a visual proxy instead.

`AnimatePresence` is a React lifecycle facility: it enables `exit` animation before a removed component disappears. The equivalent vanilla requirement is simply **do not remove the DOM node until its exit completes**. [3_translate_framer_s_effects_into_a_small_vanilla_system[3]] [14]

```js
async function dismiss(panel) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) {
    await panel.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 140, easing: 'ease-out', fill: 'forwards' }
    ).finished;
  }
  panel.remove();
}
```

Move focus appropriately before removing an active dialog or panel. For frequently toggled elements, retaining the node and changing visibility may be simpler than repeatedly creating and destroying it.

### Text and gesture defaults that are easy to miscopy

Motion documents `drag: false`, `dragElastic: 0.5`, `dragMomentum: true`, and false defaults for direction locking, propagation, and snapping to origin. Those are library settings, not recommendations for an editorial page. [3_translate_framer_s_effects_into_a_small_vanilla_system[4]] [8]

Disable momentum for precise explanatory controls; make a freely draggable three.js object a separate interaction mode. Do not combine a draggable card with a highly sensitive navigation click target.

For split text, preserve one intact accessible string and hide decorative fragments from assistive technology. Do not scramble a live region or repeatedly replace text while somebody is reading it. Reserve text effects for short headings and state labels; body copy should arrive ready to read.

**Decision:** Implement a small reusable vocabulary - press, reveal, relocate, exit, progress - before adding bespoke effects.

## 4 framer s 2025 2026 examples borrow structure not unmeasured timings

### What the dated evidence actually establishes

| Date or period | Example | Established finding | Useful transfer |
|---|---|---|---|
| **2025 awards** | Bogdan Skripka, `bohdan.design` | Best Interactions; thoughtful small details | Invest in state and control feedback. |
| **2025 awards** | Analogue Agency, `panton.vitra.com` | Best Animations; praised for its scrolling feel | Let motion support an object/product narrative. |
| **2025 awards** | 27b, Elle Fanning for i-D | Best Storytelling | Organize motion around narrative beats. |
| **2025 awards** | Matthias Mentasti, `temper.studio` | Best Visual Design | Treat composition as distinct from animation volume. |
| **October 2025** | Superlocal Design Festival | Awwwards Site of the Day, according to Framer's agency case study | Expressive campaign motion can suit an expressive subject. |
| **June 16, 2026** | Framer 3.0 | Agents, Branching, Community, and an all-new design | Distinguish product redesign evidence from motion measurements. |
| **November 4, 2026 page material** | Framer homepage | Agent -> editable canvas -> publishing narrative | Build explanatory stages around visible transformations. |

Award categories and descriptions: [4_framer_s_2025_2026_examples_borrow_structure_not_unmeasured_timings[0]] [16]. Superlocal: [4_framer_s_2025_2026_examples_borrow_structure_not_unmeasured_timings[1]] [1]. Framer 3.0: [4_framer_s_2025_2026_examples_borrow_structure_not_unmeasured_timings[2]] [19]. Homepage: [4_framer_s_2025_2026_examples_borrow_structure_not_unmeasured_timings[3]] [4].

These examples establish recognition and design intent. They do **not** establish conversion uplift, universally superior usability, or particular press/spring values.

### Case study: Framer's own 2026 homepage

The retrieved homepage identifies Framer as "the pro website builder with a world-class design agent." Its product narrative includes **"Start with the agent," "Refine on the canvas," and "Publish complete sites instantly."** The text explicitly describes adjusting type, components, breakpoints, and effects on an editable canvas. [4_framer_s_2025_2026_examples_borrow_structure_not_unmeasured_timings[3]] [4]

The transferable technique is **showing a transformation rather than merely naming a capability**. For your explainer, a dark stage can show an object entering, being modified, and reaching a final state while the surrounding article remains stable. A section transition should mark a conceptual change, not simply announce that the visitor scrolled another screen.

The cited homepage material does not disclose measured button scale, spring parameters, gradient stops, grain opacity, section-transition duration, or frame rate. Nor does this source set establish a reliable historical 2025 homepage animation audit. Those values should not be presented as "what Framer uses."

### Case study: ++hellohello separates reading from campaigning

Framer's **November 3, 2026** story describes ++hellohello's AI in Design 2026 report as a chaptered reading experience with clear data visualization. It contrasts that with the colorful, animation-heavy Superlocal Design Festival campaign. The agency reports a largest launch above **150,000 visitors** and more than **10** shipped Framer sites, but the article does not isolate animation as the cause of those outcomes. [4_framer_s_2025_2026_examples_borrow_structure_not_unmeasured_timings[1]] [1]

That contrast is directly relevant: **an editorial report and a festival campaign should not share the same motion density**. Borrow Superlocal's permission to be vivid inside a demonstration; borrow the report's reading structure everywhere else.

### Vibrancy without visual slop

For your site, I recommend a deliberately narrow material system:

- **Reading canvas:** warm near-white `#F4F1EA`, near-black text `#191A1C`.
- **Motion stage:** `#101318`, raised surfaces `#1B212A`, primary text `#F2F5F7`.
- **Semantic accents:** cyan `#7DD3FC` for active/explanatory state; amber `#FBBF24` for a distinct comparison or caution. Validate actual contrast in context.
- **Light:** one radial highlight attached to the important object, not an independently wandering background.
- **Gradients:** express depth, energy, or direction. Do not use unrelated gradients merely to fill empty space.
- **Grain:** optional static texture at **0.02-0.035 opacity**; no animated noise over text.
- **Motion density:** one dominant moving object per visible stage; no perpetual decorative movement in reading sections.

These are proposed art-direction tokens. The underlying lesson from the cases is that vibrancy works best when composition, subject, and motion density agree.

**Decision:** Borrow Framer's demonstrated storytelling structure; develop your own restrained material and timing specification.

## 5 native apis continuity without a framework

### Same-document and cross-document transitions are different tools

Framer Page Effects use the View Transitions API and provide whole-site or route-specific effects, including masking presets such as **Wipe, Inset, and Blinds**. The original release is **November 23, 2023**, not 2026; newer page metadata must not be confused with the feature's launch. [5_native_apis_continuity_without_a_framework[0]] [28]

For one HTML document, wrap a synchronous DOM change:

```js
function changeStage(updateDOM) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !document.startViewTransition) {
    updateDOM();
    return;
  }
  document.startViewTransition(updateDOM);
}
```

For separate, same-origin HTML pages, opt both documents into cross-document transitions:

```css
@view-transition {
  navigation: auto;
}

.stage-object {
  view-transition-name: stage-object;
}

::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 220ms;
  animation-timing-function: cubic-bezier(.2,.8,.2,1);
}
```

Use a shared name for a genuinely corresponding object, with only one matching element per document state. Keep normal links; do not replace ordinary navigation with a home-grown router solely to obtain a fade.

### Compatibility evidence as of this research

| Capability | Chromium evidence | Safari evidence | Firefox evidence / qualification |
|---|---|---|---|
| Same-document View Transitions | Chrome **111**, per Google's October 8, 2025 report | Safari **18.0** | That report targets Firefox **144**, stable October 14, 2025; its wording is prospective. |
| Cross-document View Transitions | Google reports shipping them in **2024** | Safari **18.2**, shipped in December | Do not infer support from same-document support; the cited evidence does not establish Firefox cross-document availability. |
| CSS scroll-driven animations | Chrome/Edge **115** | Safari/iOS **26**, released **September 15, 2025** | The consulted feature explorer still reports Firefox unsupported; use capability detection rather than assuming universal support. |
| `navigator.vibrate()` | Limited-availability API; hardware-dependent | Do not make it a required interaction channel | Check support at runtime; activation and device settings also matter. |

Sources: [5_native_apis_continuity_without_a_framework[1]] [21][5_native_apis_continuity_without_a_framework[2]] [23][5_native_apis_continuity_without_a_framework[3]] [18][5_native_apis_continuity_without_a_framework[4]] [2].

**Takeaway:** The browser matrix is not one "modern animations supported" switch. In particular, Framer's original 2023 fallback statement is not a current browser-support table. [5_native_apis_continuity_without_a_framework[0]] [28]

### Scroll timelines, `@starting-style`, WAAPI, and CSS springs

Use `scroll()` when progress belongs to the scroll container; use `view()` when it belongs to an element passing through the viewport. Keep the content visible without the enhancement:

```css
@supports (animation-timeline: scroll()) {
  .reading-progress {
    transform-origin: left;
    animation: progress linear both;
    animation-timeline: scroll(root block);
  }
}

@keyframes progress {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
```

Set `animation-timeline` **after** the `animation` shorthand so the shorthand does not reset your timeline. For a section-specific reveal, substitute `view()` and an appropriate `animation-range`; avoid applying it to every paragraph.

`@starting-style` supplies an initial style for newly rendered elements, useful for menus and popovers that otherwise have no previous rendered state. WAAPI's `element.animate()` is useful when code must control playback or wait for an exit before removal. Neither requires React or a Framer runtime.

CSS `linear()` can encode a sampled spring-shaped curve. It is an easing function, not a live spring solver: it will not automatically preserve the current physical velocity when retargeted. For a simple button that distinction is often acceptable.

```css
.button {
  --release: cubic-bezier(.2,.8,.2,1);
  transition: transform 420ms var(--release), background-color 120ms linear;
}

@supports (animation-timing-function: linear(0, 1)) {
  .button {
    /* Hand-shaped recovery, not a measured Framer curve. */
    --release: linear(
      0, .45 10%, .78 20%, .94 32%,
      1.015 46%, 1.008 65%, 1
    );
  }
}

.button:active {
  transform: scale(.97);
  transition-duration: 100ms;
  transition-timing-function: cubic-bezier(.2,0,0,1);
}

.button:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 4px;
}
```

### Optional Motion, still without Framer or React

Motion's vanilla functions are a separate option from embedding Framer's site runtime. Its `animate()` page describes mini as native-API style animation and hybrid as adding further capabilities. `inView()` is built on IntersectionObserver. [5_native_apis_continuity_without_a_framework[5]] [15][5_native_apis_continuity_without_a_framework[6]] [13]

| Option | Advertised size established here | Appropriate use |
|---|---|---|
| Native CSS/WAAPI | No animation-library dependency | Press, hover, fades, simple entrances and exits. |
| `animate` from `motion/mini` | **3.2 kb** on the `animate` page | DOM/SVG style animations. |
| Hybrid `animate` from `motion` | **22 kb** on the `animate` page | A more capable imperative animation layer. |
| Other official comparison | **2.6 kb mini**, **18 kb hybrid** in prose; **17 kb** hybrid in a table | Evidence of inconsistent/version-sensitive documentation, not additional packages to combine. |
| `inView()` / `scroll()` | No version-matched isolated size established in the cited extracts | Import only what is needed and inspect the production bundle. |

Sizes: [5_native_apis_continuity_without_a_framework[5]] [15][5_native_apis_continuity_without_a_framework[7]] [7]. Do not add these numbers together or assume they are all measured with identical compression and versions.

Example optional spring release:

```js
import { animate } from 'motion';

animate(button, { scale: 1 }, {
  type: 'spring',
  stiffness: 500,
  damping: 32,
  mass: 1
});
```

Give each animated transform one owner. Do not let CSS hover, a magnetic-button loop, and Motion all overwrite the same `transform`; use nested wrappers for independent responsibilities.

**Decision:** Start native. Add Motion only when interruption, repeated orchestration, or physics noticeably simplifies the implementation.

## 6 accessibility and performance keep motion optional and input cheap

### Reduced motion should change the experience, not merely accelerate it

For this site, provide a genuinely stable reduced-motion mode: no parallax, magnetic movement, cursor follower, spatial page transition, looping ticker, or animated three.js camera. Keep state changes, focus, selection, and explanatory content intact.

A targeted stylesheet is safer than globally forcing every animation to a near-zero duration:

```css
@media (prefers-reduced-motion: reduce) {
  .button,
  .reveal,
  .magnetic-inner {
    transition: none;
    animation: none;
    transform: none;
  }

  .ticker-track {
    animation: none;
    transform: none;
  }

  .cursor-follower {
    display: none;
  }

  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none;
  }
}
```

Make entrance effects opt-in after enhancement initializes; the default HTML must remain visible. Otherwise a JavaScript failure can leave essential text transparent or translated offscreen. In JavaScript, react to changes in the preference during the session, rather than sampling it only on page load.

There is **no universal safe pixel, speed, or duration threshold for motion sickness** established by these sources. Treat the small travel values proposed here as conservative design choices, not medical guarantees. Offer a persistent pause/motion control if the page contains ongoing movement, and avoid large-field zoom, rotation, or scroll hijacking.

### Case study: Framer's earlier Appear rewrite illustrates the real risk

Framer's historical **January 31, 2023** Appear Effects release says it rewrote the implementation using Framer Motion and WAAPI so effects could start sooner. Framer reported animation start improving from **6 s to 0.5 s** on slower connections and mobile template PageSpeed/LCP-related scores improving from **50 to 85**. These are publisher-reported historical results, not a benchmark for your site and not a 2026 discovery. [6_accessibility_and_performance_keep_motion_optional_and_input_cheap[0]] [26]

The useful lesson is not "add more entrance animation." It is that animation which waits on initialization can conceal useful content and damage the perceived loading experience. Your static page already has an advantage: render the article immediately and enhance nonessential presentation afterward.

### Keep click handlers separate from rendering work

Adopt **INP <=200 ms** as an engineering target, while trying to show the first visible press response inside the earlier **100 ms** perceptual budget. Do not confuse an animation's total settling time with the time until the next visible response. The 100 ms interpretation is supported by Nielsen's guidance. [6_accessibility_and_performance_keep_motion_optional_and_input_cheap[1]] [27]

For the implementation:

- Prefer **transform and opacity** for continuous DOM motion. Color changes are fine for small controls; large animated blur, shadow, and filter effects deserve profiling.
- Cache pointer-target bounds on entry or resize; do not call `getBoundingClientRect()` after style writes on every pointer movement.
- Store the latest pointer coordinates and update once per animation frame, not once per raw event.
- Do not build geometry, compile shaders, synchronously parse large assets, or initialize a full three.js scene in a click handler. Prepare the next stage in advance or defer nonessential work.
- Pause offscreen stages; stop rendering when the document is hidden. For mostly static scenes, render on demand.
- Start with a proposed device-pixel-ratio cap of **1.5** for decorative stages, then profile on target hardware. Treat this as a quality/performance trade-off, not a universal optimum.
- Avoid blanket `will-change`. Promote only elements with a demonstrated need.

For haptics, MDN's **November 30, 2025** page requires sticky activation and notes that Silent/Do Not Disturb settings can affect vibration. Even a successful API call is not a promise that the user feels a pulse. [6_accessibility_and_performance_keep_motion_optional_and_input_cheap[2]] [2]

**Decision:** Protect reading, keyboard use, and input responsiveness first; spend the remaining rendering budget on the explanatory object.

## 7 synthesis choose motion by meaning scope and cost

The strongest pattern across the material is separation of concerns. Bogdan Skripka's recognized small interactions, Analogue Agency's scrolling animation, ++hellohello's chaptered report, and its festival campaign solve different communication problems. Treating them all as "make it more Framer-like" would erase the reason each approach fits its subject. [7_synthesis_choose_motion_by_meaning_scope_and_cost[0]] [16][7_synthesis_choose_motion_by_meaning_scope_and_cost[1]] [1]

| Strategy | Mechanism | Best scope | Trade-off | Evidence and time horizon |
|---|---|---|---|---|
| Bogdan-style interaction detail | Local state and control feedback | Buttons, cards, navigation | Easy to overdecorate every control | 2025 award description; per-interaction effect. |
| Panton-style scroll expression | Narrative movement through scrolling | Product/object showcase | Can compete with reading or vestibular comfort | 2025 Best Animations recognition; section-length experience. |
| ++hellohello report structure | Chapters and data visualization | Dense editorial explanation | Requires hierarchy rather than constant spectacle | 2026 case study; sustained reading. |
| Superlocal campaign energy | Color and animation-heavy presentation | Expressive event campaign | A poor default for a calm report | October 2025 recognition reported in 2026 case study. |
| Motion springs/layout | Dynamic values, measurements, identity matching | Interruptible controls and object changes | Extra code and lifecycle/transform ownership | Current documentation and source; milliseconds to seconds. |
| Native transitions/timelines | Browser snapshots and scroll progress | Page continuity and bounded stage progress | Uneven capability coverage | 2025 browser reports and current feature data; progressive enhancement. |

Sources: [7_synthesis_choose_motion_by_meaning_scope_and_cost[0]] [16][7_synthesis_choose_motion_by_meaning_scope_and_cost[1]] [1][7_synthesis_choose_motion_by_meaning_scope_and_cost[2]] [20][7_synthesis_choose_motion_by_meaning_scope_and_cost[3]] [21][7_synthesis_choose_motion_by_meaning_scope_and_cost[4]] [18].

**The non-obvious tension:** weight and responsiveness are not opposites. A heavy-looking object can react immediately, then settle deliberately. Likewise, vibrancy and restraint are not opposites: a quiet article makes a luminous stage more vivid because the stage receives a scarce share of motion and color.

My recommended architecture is therefore:

1. **Semantic static HTML** for all reading and navigation.
2. **CSS states and WAAPI** for local feedback and entrances.
3. **Native View Transitions** for continuity where available.
4. **One bounded scroll/progress controller** per explanatory stage.
5. **three.js only inside the stages that actually need spatial explanation.**

Add Motion selectively if true spring interruption or orchestration reduces complexity. Do not build a framework-shaped animation system merely to reproduce a few visible effects.

**Decision:** The target is not Framer's appearance. It is Framer-like coherence: every movement explains contact, hierarchy, identity, or change.

## 8 prioritized implementation 15 techniques for your editorial site

The following values are an implementable starting specification, **not claimed Framer defaults**. Priorities 1-6 provide the largest likely improvement with the least visual noise; 12-15 are optional and should survive an explicit usefulness test.

| Priority | Technique | Exact starting specification | Implementation and stopping rule |
|---|---|---|---|
| **1** | Weighty primary buttons | Press **scale 0.97**, **100 ms**, `cubic-bezier(.2,0,0,1)`; release spring **500 / 32 / 1** | Semantic button; action fires normally. Stop shrinking sooner if small text looks distorted. |
| **2** | Persistent outcome feedback | Fill/icon/label change within the first response; transient color transition **120 ms** | Distinguish selected, pending, success, and error. Do not rely on the release animation to explain the result. |
| **3** | Reduced-motion mode | Disable spatial movement and loops; retain immediate state changes | Honor the OS preference in CSS and JS. Show a static three.js pose or image. |
| **4** | Restrained hover/focus | Hover lift **-1 px**, **160 ms**, `cubic-bezier(.2,.8,.2,1)`; focus outline **2 px**, offset **4 px** | Fine-pointer hover only; no necessary information revealed only on hover. |
| **5** | Section entrances | Opacity **0 -> 1**, translateY **12 -> 0 px**, **320 ms**; sibling stagger **40 ms**, capped at **160 ms** | IntersectionObserver; run once. Keep ordinary article paragraphs unanimated. |
| **6** | Short page continuity | Root crossfade **220 ms**, `cubic-bezier(.2,.8,.2,1)` | Native View Transitions with normal-navigation fallback; no pre-navigation delay. |
| **7** | Shared explanatory object | **360 ms** nearly non-bouncy transition, or spring **300 / 30 / 1** | One corresponding object/name; use FLIP if browser snapshots do not fit. Avoid scaling body copy. |
| **8** | Calm panel exits | Exit opacity **140 ms**; enter opacity plus **8 px** travel over **240 ms** | Finish exit before removal; restore focus. Do not serialize unrelated UI behind the exit. |
| **9** | Scroll-linked explanation | Progress **0-1** maps to one clear state; smooth programmatic adjustments over **120 ms** | Use `scroll()`/`view()` when supported. Do not smooth the visitor's actual scrolling. |
| **10** | Dark-stage light hierarchy | Base `#101318`; surface `#1B212A`; cyan `#7DD3FC`; optional static grain **0.025 opacity** | Animate object/light meaning, not every background layer. Check contrast in context. |
| **11** | Headline reveal | Word/line stagger **30 ms**; each unit **280 ms**; total sequence capped at **500 ms** | Use clipping/translation for a short heading, accessible intact text, and instant reduced-motion rendering. |
| **12** | Bounded parallax | Maximum background travel **20 px** across a stage | Clip to stage bounds; never move the reading column or rotate the camera with page scroll. |
| **13** | Magnetic CTA | Strength **0.12**, maximum displacement **4 px**; return spring **360 / 30 / 0.8** | Move an inner visual layer, not the hit area. Fine pointers only; disable for reduced motion. |
| **14** | Ticker or data stream | **24 px/s**, linear; pause on hover/focus and via a visible control | Duplicate decorative track with duplicate content hidden from accessibility APIs. Use a static list in reduced motion. |
| **15** | One optional sensory accent | Cursor marker **10 px** with **100 ms** equivalent lag, **or** user-enabled **20 ms** click sound, **or** **8 ms** vibration | Choose at most one extra channel initially. Never hide the native pointer or require haptics. |

The press/gesture, layout, native-transition, and vibration mechanisms behind this specification are documented in the sources above; the chosen numeric design tokens are recommendations. [8_prioritized_implementation_15_techniques_for_your_editorial_site[0]] [29][8_prioritized_implementation_15_techniques_for_your_editorial_site[1]] [20][8_prioritized_implementation_15_techniques_for_your_editorial_site[2]] [28][8_prioritized_implementation_15_techniques_for_your_editorial_site[3]] [2]

**Ship first:** a responsive 0.97 press, explicit state changes, restrained hover/focus, a 220 ms navigation transition, and a 320 ms section reveal. Then add one meaningful shared-object transition inside a dark stage. Magnetic movement, followers, scrambles, and perpetual tickers are optional embellishments - not prerequisites for a vivid site.

## Sources

- https://www.nngroup.com/articles/response-times-3-important-limits
- https://motion.dev/docs/react-transitions
- https://github.com/motiondivision/motion/blob/main/packages/motion-dom/src/animation/generators/spring.ts
- https://motion.dev/docs/react-layout-animations
- https://www.framer.com/updates/page-effects
- https://www.framer.com/awards/
- https://developer.apple.com/videos/play/wwdc2025/233
- https://web-platform-dx.github.io/web-features-explorer/features/scroll-driven-animations/
- https://motion.dev/docs/animate
- https://motion.dev/docs/feature-comparison
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator.vibrate
- https://www.framer.com/stories/hellohello
- https://motion.dev/docs/spring
- https://motion.dev/docs/react-gestures
- https://www.ibm.com/support/pages/sites/default/files/inline-files/EconomicValueofResponseTime.pdf
- https://www.framer.com/updates/ticker-effect
- https://motion.dev/docs/react-animate-presence
- https://motion.dev/docs/react-motion-component
- https://www.framer.com/updates/framer-3
- https://www.framer.com/
- https://developer.chrome.com/blog/view-transitions-in-2025
- https://motion.dev/docs/inview
- https://www.framer.com/updates/appear-effects
