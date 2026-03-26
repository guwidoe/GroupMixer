import { useEffect } from 'react';
import type { ToolPageFaqEntry } from '../pages/toolPageConfigs';

const CANONICAL_ORIGIN = 'https://www.groupmixer.app';
const DEFAULT_OG_IMAGE = `${CANONICAL_ORIGIN}/og-image.png`;

interface SeoProps {
  title: string;
  description: string;
  canonicalPath: string;
  faqEntries?: ToolPageFaqEntry[];
  indexable?: boolean;
  includeStructuredData?: boolean;
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

export function Seo({
  title,
  description,
  canonicalPath,
  faqEntries = [],
  indexable = true,
  includeStructuredData = true,
}: SeoProps) {
  useEffect(() => {
    const canonicalUrl = `${CANONICAL_ORIGIN}${canonicalPath === '/' ? '/' : canonicalPath}`;

    document.title = title;
    ensureMeta('meta[name="title"]', 'name', 'title').content = title;
    ensureMeta('meta[name="description"]', 'name', 'description').content = description;
    ensureMeta('meta[property="og:type"]', 'property', 'og:type').content = 'website';
    ensureMeta('meta[property="og:site_name"]', 'property', 'og:site_name').content = 'GroupMixer';
    ensureMeta('meta[property="og:title"]', 'property', 'og:title').content = title;
    ensureMeta('meta[property="og:description"]', 'property', 'og:description').content = description;
    ensureMeta('meta[property="og:url"]', 'property', 'og:url').content = canonicalUrl;
    ensureMeta('meta[property="og:image"]', 'property', 'og:image').content = DEFAULT_OG_IMAGE;
    ensureMeta('meta[name="twitter:card"]', 'name', 'twitter:card').content = 'summary_large_image';
    ensureMeta('meta[name="twitter:title"]', 'name', 'twitter:title').content = title;
    ensureMeta('meta[name="twitter:description"]', 'name', 'twitter:description').content = description;
    ensureMeta('meta[name="twitter:image"]', 'name', 'twitter:image').content = DEFAULT_OG_IMAGE;
    ensureMeta('meta[name="twitter:url"]', 'name', 'twitter:url').content = canonicalUrl;
    ensureMeta('meta[name="robots"]', 'name', 'robots').content = indexable ? 'index,follow' : 'noindex,nofollow';

    ensureCanonicalLink().href = canonicalUrl;

    if (!includeStructuredData) {
      const existingSchema = document.getElementById('groupmixer-route-schema');
      if (existingSchema instanceof HTMLScriptElement) {
        existingSchema.textContent = '';
      }
      return;
    }

    const schemaNodes: Array<Record<string, unknown>> = [
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'GroupMixer',
        url: canonicalUrl,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web Browser',
        description,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
    ];

    if (faqEntries.length > 0) {
      schemaNodes.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqEntries.map((entry) => ({
          '@type': 'Question',
          name: entry.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: entry.answer,
          },
        })),
      });
    }

    ensureJsonLdScript().textContent = JSON.stringify(schemaNodes.length === 1 ? schemaNodes[0] : schemaNodes);
  }, [canonicalPath, description, faqEntries, includeStructuredData, indexable, title]);

  return null;
}

export { CANONICAL_ORIGIN };
