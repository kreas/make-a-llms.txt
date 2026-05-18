import { createOpenAPI } from 'fumadocs-openapi/server';
import { createAPIPage } from 'fumadocs-openapi/ui';

export const openapi = createOpenAPI({
  input: ['./public/openapi.json'],
});

// The document ID is the file path used in the `input` array above.
export const OPENAPI_DOCUMENT_ID = './public/openapi.json';

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
