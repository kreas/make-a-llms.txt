# AI Readiness — Three Pillars Reframe

**Date:** 2026-06-01
**Status:** Design approved, pending spec review
**Topic:** Reframe the site-detail experience around AEO / GEO / AIO as a guided, story-driven readiness journey.

---

## 1. Motivation

### Current state
The site-detail page (`src/app/(app)/sites/[id]/site-detail-client.tsx`) presents three flat tabs — **Pages**, **llms.txt**, **AI Crawlers** — defined as a simple `tabItems` array. The Pages tab carries a per-page Citation Audit (15 weighted checks producing a 0–100 score) plus sub-views: pages.md, JSON-LD, Unfurl Preview, Chatability, Export. It's a capable audit surface, but it's organized by *artifact* (pages, files, crawlers), not by *outcome*, and it offers no guidance on what to do first.

### The market gap
The reference competitor (Nuwtonic) is a kitchen-sink "command center" for SEO professionals: unified AIO/GEO dashboards, radar charts, priority queues, competitor SERP gap analysis, EEAT scoring, auto-fix previews. It is comprehensive and dense — built for people who already speak the language.

### Our wedge
The opposite posture. A **guided, story-driven, opinionated** experience that tells a less-technical user where they stand, why it matters, and the single next thing to fix. Quality of guidance over quantity of metrics.

