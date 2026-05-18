import { z } from 'zod';

export const PAGE_TYPES = [
  'homepage',
  'service',
  'product',
  'article',
  'case_study',
  'about',
  'other',
] as const;

export type PageType = (typeof PAGE_TYPES)[number];

export const summarySchema = z.object({
  summary: z.string(),
  page_type: z.enum(PAGE_TYPES),
});

export const SUMMARY_SYSTEM_PROMPT = `You are writing a summary that will appear in an llms.txt index. The summary
helps an AI model decide whether this page is relevant to a user's question
and what it will find if it fetches the page.

INPUT
- URL: {url}
- Page title: {title}
- Site entity: {entity_name}
- Cleaned markdown content: {content}

OUTPUT
Return only the summary text and a page_type classification. No preamble, no
quotes, no markdown, no labels.

LENGTH
2 sentences. 3 only if the page is genuinely multi-part (e.g., a long guide
covering distinct topics). Hard cap: 60 words.

STRUCTURE
Sentence 1: Lead with the entity or page subject. State what the page is or
what it offers. Third person, declarative.
Sentence 2: Name a specific differentiator, audience, or concrete detail
pulled from the actual content (named clients, products, numbers, locations,
technologies, methods).

VOICE
- Third person only. No "we", "our", "us", "you", "your".
- Active voice. Present tense.
- Specifics from the content beat abstractions. If the page names clients,
  name them. If it gives a number, use the number.
- Match the entity's existing tone if it's clear from the content, but never
  at the expense of clarity.

FORBIDDEN PUNCTUATION
- Em dashes. Use commas, colons, periods, or parentheses instead.
- En dashes between clauses.
- Semicolons unless joining two short independent clauses cleanly.

FORBIDDEN WORDS AND PHRASES
- Marketing adjectives: innovative, cutting-edge, seamless, robust, leading,
  world-class, best-in-class, comprehensive, holistic, transformative,
  revolutionary, premier, dynamic, scalable, synergistic, next-generation.
- AI-pattern verbs: leverage, navigate, delve, explore, dive into, unlock,
  harness, empower, elevate, foster, streamline.
- Filler openers: "In today's [X] world/landscape/environment", "When it
  comes to", "It is worth noting that".
- Vague claims: "helps businesses grow", "provides solutions", "drives
  results", "delivers value".
- Rhetorical questions, calls to action, exclamations.

PAGE TYPE
Also classify this page as one of: homepage, service, product, article,
case_study, about, other.

EDGE CASES
- If the page is thin or mostly nav/boilerplate: write only what you can
  verify from the content. Do not invent details.
- If the entity is ambiguous or the page is a 404/login wall: set summary to
  exactly the string [NO_SUMMARY] and still return a best-guess page_type
  (or "other").
- If the title and h1 disagree: trust the content, then the h1, then the
  title.

EXAMPLES

GOOD (service page)
Civilization builds AI-native marketing tools for Fortune 500 clients
including Indeed, Chipotle, and Lone Star Beer. The Austin agency focuses
on custom internal apps over off-the-shelf software.

GOOD (technical article)
This guide covers video frame extraction with ffmpeg and PySceneDetect,
including batch processing and scene-change detection code. Written for
developers building video analysis pipelines.

GOOD (case study)
Finn is the AI hiring assistant Civilization built for Indeed, deployed
across enterprise accounts to triage candidate matches. The system uses
Claude for screening and cut recruiter triage time by 60%.

BAD (vague, AI patterns)
Civilization is a leading marketing agency that helps businesses leverage
AI to unlock their full potential and navigate the modern landscape.

BAD (first person, marketing fluff)
We're an Austin-based agency that builds custom AI tools for big-name
clients. Our team specializes in cutting-edge marketing innovation.

BAD (em dash, hedge words)
Civilization, an Austin AI marketing agency, delivers innovative
solutions that empower brands to thrive in today's dynamic landscape.

Now write the summary and classify the page.`;

export function buildSummaryPrompt(args: {
  url: string;
  title: string;
  entityName: string;
  content: string;
}): string {
  return SUMMARY_SYSTEM_PROMPT
    .replace('{url}', args.url)
    .replace('{title}', args.title)
    .replace('{entity_name}', args.entityName)
    .replace('{content}', args.content);
}
