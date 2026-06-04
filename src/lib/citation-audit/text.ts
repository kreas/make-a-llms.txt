export type Section = {
  // Heading level (1-6), or null for lead content before the first heading.
  // NOTE: when sections come from the Readability-cleaned DOM, Readability
  // normalizes heading levels (e.g. rewrites <h1> to <h2>), so `level` reflects
  // that normalized DOM, not the source markup. Only `wordCount` is currently consumed.
  level: number | null;
  heading: string | null;
  wordCount: number;
};

/** Count whitespace-separated word tokens. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\s+/).length;
}

const HEADING_RE = /^h[1-6]$/;

/** Trimmed text of every non-empty <p> under `root`, in document order. */
export function extractParagraphs(root: Element): string[] {
  return Array.from(root.querySelectorAll('p'))
    .map((p) => (p.textContent ?? '').trim())
    .filter((t) => t.length > 0);
}

/**
 * Split `root` into sections delimited by headings (depth-first, document order).
 * Each heading opens a new section; text nodes add to the current section's word
 * count; a heading's own text is the section label, not body. Content before the
 * first heading is a `heading: null` section. Zero-word sections are dropped.
 */
export function extractSections(root: Element): Section[] {
  const sections: Section[] = [{ level: null, heading: null, wordCount: 0 }];
  let current = sections[0];

  function walk(node: Node): void {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (HEADING_RE.test(tag)) {
          current = {
            level: Number(tag[1]),
            heading: (el.textContent ?? '').trim() || null,
            wordCount: 0,
          };
          sections.push(current);
        } else {
          walk(el);
        }
      } else if (child.nodeType === 3) {
        current.wordCount += countWords(child.textContent ?? '');
      }
    }
  }

  walk(root);
  return sections.filter((s) => s.wordCount > 0);
}
