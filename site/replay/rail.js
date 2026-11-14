// The sidebar of Replay and the playground: a floating panel that folds into a 72 px icon rail. It folds on its own on laptop
// widths (921 to 1279 px) and the toggle at its top folds or opens it; a choice made with the toggle is remembered in this browser.
// Below 921 px the sidebar is the top bar and the toggle is hidden. Labels stay in the page as visually hidden text, so every link
// keeps its name when folded.
(() => {
  const shell = document.querySelector('.shell');
  const btn = document.querySelector('.rail-toggle');
  if (!shell || !btn) return;
  const KEY = 'midge-rail';
  const saved = (() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  })();
  const set = (folded, remember) => {
    shell.classList.toggle('rail-folded', folded);
    btn.setAttribute('aria-expanded', String(!folded));
    btn.setAttribute('aria-label', folded ? 'Open the sidebar' : 'Fold the sidebar');
    if (remember) {
      try {
        localStorage.setItem(KEY, folded ? 'folded' : 'open');
      } catch {
        /* storage blocked: the choice lasts for this page only */
      }
    }
  };
  const laptop = matchMedia('(min-width: 921px) and (max-width: 1279px)');
  set(saved ? saved === 'folded' : laptop.matches, false);
  laptop.addEventListener('change', (e) => {
    if (!saved) set(e.matches, false);
  });
  btn.addEventListener('click', () => set(!shell.classList.contains('rail-folded'), true));
})();
