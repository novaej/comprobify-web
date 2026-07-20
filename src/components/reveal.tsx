'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Fades + lifts its children into view once they enter the viewport.
 *
 * Used across the marketing landing page to stagger sections in as the visitor
 * scrolls. Deliberately dependency-free — an IntersectionObserver and two
 * Tailwind classes do everything a motion library would here.
 *
 * Two accessibility/robustness guards:
 *  - `motion-reduce:` variants force the visible state immediately, so a
 *    reduced-motion visitor never sees a transition (or an invisible section).
 *  - If IntersectionObserver is unavailable, the content reveals on mount
 *    rather than staying hidden forever.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  /** Stagger in milliseconds — use for sibling items revealing in sequence. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // Fire slightly before the element is fully on screen so the motion
      // finishes about when the visitor's eye arrives.
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
      className={cn(
        'transition-all duration-700 ease-out',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        'motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none',
        className,
      )}
    >
      {children}
    </div>
  );
}
