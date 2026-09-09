/**
 * Text that resolves out of noise, character by character.
 *
 * Used for the agent's step labels: a line of scrambled characters settling
 * into "Matching the tone to the audience" reads as work happening, where a
 * spinner reads as waiting. The distinction matters here because the steps
 * really are doing work (see agent.ts) and the animation is timed to it.
 *
 * Ported from the React Bits component of the same name. Two changes for
 * this codebase: typed, and the `motion/react` wrapper is dropped for a
 * plain span. The original wraps in `motion.span` to accept animation props
 * it never passes; the scramble is driven by an interval and a state update,
 * not by the animation library, so nothing is lost and the portal does not
 * take a second animation runtime for one component.
 *
 * The scrambled text is hidden from assistive technology: a screen reader
 * announcing forty characters of noise per frame is the opposite of an
 * accessibility feature. The resolved text is exposed once, as a live
 * region, in AgentThinking.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+-=[]{}<>/\\|';

export type RevealDirection = 'start' | 'end' | 'center';

export interface DecryptedTextProps {
  text: string;
  /** Milliseconds between scramble frames. */
  speed?: number;
  /** Non-sequential mode only: how many frames before it settles. */
  maxIterations?: number;
  /** Reveal one character at a time rather than settling all at once. */
  sequential?: boolean;
  revealDirection?: RevealDirection;
  /** Scramble using only characters already in the text — quieter, and
   *  keeps the line width visually stable. */
  useOriginalCharsOnly?: boolean;
  characters?: string;
  className?: string;
  parentClassName?: string;
  encryptedClassName?: string;
  /** 'mount' runs once when it appears, which is what the step timeline
   *  wants; 'hover' is the original component's default. */
  animateOn?: 'mount' | 'hover' | 'view';
  /** Fires when the text has fully resolved, so a caller can chain steps. */
  onDone?: () => void;
}

export function DecryptedText({
  text,
  speed = 38,
  maxIterations = 12,
  sequential = true,
  revealDirection = 'start',
  useOriginalCharsOnly = false,
  characters = DEFAULT_CHARS,
  className = '',
  parentClassName = '',
  encryptedClassName = '',
  animateOn = 'mount',
  onDone,
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [isAnimating, setIsAnimating] = useState(false);
  const [settled, setSettled] = useState(animateOn !== 'mount');

  const containerRef = useRef<HTMLSpanElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /* Held in a ref as well as in the closure: the interval callback is
   * created once and would otherwise capture the first onDone it saw. */
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const pool = useMemo(
    () =>
      useOriginalCharsOnly
        ? Array.from(new Set(text.split(''))).filter((c) => c !== ' ')
        : characters.split(''),
    [useOriginalCharsOnly, text, characters],
  );

  const scramble = useCallback(
    (source: string, keep: Set<number>) =>
      source
        .split('')
        .map((char, i) => {
          if (char === ' ') return ' ';
          if (keep.has(i)) return source[i];
          return pool[Math.floor(Math.random() * pool.length)] ?? char;
        })
        .join(''),
    [pool],
  );

  const start = useCallback(() => {
    setRevealed(new Set());
    setSettled(false);
    setIsAnimating(true);
  }, []);

  useEffect(() => {
    if (animateOn === 'mount') start();
    else {
      setDisplayText(text);
      setSettled(true);
    }
    // Restarting when the text changes is the point: each step swaps its
    // label in and expects a fresh reveal.
  }, [text, animateOn, start]);

  useEffect(() => {
    if (!isAnimating) return;

    let frame = 0;

    const nextIndex = (done: Set<number>): number => {
      const len = text.length;
      if (revealDirection === 'end') return len - 1 - done.size;
      if (revealDirection === 'center') {
        const middle = Math.floor(len / 2);
        const offset = Math.floor(done.size / 2);
        const candidate = done.size % 2 === 0 ? middle + offset : middle - offset - 1;
        if (candidate >= 0 && candidate < len && !done.has(candidate)) return candidate;
        for (let i = 0; i < len; i++) if (!done.has(i)) return i;
        return 0;
      }
      return done.size;
    };

    const finish = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setIsAnimating(false);
      setDisplayText(text);
      setSettled(true);
      onDoneRef.current?.();
    };

    intervalRef.current = setInterval(() => {
      setRevealed((prev) => {
        if (sequential) {
          if (prev.size >= text.length) {
            finish();
            return prev;
          }
          const next = new Set(prev);
          next.add(nextIndex(prev));
          setDisplayText(scramble(text, next));
          return next;
        }

        setDisplayText(scramble(text, prev));
        frame += 1;
        if (frame >= maxIterations) finish();
        return prev;
      });
    }, speed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAnimating, text, speed, maxIterations, sequential, revealDirection, scramble]);

  const hoverProps =
    animateOn === 'hover'
      ? { onMouseEnter: start, onMouseLeave: () => { setDisplayText(text); setSettled(true); } }
      : {};

  return (
    <span ref={containerRef} className={parentClassName} {...hoverProps}>
      {/* The resolved text, for anything that reads the DOM rather than
          watching it. The visible layer is aria-hidden below. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {displayText.split('').map((char, i) => (
          <span key={i} className={revealed.has(i) || settled ? className : encryptedClassName}>
            {char}
          </span>
        ))}
      </span>
    </span>
  );
}

export default DecryptedText;
