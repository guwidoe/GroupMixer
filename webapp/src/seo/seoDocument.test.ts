import { describe, expect, it } from 'vitest';
import { buildSeoDocument } from './seoDocument';

describe('buildSeoDocument locale SEO metadata', () => {
  it('builds locale-aware canonical and alternate URLs', () => {
    const documentData = buildSeoDocument({
      title: 'Título',
      description: 'Descripción',
      canonicalPath: '/es/random-team-generator',
      locale: 'es',
      alternates: [
        { hreflang: 'en', canonicalPath: '/random-team-generator' },
        { hreflang: 'es', canonicalPath: '/es/random-team-generator' },
        { hreflang: 'x-default', canonicalPath: '/random-team-generator' },
      ],
      faqEntries: [],
    });

    expect(documentData.htmlLang).toBe('es');
    expect(documentData.canonicalUrl).toBe('https://www.groupmixer.app/es/random-team-generator');
    expect(documentData.alternateLinks).toEqual([
      { hreflang: 'en', href: 'https://www.groupmixer.app/random-team-generator' },
      { hreflang: 'es', href: 'https://www.groupmixer.app/es/random-team-generator' },
      { hreflang: 'x-default', href: 'https://www.groupmixer.app/random-team-generator' },
    ]);
    expect(documentData.schemaText).toContain('"inLanguage":"es"');
  });

  it('labels Simplified Chinese alternates and schema language correctly', () => {
    const documentData = buildSeoDocument({
      title: '标题',
      description: '描述',
      canonicalPath: '/zh/random-team-generator',
      locale: 'zh',
      alternates: [
        { hreflang: 'en', canonicalPath: '/random-team-generator' },
        { hreflang: 'zh-Hans', canonicalPath: '/zh/random-team-generator' },
        { hreflang: 'x-default', canonicalPath: '/random-team-generator' },
      ],
      faqEntries: [],
    });

    expect(documentData.htmlLang).toBe('zh-Hans');
    expect(documentData.alternateLinks[1]).toEqual({
      hreflang: 'zh-Hans',
      href: 'https://www.groupmixer.app/zh/random-team-generator',
    });
    expect(documentData.schemaText).toContain('"inLanguage":"zh-Hans"');
  });
});
