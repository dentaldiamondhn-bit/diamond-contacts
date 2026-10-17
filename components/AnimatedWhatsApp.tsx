'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import animatedWhatsAppData from '../animated-whatsapp.json';

const WA_GREEN = '#25D366';

/** Minimal surface of the lottie-web player we use, so the dynamic import can be
 *  typed without pulling lottie's global types into this module. */
interface LottieAnimation {
  setSpeed: (speed: number) => void;
  destroy: () => void;
  play: () => void;
  stop: () => void;
  addEventListener: (event: string, handler: () => void) => void;
}

interface LottieModule {
  loadAnimation: (params: Record<string, unknown>) => LottieAnimation;
}

export interface AnimatedWhatsAppProps {
  className?: string;
  /** Pixel size of the glyph. */
  size?: number;
  /** Set false to force the static glyph. */
  animate?: boolean;
}

/**
 * WhatsApp glyph used on every WhatsApp redirect link (same animation as the
 * monolith's AnimatedWhatsApp).
 *
 * Two adaptations for the contacts list:
 * - `lottie-web` is pulled in via dynamic import so the animation runtime never
 *   lands in the main bundle.
 * - Playback is gated on an IntersectionObserver, because the contacts table can
 *   render one icon per row and dozens of concurrent loops would be wasteful.
 *
 * Falls back to a static glyph while the animation loads, when `animate` is
 * false, and under `prefers-reduced-motion`, so the control is never icon-less.
 * Decorative only: the control that wraps it carries the accessible name.
 */
export default function AnimatedWhatsApp({ className = '', size = 20, animate = true }: AnimatedWhatsAppProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<{ destroy: () => void; play: () => void; stop: () => void } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !animate) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let cancelled = false;
    let observer: IntersectionObserver | undefined;

    void import('lottie-web')
      .then((mod) => {
        if (cancelled || !containerRef.current) return;
        const lottie = (mod.default ?? mod) as unknown as LottieModule;
        const animation = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop: true,
          autoplay: false,
          animationData: animatedWhatsAppData as unknown as object,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            progressiveLoad: true,
            hideOnTransparent: true,
          },
        });
        animation.setSpeed(0.5);
        animationRef.current = animation;

        // Recolour every shape to WhatsApp green, matching the monolith.
        animation.addEventListener('DOMLoaded', () => {
          const svg = containerRef.current?.querySelector('svg');
          if (!svg) return;
          svg.querySelectorAll('*').forEach((el) => {
            el.setAttribute('fill', WA_GREEN);
            el.setAttribute('stroke', WA_GREEN);
          });
        });

        setReady(true);

        observer = new IntersectionObserver(
          (entries) => {
            const visible = entries.some((e) => e.isIntersecting);
            if (visible) animation.play();
            else animation.stop();
          },
          { rootMargin: '150px' },
        );
        observer.observe(container);
      })
      .catch(() => {
        /* keep the static fallback */
      });

    return () => {
      cancelled = true;
      observer?.disconnect();
      animationRef.current?.destroy();
      animationRef.current = null;
      // Keep the static fallback in sync with the destroyed SVG, otherwise the
      // control renders as an empty box if `animate` flips back on.
      setReady(false);
    };
  }, [animate]);

  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span ref={containerRef} className="block h-full w-full" />
      {!ready && (
        <span className="absolute inset-0 flex items-center justify-center">
          <MessageCircle size={size} style={{ color: WA_GREEN }} />
        </span>
      )}
    </span>
  );
}