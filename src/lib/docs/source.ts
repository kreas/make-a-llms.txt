import { loader } from 'fumadocs-core/source';
import { openapiSource } from 'fumadocs-openapi/server';
import type { Root } from 'fumadocs-core/page-tree';
import { docs, blog } from '../../../.source/server';
import { openapi } from './openapi';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});

export const blogSource = loader({
  baseUrl: '/blog',
  source: blog.toFumadocsSource(),
});

let _apiSourcePromise: ReturnType<typeof buildApiSource> | null = null;

async function buildApiSource() {
  const src = await openapiSource(openapi);
  return loader(src, { baseUrl: '/docs/api' });
}

export function getApiSource() {
  if (!_apiSourcePromise) _apiSourcePromise = buildApiSource();
  return _apiSourcePromise;
}

/**
 * Page tree merging the MDX docs tree with the OpenAPI operations tree, so the
 * docs sidebar lists both. Routing is unchanged: MDX → /docs/[[...slug]], and
 * OpenAPI → /docs/api/[[...slug]].
 */
export async function getMergedPageTree(): Promise<Root> {
  const apiSource = await getApiSource();
  const children = [...source.pageTree.children];
  const legalIndex = children.findIndex(
    (child) =>
      child.type === 'separator' &&
      typeof child.name === 'string' &&
      child.name.toLowerCase().includes('legal'),
  );

  const apiTokenNode = {
    type: 'page' as const,
    name: 'API Tokens',
    url: '/settings/api-tokens',
  };

  if (legalIndex !== -1) {
    children.splice(legalIndex, 0, ...apiSource.pageTree.children, apiTokenNode);
  } else {
    children.push(...apiSource.pageTree.children, apiTokenNode);
  }

  return {
    ...source.pageTree,
    children,
  };
}
