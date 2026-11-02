/**
 * Publishes the visible part of the screen as CSS variables (--vv-top,
 * --vv-height) so dialogs can sit above the on-screen keyboard.
 *
 * iOS doesn't shrink the page when the keyboard opens: it draws the keyboard
 * over it and scrolls the page to reach the focused field, which pushes a
 * full-screen overlay off the top. The visual viewport is what's actually
 * visible, so overlays size themselves to it instead.
 *
 * The app never scrolls the window itself (content scrolls inside <main>), so
 * once the keyboard closes any leftover window scroll is iOS residue and is
 * reset.
 */
export function trackVisibleArea(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let lastHeight = vv.height;

  const update = () => {
    root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    root.style.setProperty('--vv-height', `${vv.height}px`);
    const keyboardClosed = vv.height > lastHeight + 100;
    lastHeight = vv.height;
    if (keyboardClosed && (window.scrollY !== 0 || vv.offsetTop !== 0)) window.scrollTo(0, 0);
  };

  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}
