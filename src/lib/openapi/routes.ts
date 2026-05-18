import {
  createGenerationV1Schema,
  generationCancelledSchema,
  generationCreatedSchema,
  generationListSchema,
  generationStatusEnum,
  generationViewSchema,
  pageManifestSchema,
  errorSchema,
} from './schemas';

export const v1Routes = {
  listGenerations: {
    method: 'get',
    path: '/generations',
    summary: 'List recent generations',
    tags: ['generations'],
    queryParams: {
      siteId: { type: 'string' as const, format: 'uuid', required: false },
      status: { type: 'string' as const, required: false, enum: generationStatusEnum.options },
      limit: { type: 'integer' as const, required: false },
    },
    responses: {
      200: { description: 'OK', schema: generationListSchema },
      400: { description: 'Validation error', schema: errorSchema },
      401: { description: 'Unauthenticated', schema: errorSchema },
    },
  },
  createGeneration: {
    method: 'post',
    path: '/generations',
    summary: 'Kick off a generation',
    tags: ['generations'],
    requestBody: createGenerationV1Schema,
    responses: {
      201: { description: 'Created', schema: generationCreatedSchema },
      400: { description: 'Validation error', schema: errorSchema },
      401: { description: 'Unauthenticated', schema: errorSchema },
      404: { description: 'Site not found', schema: errorSchema },
    },
  },
  cancelGeneration: {
    method: 'post',
    path: '/generations/{id}/cancel',
    summary: 'Cancel a generation',
    tags: ['generations'],
    pathParams: { id: 'uuid' as const },
    responses: {
      200: { description: 'OK', schema: generationCancelledSchema },
      401: { description: 'Unauthenticated', schema: errorSchema },
      404: { description: 'Not found', schema: errorSchema },
    },
  },
  getPagesZip: {
    method: 'get',
    path: '/generations/{id}/pages.zip',
    summary: 'Download all pages as a zip',
    tags: ['generations'],
    pathParams: { id: 'uuid' as const },
    responses: {
      200: { description: 'OK', contentType: 'application/zip' },
      401: { description: 'Unauthenticated', schema: errorSchema },
      404: { description: 'Not ready or not found', schema: errorSchema },
    },
  },
  getGeneration: {
    method: 'get',
    path: '/generations/{id}',
    summary: 'Get generation status',
    tags: ['generations'],
    pathParams: { id: 'uuid' as const },
    responses: {
      200: { description: 'OK', schema: generationViewSchema },
      401: { description: 'Unauthenticated', schema: errorSchema },
      404: { description: 'Not found', schema: errorSchema },
    },
  },
  getLlmsTxt: {
    method: 'get',
    path: '/generations/{id}/llms.txt',
    summary: 'Download llms.txt',
    tags: ['generations'],
    pathParams: { id: 'uuid' as const },
    responses: {
      200: { description: 'OK', contentType: 'text/plain' },
      401: { description: 'Unauthenticated', schema: errorSchema },
      404: { description: 'Not ready or not found', schema: errorSchema },
    },
  },
  getLlmsFullTxt: {
    method: 'get',
    path: '/generations/{id}/llms-full.txt',
    summary: 'Download llms-full.txt',
    tags: ['generations'],
    pathParams: { id: 'uuid' as const },
    responses: {
      200: { description: 'OK', contentType: 'text/plain' },
      401: { description: 'Unauthenticated', schema: errorSchema },
      404: { description: 'Not ready or not found', schema: errorSchema },
    },
  },
  getPages: {
    method: 'get',
    path: '/generations/{id}/pages',
    summary: 'List page manifest',
    tags: ['generations'],
    pathParams: { id: 'uuid' as const },
    responses: {
      200: { description: 'OK', schema: pageManifestSchema },
      401: { description: 'Unauthenticated', schema: errorSchema },
      404: { description: 'Not found', schema: errorSchema },
    },
  },
  getPage: {
    method: 'get',
    path: '/generations/{id}/pages/{path}',
    summary: 'Get one page as markdown',
    tags: ['generations'],
    pathParams: { id: 'uuid' as const, path: 'string' as const },
    responses: {
      200: { description: 'OK', contentType: 'text/markdown' },
      401: { description: 'Unauthenticated', schema: errorSchema },
      404: { description: 'Not found', schema: errorSchema },
    },
  },
} as const;

export type V1Route = (typeof v1Routes)[keyof typeof v1Routes];