### ICP
Web designers and less-technical builders trying to make their (or their clients') sites discoverable by AI. They want a win to hand a client, not a spreadsheet to decode.

---

## 2. The three pillars

From "Beyond Blue Links: AEO, GEO, AIO" — the search funnel has fragmented; ranking on page one is no longer the finish line. Three distinct optimization games now matter:

- **AEO (Answer Engine Optimization)** — get *cited inside* AI answers. Clean structure, direct answers, question-style headings, entities, schema.
- **GEO (Generative Engine Optimization)** — get *recommended* when a user asks for a choice. Defensible evidence the model can point to: pricing, comparison pages, case studies with metrics, structured formats.
- **AIO (AI Optimization)** — be *recognized* in model memory. On-site schema with `sameAs` to Wikidata/LinkedIn; off-site mentions on credible sites (weighted more heavily than backlinks).

### Narrative spine — a ladder, not a menu

We reframe the three pillars as a progression a non-technical builder can climb:

| Stage | Pillar | The question it answers |
|-------|--------|--------------------------|
| 1 · **Readable** | AEO | "Can AI read and quote your pages?" |
| 2 · **Recommendable** | GEO | "Will AI pick you when asked to choose?" |
| 3 · **Recognized** | AIO | "Does AI already know who you are?" |

**Readable → Recommendable → Recognized.** Plain-language stage names are the load-bearing story.

---

## 3. User story

> "I'm a web designer. I just relaunched a client's site. I keep hearing AI search matters now, but I have no idea if the site is 'ready,' and the SEO tools I've tried throw a wall of jargon at me. I want something that tells me — in plain language — where I stand, why it matters, and the next concrete thing to fix. I want to hand my client a win, not a spreadsheet."

**Success looks like:** a newcomer lands on the project, immediately understands their stage, and acts on one clear recommendation — without needing to understand AEO/GEO/AIO as acronyms. A power user can ignore the guidance and drill straight into any pillar.

---

## 4. Information architecture

### Top-level tabs

```
Overview · Readable · Recommendable · Recognized  |  ⚙ Setup
```

- **Overview** is the default landing tab and carries the guided story (one prioritized "Do this next").
- The **three pillar tabs** are fully navigable — power users roam freely (the "B + C blend": guided by default, open underneath).
- **Setup** is ordered last, after a visual divider, with calmer/muted styling. It is set-once plumbing, not a fourth thing to grind on.

### Experience model: B + C blend
- **C (story frame + "do this next"):** the Overview always surfaces ONE prioritized next action across all pillars. No rigid gating.
- **B (open sections):** every pillar tab is reachable at any time with its own score. We do not lock later stages behind earlier ones.

This serves both ends of the ICP: newcomers follow the single recommendation; power users navigate directly.

### Tab contents and feature mapping

| Tab | Contents | Status |
|-----|----------|--------|
| **Overview** | **Per-pillar health scores** + plain-language stage status, one prioritized **"Do this next"** with rationale, three pillar cards that drill in | **NEW** — the centerpiece |
| **Readable** (AEO) | Citation Audit (AEO-subset checks), pages.md, reading level, Smart Format | Reframe of existing Pages tab |
| **Recommendable** (GEO) | Pricing-page detection, comparison/competitor pages, case-study-with-metrics, tables/structured evidence | Mostly **NEW** (Phase 2); seeded by existing "lists/tables" check |
| **Recognized** (AIO) | JSON-LD / schema, Unfurl Preview, Chatability, `sameAs` (Wikidata/LinkedIn), "describe-us-without-browsing" test, off-site mentions | JSON-LD + Unfurl + Chatability exist; rest **NEW** (Phase 3) |
| **Setup** | llms.txt, AI Crawlers / robots.txt | Reframe of existing two tabs |

**Unfurl Preview** lives in Recognized because it is about how AI/Slack *represents* your site when it surfaces a link to you — a recognition/representation concern, not a content-quality one. **Chatability** lives in Recognized as the seed of the "can AI describe you" test.

---

## 5. Re-bucketing existing checks (Phase 1 insight)

The current Citation Audit's 15 checks are not all AEO. Re-categorizing them across the three pillars lets all three cards show a real (if partial) score from day one. Proposed mapping (to refine during implementation):

- **Readable (AEO):** Answer in first 100 words, Question-style H2s, Definition pattern in opening, Reading level grade 8–10, H1 present, Heading hierarchy clean, Recently updated, Internal links to related pages
- **Recommendable (GEO):** Lists or tables present *(seed — the only existing GEO-flavored signal)*
- **Recognized (AIO):** Schema.org type, Required schema fields, Named entities disambiguated, Entity in first paragraph, Meta description, Canonical tag

Each pillar's health score rolls up from the weighted checks assigned to it. This requires tagging each check with a `pillar` and recomputing per-pillar subtotals.

> **⚑ Follow-up flag:** the mapping above is a confident first cut, not validated. Revisit it once the pillars are live — especially the AEO/AIO straddlers (Entity in first paragraph, Named entities disambiguated, Meta description) — and adjust based on how the per-pillar scores read in practice.

---

## 6. The Overview screen (centerpiece)

Default landing for a project. Contents top-to-bottom:

1. **Stage status** — a plain sentence derived from the per-pillar health scores, in ladder order: *"Your site is Readable, becoming Recommendable. You've cleared the basics — next stop: give AI evidence to recommend you."* No single composite/headline number — the per-pillar scores are the truth (see below).
2. **"Do this next" card** — the single highest-impact unresolved item across all pillars, with a one-line *why* and a "Show me how" CTA. Prioritized by check weight × pillar-stage ordering × not-yet-passing.
3. **Three pillar cards (primary score display)** — each shows its own **health score**, a one-word health label, and a drill-in link to its tab. These are the headline metrics; there is deliberately no rolled-up aggregate.

### Prioritization logic
- Phase 1: "Do this next" draws from the weighted failing checks of the re-bucketed Citation Audit (Readable + Recognized, since Recommendable is "coming soon"), biased toward earlier stages and toward the most important page (e.g. `index`).
- Phases 2/3: the same prioritization spans the net-new GEO/AIO checks as they come online.

---

## 7. Phasing

### Phase 1 — Reframe (detailed; build first)
- Replace the `tabItems` shell: `Overview · Readable · Recommendable · Recognized · Setup` with the divider/muted treatment on Setup.
- Build the **Overview** tab (score, stage status, "Do this next", three pillar cards).
- Move existing Pages sub-views into their pillar homes: Citation Audit + pages.md + reading level + Smart Format → Readable; JSON-LD + Unfurl + Chatability → Recognized.
- Move llms.txt + AI Crawlers → Setup.
- **Tag each Citation Audit check with a pillar** and compute per-pillar health scores (Section 5). Readable and Recognized both have enough existing checks to show a meaningful score on day one.
- **Recommendable shows a "coming soon" placeholder** in Phase 1 — it has only one seed signal, not enough for a meaningful health score. Its score surfaces in Phase 2.
- All existing component tests updated; new tests for the Overview and the re-bucketing/scoring logic.

### Phase 2 — Recommendable / GEO (directional)
North star: detect and score *defensible evidence* AI can cite when recommending.
- Pricing-page detection (does a public pricing/starting-price page exist?).
- Comparison pages that name competitors directly.
- Case-study-with-metrics detection (specific numbers: time, cost, throughput).
- Structured-format scoring (comparison tables, spec sheets, feature lists).
- Competitor-gap framing kept lightweight and guided — NOT a Nuwtonic-style SERP dump.

### Phase 3 — Recognized / AIO (directional)
North star: build and verify brand presence in model memory.
- `sameAs` / entity-graph work (Wikidata, LinkedIn) on top of existing JSON-LD.
- **"Describe-us-without-browsing" test:** ask multiple LLMs to describe the brand with no web access; score accuracy/consistency. (Builds on Chatability.)
- Off-site / unlinked-mention tracking on credible sites.
- Unfurl-quality checks (how the brand's link presents when surfaced).

Each later phase inherits this document as its north star and earns its own detailed spec when reached.

---

## 8. Out of scope (YAGNI)

- Auto-fix / one-click CMS write-back (Nuwtonic-style execution layer) — not in this reframe.
- Radar charts, priority queues, and dense pro dashboards — contrary to the guided posture.
- Classic technical-SEO crawl/performance auditing beyond what already exists.

---

## 9. Decisions and open questions

### Resolved
- **No composite score.** Each pillar carries its own **health score**; the Overview shows the three, not a rolled-up aggregate. The stage status sentence is derived narrative, not a number.
- **Recommendable in Phase 1** = "coming soon" placeholder (only one seed signal today).
- **Check re-bucketing (Section 5)** is accepted as the working mapping, **flagged for follow-up validation** once the pillars are live (see §5 flag).

### Still open
1. **Stage thresholds** — what per-pillar health score counts as "cleared" for the plain-language stage sentence (e.g. ≥70 = Readable achieved)? Resolve during Phase 1 implementation.
2. **Health-score scale/labels** — confirm the 0–100 scale carries over from the current Citation Audit, and define the one-word labels (e.g. Strong / Partial / Weak) and their cutoffs.

---

## 10. Touchpoints (existing code)

- `src/app/(app)/sites/[id]/site-detail-client.tsx` — `tabItems` array, `activeTab` state, tab shell/animation.
- `src/components/generations/pages-content-panel.tsx` — current Pages sub-views.
- `src/components/generations/llms-content-panel.tsx` — llms.txt → Setup.
- `src/components/crawlers/crawler-audit-tab.tsx` — AI Crawlers → Setup.
- `src/components/citations/citations-tab.tsx` + Citation Audit checks — the source of the re-bucketed per-pillar scores.
