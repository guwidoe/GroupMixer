import { describe, expect, it } from 'vitest';
import { buildSeoDocument } from './seoDocument';

describe('buildSeoDocument locale SEO metadata', () => {
  it('builds locale-aware canonical and alternate URLs', () => {
    const documentData = buildSeoDocument({
      title: 'Título',
      description: 'Descripción',
      canonicalPath: '/es',
      locale: 'es',
      alternates: [
        { hreflang: 'en', canonicalPath: '/' },
        { hreflang: 'es', canonicalPath: '/es' },
        { hreflang: 'x-default', canonicalPath: '/' },
      ],
      faqEntries: [],
    });

    expect(documentData.htmlLang).toBe('es');
    expect(documentData.canonicalUrl).toBe('https://www.groupmixer.app/es');
    expect(documentData.alternateLinks).toEqual([
      { hreflang: 'en', href: 'https://www.groupmixer.app/' },
      { hreflang: 'es', href: 'https://www.groupmixer.app/es' },
      { hreflang: 'x-default', href: 'https://www.groupmixer.app/' },
    ]);
    expect(documentData.schemaText).toContain('"WebSite"');
    expect(documentData.schemaText).toContain('"Organization"');
    expect(documentData.schemaText).toContain('"inLanguage":"es"');
  });

  it('labels Simplified Chinese alternates and schema language correctly', () => {
    const documentData = buildSeoDocument({
      title: '标题',
      description: '描述',
      canonicalPath: '/zh',
      locale: 'zh',
      alternates: [
        { hreflang: 'en', canonicalPath: '/' },
        { hreflang: 'zh-Hans', canonicalPath: '/zh' },
        { hreflang: 'x-default', canonicalPath: '/' },
      ],
      faqEntries: [],
    });

    expect(documentData.htmlLang).toBe('zh-Hans');
    expect(documentData.alternateLinks[1]).toEqual({
      hreflang: 'zh-Hans',
      href: 'https://www.groupmixer.app/zh',
    });
    expect(documentData.schemaText).toContain('"inLanguage":"zh-Hans"');
  });

  it('includes site identity schema for GroupMixer and its owner', () => {
    const documentData = buildSeoDocument({
      title: 'GroupMixer',
      description: 'Browser-based group assignment tool',
      canonicalPath: '/',
      faqEntries: [],
    });

    expect(documentData.schemaText).toContain('"name":"GroupMixer"');
    expect(documentData.schemaText).toContain('"founder":{"@type":"Person","name":"Guido Witt-Dörring"}');
  });
});
