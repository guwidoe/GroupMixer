import { getLocaleHrefLang, type SupportedLocale, type ToolPageAlternateLink, type ToolPageFaqEntry } from '../pages/toolPageConfigs';

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
