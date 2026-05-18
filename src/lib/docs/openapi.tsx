import { createOpenAPI } from 'fumadocs-openapi/server';
import { createAPIPage } from 'fumadocs-openapi/ui';
import openapiJson from '../../../public/openapi.json';

// The document ID fumadocs uses to look the schema up internally. Kept as a
// constant so anything else referencing the schema can target the same key.
export const OPENAPI_DOCUMENT_ID = './public/openapi.json';

// Inline the OpenAPI document via a static import instead of letting fumadocs
// resolve a relative file path at runtime. Vercel functions don't ship the
// project's `./public` tree at the cwd we have locally, so the path-based
// resolver throws `Failed to resolve input: ./public/openapi.json` in prod.
export const openapi = createOpenAPI({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: () => ({ [OPENAPI_DOCUMENT_ID]: openapiJson as any }),
});

// APIPage component for rendering individual operations. Force a single-column
// layout: the default puts request playground + example side-by-side at
// container width >= @4xl, which is cramped at our docs body width.
export const APIPage = createAPIPage(openapi, {
  content: {
    renderOperationLayout: (slots) => (
      <div className="ai-ready-operation flex flex-col">
        {slots.header}
        {slots.apiPlayground}
        {slots.description}
        {slots.authSchemes}
        {slots.parameters}
        {slots.body}
        {slots.responses}
        {slots.apiExample}
        {slots.callbacks}
      </div>
    ),
  },
});
