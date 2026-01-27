import { useEffect } from 'react';
import type { RefObject } from 'react';

interface OutsideClickOptions {
  refs: Array<RefObject<HTMLElement | null>>;
  onOutsideClick: (event: MouseEvent | TouchEvent) => void;
  enabled?: boolean;
}

export function useOutsideClick({ refs, onOutsideClick, enabled = true }: OutsideClickOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      const isInside = refs.some((ref) => ref.current && ref.current.contains(target));
      if (!isInside) {
        onOutsideClick(event);
      }
    };

    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);

    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [refs, onOutsideClick, enabled]);
}
