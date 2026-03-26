import type { ToolPageFaqEntry } from '../pages/toolPageConfigs';

export const CANONICAL_ORIGIN = 'https://www.groupmixer.app';
export const DEFAULT_OG_IMAGE = `${CANONICAL_ORIGIN}/og-image.png`;

export interface SeoDocumentInput {
  title: string;
  description: string;
  canonicalPath: string;
  faqEntries?: ToolPageFaqEntry[];
  indexable?: boolean;
  includeStructuredData?: boolean;
}

export interface SeoDocumentData {
  title: string;
  description: string;
  canonicalUrl: string;
  robotsContent: string;
  schemaText: string;
}

export function buildSeoDocument({
  title,
  description,
  canonicalPath,
  faqEntries = [],
  indexable = true,
  includeStructuredData = true,
}: SeoDocumentInput): SeoDocumentData {
  const canonicalUrl = `${CANONICAL_ORIGIN}${canonicalPath === '/' ? '/' : canonicalPath}`;
  const robotsContent = indexable ? 'index,follow' : 'noindex,nofollow';

  if (!includeStructuredData) {
    return {
      title,
      description,
      canonicalUrl,
      robotsContent,
      schemaText: '',
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

  return {
    title,
    description,
    canonicalUrl,
    robotsContent,
    schemaText: JSON.stringify(schemaNodes.length === 1 ? schemaNodes[0] : schemaNodes),
  };
}
