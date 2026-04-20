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
  /** Consume-once override. Called inside the effect; if it returns a step,
   *  the hook scrolls there instead of `step`. Use a ref-backed callback
   *  that nulls the ref on read so the override is consumed exactly once
   *  per step change (otherwise re-renders would re-trigger the override
   *  scroll and feel like the page is jumping around). */
  consumeOverrideStep?: () => StepT | null,
) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const overrideStep = consumeOverrideStep?.() ?? null;
    const targetStep = overrideStep ?? step;

    // Wait for framer-motion's expand animation to begin so the element has its final height.
    const timer = window.setTimeout(() => {
      const el = getElement(targetStep);
      if (!el) return;
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }, reduced ? 0 : 250);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
}
