import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { buildSeoDocument, CANONICAL_ORIGIN, DEFAULT_OG_IMAGE } from '../src/seo/seoDocument.ts';
import { getToolPageConfig, TOOL_PAGE_ROUTES } from '../src/pages/toolPageConfigs.ts';
import { getAppSeo } from '../src/seo/appRouteSeo.ts';

type StorageShape = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  key: (index: number) => string | null;
  readonly length: number;
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const webappDir = path.resolve(currentDir, '..');
const publicDir = path.join(webappDir, 'public');
const distDir = path.join(webappDir, 'dist');
const distIndexPath = path.join(distDir, 'index.html');

function createStorage(): StorageShape {
  const store = new Map<string, string>();

  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

function defineGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

function installRenderGlobals() {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  const matchMedia = () => ({
    matches: false,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });

  const windowLike = {
    localStorage,
    sessionStorage,
    matchMedia,
    navigator: { userAgent: 'seo-prerender' },
    location: { href: CANONICAL_ORIGIN },
  } as unknown as Window & typeof globalThis;

  defineGlobal('window', windowLike);
  defineGlobal('localStorage', localStorage);
  defineGlobal('sessionStorage', sessionStorage);
  defineGlobal('navigator', windowLike.navigator);
  defineGlobal('React', React);
  defineGlobal('WebGLRenderingContext', class WebGLRenderingContext {});
  defineGlobal('WebGL2RenderingContext', class WebGL2RenderingContext {});
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function replaceOrThrow(html: string, pattern: RegExp, replacement: string): string {
  if (!pattern.test(html)) {
    throw new Error(`Expected pattern not found during SEO artifact generation: ${pattern}`);
  }

  return html.replace(pattern, replacement);
}

function applySeoDocument(templateHtml: string, rootMarkup: string, seo: ReturnType<typeof buildSeoDocument>): string {
  let html = templateHtml;

  html = replaceOrThrow(html, /<html lang="[^"]*">/, `<html lang="${seo.htmlLang}">`);
  html = replaceOrThrow(html, /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(seo.title)}</title>`);
  html = replaceOrThrow(html, /<meta name="title" content="[^"]*"\s*\/>/, `<meta name="title" content="${escapeHtml(seo.title)}" />`);
  html = replaceOrThrow(html, /<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeHtml(seo.description)}" />`);
  html = replaceOrThrow(html, /<meta name="robots" content="[^"]*"\s*\/>/, `<meta name="robots" content="${seo.robotsContent}" />`);
  html = replaceOrThrow(
    html,
    /<link rel="canonical" href="[^"]*"\s*\/>/,
    [
      `<link rel="canonical" href="${seo.canonicalUrl}" />`,
      ...seo.alternateLinks.map(
        (alternate) => `<link rel="alternate" hreflang="${alternate.hreflang}" href="${alternate.href}" />`,
      ),
    ].join('\n    '),
  );
  html = replaceOrThrow(html, /<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${seo.canonicalUrl}" />`);
  html = replaceOrThrow(html, /<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeHtml(seo.title)}" />`);
  html = replaceOrThrow(html, /<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escapeHtml(seo.description)}" />`);
  html = replaceOrThrow(html, /<meta property="og:image" content="[^"]*"\s*\/>/, `<meta property="og:image" content="${DEFAULT_OG_IMAGE}" />`);
  html = replaceOrThrow(html, /<meta name="twitter:url" content="[^"]*"\s*\/>/, `<meta name="twitter:url" content="${seo.canonicalUrl}" />`);
  html = replaceOrThrow(html, /<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${escapeHtml(seo.title)}" />`);
  html = replaceOrThrow(html, /<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${escapeHtml(seo.description)}" />`);
  html = replaceOrThrow(html, /<meta name="twitter:image" content="[^"]*"\s*\/>/, `<meta name="twitter:image" content="${DEFAULT_OG_IMAGE}" />`);
  html = replaceOrThrow(
    html,
    /<script id="groupmixer-route-schema" type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script id="groupmixer-route-schema" type="application/ld+json">\n${seo.schemaText}\n    </script>`,
  );
  html = replaceOrThrow(html, /<div id="root"><\/div>/, `<div id="root">${rootMarkup}</div>`);

  return html;
}

function buildSitemapXml(): string {
  const urls = TOOL_PAGE_ROUTES.map(({ key, locale, path: routePath }) => {
    const config = getToolPageConfig(key, locale);
    const suffix = routePath === '/' ? '/' : routePath;
    const alternateLinks = config.alternates
      .map(
        (alternate) =>
          `    <xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${CANONICAL_ORIGIN}${alternate.canonicalPath === '/' ? '/' : alternate.canonicalPath}" />`,
      )
      .join('\n');

    return `  <url>\n    <loc>${CANONICAL_ORIGIN}${suffix}</loc>\n${alternateLinks}\n  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

async function writeSitemap(targetDir: string) {
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(path.join(targetDir, 'sitemap.xml'), buildSitemapXml(), 'utf8');
}

async function renderRouteMarkup(routePath: string): Promise<string> {
  installRenderGlobals();
  const { default: App } = await import('../src/App.tsx');

  return renderToString(
    React.createElement(
      MemoryRouter,
      { initialEntries: [routePath] },
      React.createElement(App),
    ),
  );
}

async function renderLandingPages(templateHtml: string) {
  for (const route of TOOL_PAGE_ROUTES) {
    const config = getToolPageConfig(route.key, route.locale);
    const seo = buildSeoDocument({
      title: config.seo.title,
      description: config.seo.description,
      canonicalPath: config.canonicalPath,
      faqEntries: config.faqEntries,
      locale: config.locale,
      alternates: config.alternates,
    });
    const markup = await renderRouteMarkup(config.canonicalPath);
    const html = applySeoDocument(templateHtml, markup, seo);
    const outputPath = config.canonicalPath === '/'
      ? distIndexPath
      : path.join(distDir, config.canonicalPath.replace(/^\//, ''), 'index.html');

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, html, 'utf8');
  }
}

async function renderAppShell(templateHtml: string) {
  const appSeo = getAppSeo('/app');
  const seo = buildSeoDocument({
    title: appSeo.title,
    description: appSeo.description,
    canonicalPath: '/app',
    indexable: false,
    includeStructuredData: false,
  });
  const markup = await renderRouteMarkup('/app');
  const html = applySeoDocument(templateHtml, markup, seo);
  const outputPath = path.join(distDir, 'app', 'index.html');

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html, 'utf8');
}

async function syncPublicArtifacts() {
  await writeSitemap(publicDir);
}

async function prerenderDistArtifacts() {
  await fs.access(distIndexPath);
  const templateHtml = await fs.readFile(distIndexPath, 'utf8');
  await writeSitemap(distDir);
  await renderLandingPages(templateHtml);
  await renderAppShell(templateHtml);
}

async function main() {
  const mode = process.argv[2];

  if (mode === 'sync-public') {
    await syncPublicArtifacts();
    return;
  }

  if (mode === 'prerender-dist') {
    await prerenderDistArtifacts();
    return;
  }

  throw new Error('Usage: tsx scripts/seoArtifacts.tsx <sync-public|prerender-dist>');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
