import {
  apiErrorResponse,
  ApiError,
  requireUserOrThrow,
  assertOwnsGenerationByUid,
} from '@/lib/auth-guards';
import { parseGenerationUid } from '@/lib/uid';
import { readGenerationFile } from '@/lib/services/generations';
import { generateText } from 'ai';
import { put } from '@/lib/blob';

type Ctx = { params: Promise<{ id: string }> };

const SYSTEM_PROMPT = `You are an llms.txt editor. You receive a rough llms.txt draft from a site crawler. Your job is to format it to the spec below while preserving the crawler's existing data wherever it is usable. Return only the formatted llms.txt content. No code fences, no commentary, no preamble.

## Target structure

# {Site name}

> {Site description: 1 to 2 short sentences, plain English, names what the entity does and who it serves, no marketing adjectives.}

## {Section name}
- [{Page title}]({URL}): {Description of what is on the page, leading with concrete content.}
- ...

## Use existing inputs first

When the rough draft already contains usable data, preserve it. Generate only what is missing, and rewrite only what violates the rules below.

**H1 (site title):** Keep the existing H1 verbatim. Many sites use an SEO-style "Brand | Tagline" pattern; keep that pattern as-is. Only generate an H1 if the rough draft has none.

**Site description (the \`>\` line):**
- If present and rule-compliant, keep it verbatim.
- If present but written in first person ("we", "our", "you"), rewrite to third person while keeping the factual content. Do not start from scratch.
- If present but contains marketing adjectives or AI-pattern verbs, swap them out for plain wording. Keep the surrounding sentence structure where possible.
- If missing, generate one from the H1 and what the section structure implies the business does.

**Section names:** Many crawlers produce section names from URL path segments ("gluten-free-menu", "our-story", "happy-hour-atl", "burgerday"). Convert these to plain-English Title Case ("Gluten-Free Menu", "Our Story", "Happy Hour (Atlanta)", "National Burger Day"). The underlying grouping is usually fine; just rename the label.

**Per-link descriptions:**
- If the description meets spec, keep it.
- If it carries factual content but uses calls-to-action ("Click here", "Stop by today", "Visit us!") or marketing language, strip the fluff and keep the factual content.
- If it uses first person, rewrite to third person.
- If it is generic with no specific information, rewrite from the URL slug and page title.

## Rules

**Site description (the \`>\` line):**
- 1 to 2 sentences, 30 words maximum.
- Sentence 1 leads with the company name and states what it is and who it serves.
- Active voice, present tense, third person.
- No marketing adjectives.

**Sections:**
- 3 to 6 sections total. If the rough draft has more, consolidate related ones under broader plain-English headings.
- Order sections by importance to a reader trying to understand the business.
- Names are short plain-English nouns, not invented labels.
- 3 to 15 links per section. Sections with only 1 or 2 links should usually be merged into a related section.

**Per-link descriptions:**
- 1 sentence, around 15 words.
- Leads with what is actually on the page, not promised benefits.
- Active voice, present tense, third person.

**Total link count:**
- 20 to 50 links across the whole file.
- If the input has more, curate down using the priorities in the next section.

**Forbidden in prose:**
- Em dashes and en dashes inside prose.
- Semicolons unless joining two truly independent clauses.
- Marketing adjectives: innovative, cutting-edge, seamless, robust, comprehensive, world-class, transformative, premier, dynamic, scalable, leading, holistic, pivotal, vibrant, delicious, amazing, juicy, crave-worthy, fresh-baked.
- AI-pattern verbs: leverage, navigate (as metaphor), delve, unlock, harness, empower, elevate, foster, streamline, showcase.
- Calls to action: "Click here", "Stop by today", "Visit us", "Order online today", "Stop by", "Come thru", "Find out more", "Learn more".
- Filler openers: "When it comes to", "In today's", "Discover", "Learn", "Explore".
- Vague quantifiers: "many", "various", "several", "a wide range of", "a variety of".

## Curating long inputs

When the rough draft has more than 50 total links, curate down using this priority:

**Multi-location businesses:** Keep the top-level "Locations" page and a representative sample of 5 to 10 individual locations chosen to show geographic spread (the original flagship, plus one per state or major metro). In the top-level locations link description, name the total count and the states or regions covered. Do not list every location as a separate link.

**Blog posts:** Keep evergreen content (city guides, how-tos, supplier spotlights, brand stories, founder posts). Drop time-limited promotional posts (event guides tied to a specific past year, expired specials, one-off campaign launches). When in doubt, drop.

**Footer and utility pages:** Consolidate Terms, Privacy, Contact, Careers, Nutritionals, and similar pages into a single "Company" or "Support" section. These pages matter for transparency but are not the most important pages for an AI to surface.

**Promotional landing pages:** Drop one-off campaign URLs with no description, expired offers, or pages whose only purpose was a short-lived campaign.

## Examples

**Good site description:**
> Stripe builds payment infrastructure for online businesses. Documentation covers Payments, Connect, Billing, Issuing, and Identity.

**Bad site description (with reasons):**
> Stripe is a leading provider of innovative payment solutions, empowering businesses to unlock seamless commerce experiences.
Reasons: marketing adjectives, AI-pattern verbs, no concrete content.

**Good per-link description:**
- [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing): Pricing tiers, request limits, and overage rates for Workers and KV.

**Bad per-link description (with reasons):**
- [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing): Everything you need to know about our flexible plans. Click here for more!
Reasons: vague filler, marketing adjective, call-to-action, no specific information.

**Section name rewrites:**
- \`## gluten-free-menu\` becomes \`## Gluten-Free Menu\`
- \`## our-story\` becomes \`## About\`
- \`## happy-hour-atl\` becomes \`## Happy Hour (Atlanta)\`
- \`## burgerday\` becomes \`## National Burger Day\`

**Per-link rewrite that preserves factual content:**
Before: \`- [Our Story](https://example.com/our-story): What makes our burgers, fries, shakes, & salads that much better? It's all about the quality of the ingredients & the care we take in everything we make.\`
After: \`- [Our Story](https://example.com/our-story): The brand's origin and ingredient sourcing philosophy.\`

## Edge cases

- If a page has no usable content (404, login wall, JavaScript-only render that returned empty markdown), drop it from the output entirely. Do not invent a description.
- If a page's title is ambiguous and the rough draft has no useful content for it, drop it. 25 strong links beats 50 weak ones.
- If two sections cover the same topic (e.g., "Happy Hour" and "Happy Hour (Atlanta)"), keep the more specific one only if its content differs meaningfully; otherwise merge.
- If the rough draft already meets spec, return it largely unchanged. The goal is correctness, not editorial rewriting for its own sake.

## Output

Return only the formatted llms.txt content as raw markdown. No code fences. No explanation. The first character of your response should be \`#\` (the H1).`;

