import { useEffect, useMemo, useState } from "react";

const assetAvailabilityCache = new Map<string, boolean>();

export function resolvePublicAssetUrl(
  assetPath: string,
  baseUrl: string = import.meta.env?.BASE_URL ?? "/"
) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedAssetPath = assetPath.replace(/^\/+/, "");
  return `${normalizedBase}${normalizedAssetPath}`;
}

export function isRenderableModelContentType(contentType: string | null) {
  if (!contentType) {
    return true;
  }

  const normalized = contentType.toLowerCase();
  return !normalized.includes("text/html") && !normalized.includes("application/json");
}

export function useOptionalModelAsset(assetPath: string) {
  const assetUrl = useMemo(() => resolvePublicAssetUrl(assetPath), [assetPath]);
  const cachedAvailability = assetAvailabilityCache.get(assetUrl);
  const [state, setState] = useState(() => {
    return {
      ready: cachedAvailability !== undefined,
      available: cachedAvailability ?? false,
    };
  });

  useEffect(() => {
    if (cachedAvailability !== undefined) {
      return;
    }

    let cancelled = false;

    fetch(assetUrl, {
      method: "HEAD",
      cache: "force-cache",
    })
      .then((response) => {
        const available = response.ok && isRenderableModelContentType(response.headers.get("content-type"));
        assetAvailabilityCache.set(assetUrl, available);
        if (!cancelled) {
          setState({ ready: true, available });
        }
      })
      .catch(() => {
        assetAvailabilityCache.set(assetUrl, false);
        if (!cancelled) {
          setState({ ready: true, available: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assetUrl, cachedAvailability]);

  return {
    assetUrl,
    available: cachedAvailability ?? state.available,
    ready: cachedAvailability !== undefined || state.ready,
  };
}
