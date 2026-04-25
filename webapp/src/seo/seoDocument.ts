import { getLocaleHrefLang, type SupportedLocale, type ToolPageAlternateLink, type ToolPageFaqEntry } from '../pages/toolPageConfigs';
import { SITE_LEGAL_CONFIG } from '../legal/legalConfig';

export const CANONICAL_ORIGIN = 'https://www.groupmixer.app';
export const DEFAULT_OG_IMAGE = `${CANONICAL_ORIGIN}/og-image.png`;

export interface SeoAlternateLinkData {
  hreflang: string;
  href: string;
}

export interface SeoDocumentInput {
  title: string;
  description: string;
  canonicalPath: string;
  faqEntries?: ToolPageFaqEntry[];
  indexable?: boolean;
  includeStructuredData?: boolean;
  locale?: SupportedLocale;
  alternates?: ToolPageAlternateLink[];
}

export interface SeoDocumentData {
  title: string;
  description: string;
  canonicalUrl: string;
  robotsContent: string;
  schemaText: string;
  htmlLang: string;
  alternateLinks: SeoAlternateLinkData[];
}

export function buildCanonicalUrl(canonicalPath: string): string {
  return `${CANONICAL_ORIGIN}${canonicalPath === '/' ? '/' : canonicalPath}`;
}

export function buildSeoDocument({
  title,
  description,
  canonicalPath,
  faqEntries = [],
  indexable = true,
  includeStructuredData = true,
  locale = 'en',
  alternates = [],
}: SeoDocumentInput): SeoDocumentData {
  const canonicalUrl = buildCanonicalUrl(canonicalPath);
  const robotsContent = indexable ? 'index,follow' : 'noindex,nofollow';
  const htmlLang = getLocaleHrefLang(locale);
  const alternateLinks = alternates.map((alternate) => ({
    hreflang: alternate.hreflang,
    href: buildCanonicalUrl(alternate.canonicalPath),
  }));

  if (!includeStructuredData) {
    return {
      title,
      description,
      canonicalUrl,
      robotsContent,
      schemaText: '',
      htmlLang,
      alternateLinks,
    };
  }

  const schemaNodes: Array<Record<string, unknown>> = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_LEGAL_CONFIG.siteName,
      url: CANONICAL_ORIGIN,
      inLanguage: htmlLang,
      publisher: {
        '@type': 'Organization',
        name: SITE_LEGAL_CONFIG.siteName,
        url: CANONICAL_ORIGIN,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_LEGAL_CONFIG.siteName,
      url: CANONICAL_ORIGIN,
      logo: DEFAULT_OG_IMAGE,
      description: 'Personal project behind the GroupMixer website and browser-based group assignment tool.',
      founder: {
        '@type': 'Person',
        name: SITE_LEGAL_CONFIG.ownerName,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'GroupMixer',
      url: canonicalUrl,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web Browser',
      description,
      inLanguage: htmlLang,
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
      inLanguage: htmlLang,
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

  return {
    title,
    description,
    canonicalUrl,
    robotsContent,
    schemaText: JSON.stringify(schemaNodes.length === 1 ? schemaNodes[0] : schemaNodes),
    htmlLang,
    alternateLinks,
  };
}