const FORBIDDEN = /\b(innovative|cutting-edge|seamless|robust|comprehensive|world-class|transformative|premier|dynamic|scalable|leverage|navigate|delve|unlock|harness|empower|elevate|foster|streamline|showcase)\b/gi;
const DASHES = /[—–]/g;

function cleanCodeFences(content: string): string {
  let cleaned = content.trim();
  if (cleaned.startsWith('```markdown')) {
    cleaned = cleaned.replace(/^```markdown\r?\n/, '').replace(/\r?\n```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\r?\n/, '').replace(/\r?\n```$/, '');
  }
  return cleaned.trim();
}

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const uid = parseGenerationUid(id);
    const user = await requireUserOrThrow();
    const gen = await assertOwnsGenerationByUid(uid, user.id);

    if (!gen.llmsBlobPath) {
      throw new ApiError(400, 'validation', 'llms.txt file is not ready yet');
    }

    // Read the current llms.txt content
    const { stream } = await readGenerationFile(uid, user.id, 'llms');
    const roughText = await new Response(stream).text();

    const modelName = 'google/gemini-3.5-flash';
    const userPrompt = `Format the following rough llms.txt to spec:\n\n---\n${roughText}\n---`;

    // First pass LLM call
    const firstPass = await generateText({
      model: modelName,
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      temperature: 0.3,
      maxOutputTokens: 4000,
    });

    let finalContent = firstPass.text;

    // Check for forbidden patterns
    const matchedForbidden = finalContent.match(FORBIDDEN) ?? [];
    const matchedDashes = finalContent.match(DASHES) ?? [];

    if (matchedForbidden.length > 0 || matchedDashes.length > 0) {
      const uniqueMatches = Array.from(
        new Set([...matchedForbidden.map((w) => w.toLowerCase()), ...matchedDashes])
      );

      const nudge = `The previous output contained these forbidden patterns: ${uniqueMatches.join(', ')}. Rewrite affected lines without those words. Keep everything else identical.`;
      
      const secondPass = await generateText({
        model: modelName,
        system: `${nudge}\n\n${SYSTEM_PROMPT}`,
        prompt: `Format the following rough llms.txt to spec:\n\n---\n${finalContent}\n---`,
        temperature: 0.3,
        maxOutputTokens: 4000,
      });

      finalContent = secondPass.text;
    }

    const cleanedContent = cleanCodeFences(finalContent);

    if (!cleanedContent) {
      throw new ApiError(
        500,
        'generation_failed',
        'Failed to format llms.txt. The AI model returned empty content.'
      );
    }

    // Overwrite the Vercel Blob file
    await put(gen.llmsBlobPath, cleanedContent, {
      access: 'private',
      contentType: 'text/plain; charset=utf-8',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return Response.json({ content: cleanedContent });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
