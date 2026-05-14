import { notFound } from 'next/navigation';
import { DocsBody, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { loader } from 'fumadocs-core/source';
import { openapi, APIPage } from '@/lib/docs/openapi';
import { openapiSource } from 'fumadocs-openapi/server';
import type { OpenAPIPageData } from 'fumadocs-openapi/server';

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
  const title =
    props.operations?.[0]
      ? (() => {
          const schema = page.data.getSchema();
          const op =
            schema.dereferenced.paths?.[props.operations[0].path]?.[
              props.operations[0].method
            ];
          return op?.summary ?? op?.operationId ?? 'API';
        })()
      : 'API Reference';

  return (
    <DocsPage toc={page.data.toc}>
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
