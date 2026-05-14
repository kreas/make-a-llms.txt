import { createOpenAPI } from 'fumadocs-openapi/server';
import { createAPIPage } from 'fumadocs-openapi/ui';

export const openapi = createOpenAPI({
  input: ['./public/openapi.json'],
});

// The document ID is the file path used in the `input` array above.
export const OPENAPI_DOCUMENT_ID = './public/openapi.json';

// APIPage component for rendering individual operations.
export const APIPage = createAPIPage(openapi);
