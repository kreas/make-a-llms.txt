import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { buildOpenApiDocument } from '../src/lib/openapi/document';

const outDir = path.resolve(process.cwd(), 'public');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'openapi.json');

const doc = buildOpenApiDocument({ publicBaseUrl: process.env.PUBLIC_BASE_URL });
writeFileSync(outPath, JSON.stringify(doc, null, 2));
console.log(`Wrote ${outPath}`);
