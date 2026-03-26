declare global {
  interface Window {
    va?: (...args: unknown[]) => void;
    __groupmixerLandingEvents?: Array<{ name: string; payload?: Record<string, unknown> }>;
  }
}

const ATTRIBUTION_STORAGE_KEY = 'groupmixer-telemetry-attribution';

type TelemetryAttribution = {
  landingSlug?: string;
  experiment?: string;
  variant?: string;
};

function normalizeValue(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function hasAttribution(attribution: TelemetryAttribution): boolean {
  return Boolean(attribution.landingSlug || attribution.experiment || attribution.variant);
}

export function canonicalPathToLandingSlug(canonicalPath: string): string {
  const trimmed = canonicalPath
    .replace(/^\/+|\/+$/g, '')
    .replace(/^(en|es|fr)(?=\/|$)/, '')
    .replace(/^\/+|\/+$/g, '');
  return trimmed || 'home';
}

export function readTelemetryAttributionFromSearch({
  search,
  fallbackLandingSlug,
}: {
  search?: string;
  fallbackLandingSlug?: string;
} = {}): TelemetryAttribution {
  const searchParams = new URLSearchParams(search ?? '');

  return {
    landingSlug: normalizeValue(searchParams.get('lp')) ?? normalizeValue(fallbackLandingSlug),
    experiment: normalizeValue(searchParams.get('exp')),
    variant: normalizeValue(searchParams.get('var')),
  };
}

export function buildTrackedAppPath(path: string, attribution: TelemetryAttribution): string {
  const searchParams = new URLSearchParams();

  if (attribution.landingSlug) {
    searchParams.set('lp', attribution.landingSlug);
  }

  if (attribution.experiment) {
    searchParams.set('exp', attribution.experiment);
  }

  if (attribution.variant) {
    searchParams.set('var', attribution.variant);
  }

  const search = searchParams.toString();
  return search ? `${path}?${search}` : path;
}

export function persistTelemetryAttribution(attribution: TelemetryAttribution): void {
  if (typeof window === 'undefined' || !hasAttribution(attribution)) {
    return;
  }

  window.sessionStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
}

export function getPersistedTelemetryAttribution(): TelemetryAttribution {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as TelemetryAttribution;
    return {
      landingSlug: normalizeValue(parsed.landingSlug),
      experiment: normalizeValue(parsed.experiment),
      variant: normalizeValue(parsed.variant),
    };
  } catch {
    return {};
  }
}

export function captureTelemetryAttributionFromSearch({
  search,
  fallbackLandingSlug,
}: {
  search?: string;
  fallbackLandingSlug?: string;
} = {}): TelemetryAttribution {
  const attribution = readTelemetryAttributionFromSearch({ search, fallbackLandingSlug });
  persistTelemetryAttribution(attribution);
  return attribution;
}

export function getActiveTelemetryAttribution(search?: string): TelemetryAttribution {
  const fromSearch = readTelemetryAttributionFromSearch({ search });
  if (hasAttribution(fromSearch)) {
    persistTelemetryAttribution(fromSearch);
    return fromSearch;
  }

  return getPersistedTelemetryAttribution();
}

export function buildTelemetryPayload(
  payload?: Record<string, unknown>,
  attribution?: TelemetryAttribution,
): Record<string, unknown> | undefined {
  const mergedPayload = {
    ...payload,
    ...(attribution?.landingSlug ? { landingSlug: attribution.landingSlug } : {}),
    ...(attribution?.experiment ? { experiment: attribution.experiment } : {}),
    ...(attribution?.variant ? { variant: attribution.variant } : {}),
  };

  return Object.keys(mergedPayload).length > 0 ? mergedPayload : undefined;
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
