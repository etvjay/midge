// Motion for Replay and the playground, carried over from the landing page (docs/DESIGN_SYSTEM.md §6): cards rise in once when they come
// into view, and kickers and step labels decode from hex characters to their words (the site's signature). Static first: without
// JavaScript, with reduced motion, or without IntersectionObserver nothing is hidden and nothing moves.
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('motion');
  const HEX = '0123456789abcdef';
  const decode = (el) => {
    if (el.dataset.decoded) return;
    el.dataset.decoded = '1';
    const final = el.textContent;
    const start = performance.now();
    const frame = (now) => {
      const p = Math.min(1, (now - start) / 700);
      const n = Math.floor(final.length * p);
      el.textContent = final.slice(0, n) + [...final.slice(n)].map((c) => (c === ' ' ? ' ' : HEX[Math.floor(Math.random() * 16)])).join('');
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = final;
    };
    requestAnimationFrame(frame);
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        for (const k of e.target.querySelectorAll(':scope > .pill, :scope > .kicker')) decode(k);
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -6% 0px' },
  );
  const seen = new WeakSet();
  const watch = () => {
    document.querySelectorAll('.tile').forEach((t, i) => t.style.setProperty('--i', String(Math.min(i, 4))));
    for (const el of document.querySelectorAll('.step, .tile')) {
      if (seen.has(el)) continue;
      seen.add(el);
      io.observe(el);
    }
  };
  const kicker = document.querySelector('.intro .kicker');
  if (kicker) decode(kicker);
  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
  watch();
})();
