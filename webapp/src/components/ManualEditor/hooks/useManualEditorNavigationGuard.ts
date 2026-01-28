import { useEffect } from 'react';
import type { Location, NavigateFunction } from 'react-router-dom';

interface UseManualEditorNavigationGuardArgs {
  hasUnsavedChanges: boolean;
  setShowLeaveConfirm: (value: boolean) => void;
  setPendingNextPath: (value: string | null) => void;
  setLeaveHook: (hook: ((nextPath: string) => void) | null) => void;
  setGlobalUnsaved: (value: boolean) => void;
  navigate: NavigateFunction;
  location: Location;
  proceedingRef: React.MutableRefObject<boolean>;
}

export function useManualEditorNavigationGuard({
  hasUnsavedChanges,
  setShowLeaveConfirm,
  setPendingNextPath,
  setLeaveHook,
  setGlobalUnsaved,
  navigate,
  location,
  proceedingRef,
}: UseManualEditorNavigationGuardArgs) {
  useEffect(() => {
    setLeaveHook((nextPath: string) => {
      if (hasUnsavedChanges) {
        setShowLeaveConfirm(true);
        navigate(location.pathname, { replace: true, state: { nextPath } });
      } else {
        navigate(nextPath);
      }
    });
    return () => {
      setLeaveHook(null);
      setGlobalUnsaved(false);
    };
  }, [hasUnsavedChanges, setLeaveHook, setGlobalUnsaved, setShowLeaveConfirm, navigate, location.pathname]);

  useEffect(() => {
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;

    function shouldBlock(nextUrl: string) {
      if (!hasUnsavedChanges) return false;
      try {
        const next = new URL(nextUrl, window.location.origin);
        const curr = new URL(window.location.href);
        return next.pathname !== curr.pathname || next.search !== curr.search || next.hash !== curr.hash;
      } catch {
        return hasUnsavedChanges;
      }
    }

    type HistoryPushArgs = Parameters<History['pushState']>;
    type HistoryReplaceArgs = Parameters<History['replaceState']>;

    const patchedPushState: History['pushState'] = (...args: HistoryPushArgs) => {
      const url = args[2];
      if (!proceedingRef.current && typeof url === 'string' && shouldBlock(url)) {
        setPendingNextPath(url);
        setShowLeaveConfirm(true);
        return;
      }
      return originalPush.apply(window.history, args);
    };

    const patchedReplaceState: History['replaceState'] = (...args: HistoryReplaceArgs) => {
      const url = args[2];
      if (!proceedingRef.current && typeof url === 'string' && shouldBlock(url)) {
        setPendingNextPath(url);
        setShowLeaveConfirm(true);
        return;
      }
      return originalReplace.apply(window.history, args);
    };

    window.history.pushState = patchedPushState;
    window.history.replaceState = patchedReplaceState;

    const onClickCapture = (e: Event) => {
      if (!hasUnsavedChanges) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || anchor.target === '_blank') return;
      if (anchor.origin !== window.location.origin) return;
      e.preventDefault();
      setPendingNextPath(anchor.pathname + anchor.search + anchor.hash);
      setShowLeaveConfirm(true);
    };
    document.addEventListener('click', onClickCapture, true);

    const onPopState = () => {
      if (!hasUnsavedChanges || proceedingRef.current) return;
      setPendingNextPath(null);
      setShowLeaveConfirm(true);
      window.history.pushState(null, '', location.pathname + location.search + location.hash);
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.history.pushState = originalPush;
      window.history.replaceState = originalReplace;
      document.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('popstate', onPopState);
    };
  }, [
    hasUnsavedChanges,
    location.pathname,
    location.search,
    location.hash,
    proceedingRef,
    setPendingNextPath,
    setShowLeaveConfirm,
  ]);
}
