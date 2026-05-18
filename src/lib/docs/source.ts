import { loader } from 'fumadocs-core/source';
import { openapiSource } from 'fumadocs-openapi/server';
import type { Root } from 'fumadocs-core/page-tree';
import { docs } from '../../../.source/server';
import { openapi } from './openapi';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});

let _apiSourcePromise: ReturnType<typeof buildApiSource> | null = null;

async function buildApiSource() {
  const src = await openapiSource(openapi);
  return loader(src, { baseUrl: '/docs/api' });
}

function getApiSource() {
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
  return {
    ...source.pageTree,
    children: [...source.pageTree.children, ...apiSource.pageTree.children],
  };
}
