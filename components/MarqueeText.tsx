"use client";

import { useEffect, useRef, useState } from "react";

type MarqueeTextProps = {
  text: string;
  className: string;
};

export function MarqueeText({ text, className }: MarqueeTextProps) {
  const containerRef = useRef<HTMLParagraphElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const content = textRef.current;
    if (!container || !content) return;

    const measure = () => {
      const nextOverflow = Math.max(0, content.scrollWidth - container.clientWidth);
      setOverflow((current) => (current === nextOverflow ? current : nextOverflow));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [text]);

  useEffect(() => {
    const content = textRef.current;
    if (!content || overflow <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const startPauseMs = 2000;
    const endPauseMs = 2400;
    const travelDurationMs = (overflow / 24) * 1000;
    const cycleDurationMs = startPauseMs + travelDurationMs + endPauseMs;
    const animation = content.animate(
      [
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: startPauseMs / cycleDurationMs },
        {
          transform: `translateX(-${overflow}px)`,
          offset: (startPauseMs + travelDurationMs) / cycleDurationMs,
        },
        { transform: `translateX(-${overflow}px)`, offset: 1 },
      ],
      { duration: cycleDurationMs, iterations: Infinity, easing: "linear" }
    );

    return () => animation.cancel();
  }, [overflow]);

  return (
    <p
      ref={containerRef}
      className={`w-full overflow-hidden whitespace-nowrap ${className}`}
      title={text}
    >
      <span ref={textRef} className="inline-block">{text}</span>
    </p>
  );
}
