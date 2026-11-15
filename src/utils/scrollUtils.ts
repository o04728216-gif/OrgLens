export function scrollToListTop(
  element: HTMLElement | null,
  headerOffsetPx = 88
): void {
  if (typeof window === 'undefined') return;

  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

  if (element) {
    const rect = element.getBoundingClientRect();
    const targetTop = Math.max(0, window.scrollY + rect.top - headerOffsetPx);
    window.scrollTo({ top: targetTop, behavior });
  } else {
    window.scrollTo({ top: 0, behavior });
  }
}
