import type { GeoSignalDef } from '../types';

const RX = /\b(add to (cart|bag)|sku|in stock|out of stock|size guide|materials?|dimensions|specifications?|product details?|shop now|choose (a )?size)\b/i;

export const productDetail: GeoSignalDef = {
  id: 'product-detail',
  label: 'Product detail',
  tags: ['value'],
  defaultWeight: 25,
  urlPatterns: ['**/products**', '**/product/**', '**/shop**', '**/collections**'],
  gate: (p) =>
    RX.test(p.markdown)
      ? { signalId: 'product-detail', url: p.url, path: p.path, reason: 'Product specs / purchase details present' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether a web page gives real PRODUCT DETAIL for ${e} — specs, materials, sizes, SKUs, or attributes — not just photos and a name. Set confirmed=true only if concrete product detail is present. If confirmed, set artifact like "specs + sizes on product pages"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Give products real detail — specs, materials, sizes — not just an image. AI recommends products it can describe and compare.',
};
