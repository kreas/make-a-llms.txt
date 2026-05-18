import { notFound } from 'next/navigation';
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { loader } from 'fumadocs-core/source';
import { openapi, APIPage } from '@/lib/docs/openapi';
import { openapiSource } from 'fumadocs-openapi/server';
import type { OpenAPIPageData } from 'fumadocs-openapi/server';
import type { TOCItemType } from 'fumadocs-core/toc';

type Props = { params: Promise<{ slug?: string[] }> };

// Build the openapi source loader lazily; cache between requests in the same process.
let _sourcePromise: ReturnType<typeof buildSource> | null = null;

async function buildSource() {
  const src = await openapiSource(openapi);
  return loader(src, { baseUrl: '/docs/api' });
}

function getSource() {
  if (!_sourcePromise) _sourcePromise = buildSource();
  return _sourcePromise;
}

export default async function ApiPage({ params }: Props) {
  const { slug = [] } = await params;
  const source = await getSource();
  const page = source.getPage(slug) as
    | { data: OpenAPIPageData; url: string }
    | undefined;
  if (!page) notFound();

  const props = page.data.getAPIPageProps();
  const schema = page.data.getSchema();
  const firstOp = props.operations?.[0];
  const op = firstOp
    ? schema.dereferenced.paths?.[firstOp.path]?.[firstOp.method]
    : undefined;
  const title = op?.summary ?? op?.operationId ?? 'API Reference';

  const toc: TOCItemType[] = [];
  if (op) {
    const hasAuth =
      (Array.isArray(op.security) && op.security.length > 0) ||
      (Array.isArray(schema.dereferenced.security) &&
        schema.dereferenced.security.length > 0);
    if (hasAuth) toc.push({ url: '#authorization', title: 'Authorization', depth: 2 });

    const paramTypes = [
      ['path', 'Path Parameters'],
      ['query', 'Query Parameters'],
      ['header', 'Header Parameters'],
      ['cookie', 'Cookie Parameters'],
    ] as const;
    const params: Array<{ in?: string }> = Array.isArray(op.parameters) ? op.parameters : [];
    for (const [kind, label] of paramTypes) {
      if (params.some((p) => p.in === kind)) {
        toc.push({ url: `#parameters-${kind}`, title: label, depth: 2 });
      }
    }

    if (op.requestBody) toc.push({ url: '#request-body', title: 'Request Body', depth: 2 });
    if (op.responses && Object.keys(op.responses).length > 0) {
      toc.push({ url: '#response-body', title: 'Response Body', depth: 2 });
    }
  }

  return (
    <DocsPage toc={page.data.toc.length > 0 ? page.data.toc : toc}>
      <DocsTitle>{title}</DocsTitle>
      <DocsBody>
        <APIPage {...props} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  const source = await getSource();
  return source.generateParams();
}
