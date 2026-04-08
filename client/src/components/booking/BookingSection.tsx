import { forwardRef, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export type SectionStatus = 'hidden' | 'active' | 'summary';

type Props = {
  status: SectionStatus;
  isDark: boolean;
  /** Full interactive content — rendered when status === 'active' */
  children: ReactNode;
  /** Compact summary — rendered when status === 'summary' */
  summary?: {
    icon?: ReactNode;
    label: string;
    value: string;
    onChange?: () => void;
    changeLabel?: string;
  };
};

export const BookingSection = forwardRef<HTMLDivElement, Props>(function BookingSection(
  { status, isDark, children, summary },
  ref,
) {
  if (status === 'hidden') return null;

  return (
    <div ref={ref} className="scroll-mt-4">
      <AnimatePresence initial={false} mode="wait">
        {status === 'active' ? (
          <motion.div
            key="active"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'rounded-2xl border p-6 overflow-hidden',
              isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200 shadow-sm',
            )}
          >
            {children}
          </motion.div>
        ) : (
          summary && (
            <motion.button
              key="summary"
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={summary.onChange}
              disabled={!summary.onChange}
              className={cn(
                'w-full flex items-center gap-3 px-4 h-14 rounded-xl text-left transition-colors',
                isDark
                  ? 'bg-white/5 border border-white/10 hover:bg-white/10'
                  : 'bg-gray-50 border border-gray-200 hover:bg-gray-100',
                !summary.onChange && 'cursor-default',
              )}
              data-testid="booking-section-summary"
            >
              {summary.icon && <div className="shrink-0">{summary.icon}</div>}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-[10px] uppercase tracking-wider',
                    isDark ? 'text-white/40' : 'text-gray-500',
                  )}
                >
                  {summary.label}
                </p>
                <p
                  className={cn(
                    'text-sm font-medium truncate',
                    isDark ? 'text-white/90' : 'text-gray-900',
                  )}
                >
                  {summary.value}
                </p>
              </div>
              {summary.onChange && (
                <span
                  className={cn(
                    'text-xs font-medium',
                    isDark ? 'text-blue-300' : 'text-blue-600',
                  )}
                >
                  {summary.changeLabel ?? 'Ändern'}
                </span>
              )}
            </motion.button>
          )
        )}
      </AnimatePresence>
    </div>
  );
});
