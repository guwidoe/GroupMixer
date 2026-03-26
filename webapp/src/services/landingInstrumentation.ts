declare global {
  interface Window {
    va?: (...args: unknown[]) => void;
    __groupmixerLandingEvents?: Array<{ name: string; payload?: Record<string, unknown> }>;
  }
}

export function trackLandingEvent(name: string, payload?: Record<string, unknown>) {
  if (typeof window === 'undefined') {
    return;
  }

  window.__groupmixerLandingEvents = window.__groupmixerLandingEvents || [];
  window.__groupmixerLandingEvents.push({ name, payload });

  window.dispatchEvent(
    new CustomEvent('groupmixer:landing-event', {
      detail: { name, payload },
    }),
  );

  if (typeof window.va === 'function') {
    try {
      window.va('event', { name, ...payload });
    } catch {
      // Ignore analytics transport failures; event scaffolding should stay lightweight.
    }
  }
}
