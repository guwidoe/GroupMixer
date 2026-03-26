import { useEffect } from 'react';
import type { SupportedLocale, ToolPageAlternateLink, ToolPageFaqEntry } from '../pages/toolPageConfigs';
import { buildSeoDocument, DEFAULT_OG_IMAGE } from '../seo/seoDocument';

interface SeoProps {
  title: string;
  description: string;
  canonicalPath: string;
  faqEntries?: ToolPageFaqEntry[];
  indexable?: boolean;
  includeStructuredData?: boolean;
  locale?: SupportedLocale;
  alternates?: ToolPageAlternateLink[];
}

function ensureMeta(
  selector: string,
  attributeName: 'name' | 'property',
  attributeValue: string,
): HTMLMetaElement {
  const existing = document.head.querySelector(selector);
  if (existing instanceof HTMLMetaElement) {
    return existing;
  }

  const meta = document.createElement('meta');
  meta.setAttribute(attributeName, attributeValue);
  document.head.appendChild(meta);
  return meta;
}

function ensureCanonicalLink(): HTMLLinkElement {
  const existing = document.head.querySelector('link[rel="canonical"]');
  if (existing instanceof HTMLLinkElement) {
    return existing;
  }

  const link = document.createElement('link');
  link.rel = 'canonical';
  document.head.appendChild(link);
  return link;
}

function ensureJsonLdScript(): HTMLScriptElement {
  const existing = document.getElementById('groupmixer-route-schema');
  if (existing instanceof HTMLScriptElement) {
    return existing;
  }

  const script = document.createElement('script');
  script.id = 'groupmixer-route-schema';
  script.type = 'application/ld+json';
  document.head.appendChild(script);
  return script;
}

function replaceAlternateLinks(alternates: Array<{ hreflang: string; href: string }>) {
  document.head
    .querySelectorAll('link[rel="alternate"][data-groupmixer-hreflang="true"]')
    .forEach((element) => element.remove());

  for (const alternate of alternates) {
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = alternate.hreflang;
    link.href = alternate.href;
    link.dataset.groupmixerHreflang = 'true';
    document.head.appendChild(link);
  }
}

export function Seo({
  title,
  description,
  canonicalPath,
  faqEntries = [],
  indexable = true,
  includeStructuredData = true,
  locale = 'en',
  alternates = [],
}: SeoProps) {
  useEffect(() => {
    const documentData = buildSeoDocument({
      title,
      description,
      canonicalPath,
      faqEntries,
      indexable,
      includeStructuredData,
      locale,
      alternates,
    });

    document.title = title;
    document.documentElement.lang = documentData.htmlLang;
    ensureMeta('meta[name="title"]', 'name', 'title').content = title;
    ensureMeta('meta[name="description"]', 'name', 'description').content = description;
    ensureMeta('meta[property="og:type"]', 'property', 'og:type').content = 'website';
    ensureMeta('meta[property="og:site_name"]', 'property', 'og:site_name').content = 'GroupMixer';
    ensureMeta('meta[property="og:title"]', 'property', 'og:title').content = title;
    ensureMeta('meta[property="og:description"]', 'property', 'og:description').content = description;
    ensureMeta('meta[property="og:url"]', 'property', 'og:url').content = documentData.canonicalUrl;
    ensureMeta('meta[property="og:image"]', 'property', 'og:image').content = DEFAULT_OG_IMAGE;
    ensureMeta('meta[name="twitter:card"]', 'name', 'twitter:card').content = 'summary_large_image';
    ensureMeta('meta[name="twitter:title"]', 'name', 'twitter:title').content = title;
    ensureMeta('meta[name="twitter:description"]', 'name', 'twitter:description').content = description;
    ensureMeta('meta[name="twitter:image"]', 'name', 'twitter:image').content = DEFAULT_OG_IMAGE;
    ensureMeta('meta[name="twitter:url"]', 'name', 'twitter:url').content = documentData.canonicalUrl;
    ensureMeta('meta[name="robots"]', 'name', 'robots').content = documentData.robotsContent;

    ensureCanonicalLink().href = documentData.canonicalUrl;
    replaceAlternateLinks(documentData.alternateLinks);

    if (!includeStructuredData) {
      const existingSchema = document.getElementById('groupmixer-route-schema');
      if (existingSchema instanceof HTMLScriptElement) {
        existingSchema.textContent = '';
      }
      return;
    }

    ensureJsonLdScript().textContent = documentData.schemaText;
  }, [alternates, canonicalPath, description, faqEntries, includeStructuredData, indexable, locale, title]);

  return null;
}
