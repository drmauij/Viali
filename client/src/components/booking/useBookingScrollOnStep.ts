import { useEffect, useRef } from 'react';

/**
 * Smooth-scrolls the element for the current step into view on step change,
 * unless the user scrolled manually within the last `suppressMs` milliseconds.
 * Respects prefers-reduced-motion.
 */
export function useBookingScrollOnStep<StepT extends string>(
  step: StepT,
  getElement: (step: StepT) => HTMLElement | null,
  suppressMs = 800,
) {
  const lastUserScroll = useRef<number>(0);
  const lastProgrammaticScroll = useRef<number>(0);

  // Track user-initiated scrolls. Programmatic smooth scroll also triggers scroll events,
  // so we stamp lastProgrammaticScroll just before calling scrollIntoView and ignore any
  // scroll events within ~500ms after.
  useEffect(() => {
    const onScroll = () => {
      if (Date.now() - lastProgrammaticScroll.current < 500) return;
      lastUserScroll.current = Date.now();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = getElement(step);
    if (!el) return;
    if (Date.now() - lastUserScroll.current < suppressMs) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    lastProgrammaticScroll.current = Date.now();
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
}
