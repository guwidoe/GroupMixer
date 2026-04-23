import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const ROTATING_TITLE_WORDS = ['Random', 'Optimized', 'Multi-round', 'Constraint-based'] as const;
const ROTATING_TITLE_INTERVAL_MS = 2600;
const INITIAL_WORD_SLOT_WIDTH = '6.8ch';

interface RotatingTitleState {
  currentIndex: number;
  previousIndex: number | null;
  transitionId: number;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);

    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  return prefersReducedMotion;
}

export function HomeAnimatedHeroTitle() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const wordFrameRef = useRef<HTMLSpanElement>(null);
  const measureRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [titleState, setTitleState] = useState<RotatingTitleState>({
    currentIndex: 0,
    previousIndex: null,
    transitionId: 0,
  });
  const currentIndex = prefersReducedMotion ? 0 : titleState.currentIndex;
  const previousIndex = prefersReducedMotion ? null : titleState.previousIndex;
  const currentWord = ROTATING_TITLE_WORDS[currentIndex];

  useEffect(() => {
    if (prefersReducedMotion) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setTitleState((state) => ({
        currentIndex: (state.currentIndex + 1) % ROTATING_TITLE_WORDS.length,
        previousIndex: state.currentIndex,
        transitionId: state.transitionId + 1,
      }));
    }, ROTATING_TITLE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [prefersReducedMotion]);

  useLayoutEffect(() => {
    const frame = wordFrameRef.current;
    const measuredWord = measureRefs.current[currentIndex];

    if (!frame || !measuredWord) {
      return;
    }

    frame.style.width = `${measuredWord.offsetWidth}px`;
  }, [currentIndex]);

  return (
    <span className="landing-rotating-title" aria-hidden="true">
      <span ref={wordFrameRef} className="landing-rotating-title__word-frame" style={{ width: INITIAL_WORD_SLOT_WIDTH }}>
        <span className="landing-rotating-title__word-spacer">{currentWord}</span>
        {previousIndex !== null && (
          <span
            key={`${titleState.transitionId}:previous`}
            className="landing-rotating-title__word landing-rotating-title__word--previous"
          >
            {ROTATING_TITLE_WORDS[previousIndex]}
          </span>
        )}
        <span
          key={`${titleState.transitionId}:current`}
          className="landing-rotating-title__word landing-rotating-title__word--current"
        >
          {currentWord}
        </span>
        <span className="landing-rotating-title__measure">
          {ROTATING_TITLE_WORDS.map((word, index) => (
            <span
              key={word}
              ref={(node) => {
                measureRefs.current[index] = node;
              }}
            >
              {word}
            </span>
          ))}
        </span>
      </span>
      <span>Group Generator</span>
    </span>
  );
}
