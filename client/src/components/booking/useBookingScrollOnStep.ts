import { useEffect } from 'react';

/**
 * Smooth-scrolls the element for the current step into view on step change.
 * Defers the scroll by one animation frame + a short delay so the
 * framer-motion expand transition has started and the target element has
 * its new size before we measure. Respects prefers-reduced-motion.
 */
export function useBookingScrollOnStep<StepT extends string>(
  step: StepT,
  getElement: (step: StepT) => HTMLElement | null,
) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Wait for framer-motion's expand animation to begin so the element has its final height.
    const timer = window.setTimeout(() => {
      const el = getElement(step);
      if (!el) return;
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }, reduced ? 0 : 250);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
}
