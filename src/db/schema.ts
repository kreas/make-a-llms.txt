import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { generateUid } from '@/lib/uid';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uid: text('uid').notNull().unique().$defaultFn(generateUid),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role', { enum: ['user', 'admin'] })
    .notNull()
    .default('user'),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripePriceId: text('stripe_price_id'),
  subscriptionStatus: text('subscription_status'),
  stripeCurrentPeriodEnd: integer('stripe_current_period_end', { mode: 'timestamp' }),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const otpCodes = sqliteTable('otp_codes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uid: text('uid').notNull().unique().$defaultFn(generateUid),
  email: text('email').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  consumedAt: integer('consumed_at', { mode: 'timestamp' }),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const sites = sqliteTable(
  'sites',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().unique().$defaultFn(generateUid),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rootUrl: text('root_url').notNull(),
    sitemapUrl: text('sitemap_url'),
    webhookTokenHash: text('webhook_token_hash').notNull().unique(),
    webhookTokenPrefix: text('webhook_token_prefix').notNull(),
    displayName: text('display_name'),
    description: text('description'),
    faviconUrl: text('favicon_url'),
    metadataFetchedAt: text('metadata_fetched_at'),
    lastGeneratedAt: text('last_generated_at'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
    updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    uniqueUserRoot: unique('sites_user_root_unique').on(t.userId, t.rootUrl),
  }),
);

export const generations = sqliteTable(
  'generations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().unique().$defaultFn(generateUid),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status', {
      enum: ['pending', 'running', 'succeeded', 'failed', 'cancelled'],
    })
      .notNull()
      .default('pending'),
    trigger: text('trigger', { enum: ['manual', 'webhook'] }).notNull(),
    notifyEmail: integer('notify_email', { mode: 'boolean' }).notNull().default(false),
    notifiedAt: text('notified_at'),
    workflowRunId: text('workflow_run_id'),
    resolvedSitemapUrl: text('resolved_sitemap_url'),
    llmsBlobPath: text('llms_blob_path'),
    llmsFullBlobPath: text('llms_full_blob_path'),
    errorMessage: text('error_message'),
    pagesManifestBlobPath: text('pages_manifest_blob_path'),
    pagesCount: integer('pages_count').notNull().default(0),
    pagesStatus: text('pages_status', {
      enum: ['pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'],
    })
      .notNull()
      .default('pending'),
    pagesErrorMessage: text('pages_error_message'),
    summariesStatus: text('summaries_status', {
      enum: ['pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'],
    })
      .notNull()
      .default('pending'),
    summariesCount: integer('summaries_count').notNull().default(0),
    summariesEmptyCount: integer('summaries_empty_count').notNull().default(0),
    summariesFailedCount: integer('summaries_failed_count').notNull().default(0),
    summariesManifestBlobPath: text('summaries_manifest_blob_path'),
    summariesErrorMessage: text('summaries_error_message'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
    updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    bySiteRecent: index('gen_by_site_recent').on(t.siteId, t.createdAt),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type Generation = typeof generations.$inferSelect;
export type NewGeneration = typeof generations.$inferInsert;

export const crawlerAudits = sqliteTable(
  'crawler_audits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().unique().$defaultFn(generateUid),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['succeeded', 'failed'] }).notNull(),
    robotsUrl: text('robots_url').notNull(),
    robotsContent: text('robots_content'),
    results: text('results').notNull(),
    errorMessage: text('error_message'),
    fetchedAt: text('fetched_at').notNull().default(sql`(current_timestamp)`),
    trigger: text('trigger', { enum: ['generation', 'manual'] }).notNull(),
    generationId: integer('generation_id').references(() => generations.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    bySiteRecent: index('crawler_audits_by_site_recent').on(t.siteId, t.fetchedAt),
  }),
);

export type CrawlerAudit = typeof crawlerAudits.$inferSelect;
export type NewCrawlerAudit = typeof crawlerAudits.$inferInsert;

export const citationAudits = sqliteTable(
  'citation_audits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().unique().$defaultFn(generateUid),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    pageUrl: text('page_url').notNull(),
    status: text('status', { enum: ['succeeded', 'failed'] }).notNull(),
    score: integer('score'),
    tier: text('tier', { enum: ['poor', 'fair', 'good', 'excellent'] }),
    results: text('results'),
    errorReason: text('error_reason'),
    errorMessage: text('error_message'),
    fetchMs: integer('fetch_ms'),
    browserMsUsed: integer('browser_ms_used'),
    fetchedAt: text('fetched_at').notNull().default(sql`(current_timestamp)`),
    trigger: text('trigger', { enum: ['manual'] }).notNull(),
  },
  (t) => ({
    byPageRecent: index('cit_audit_by_page_recent').on(t.siteId, t.pageUrl, t.fetchedAt),
    bySiteRecent: index('cit_audit_by_site_recent').on(t.siteId, t.fetchedAt),
  }),
);

export type CitationAudit = typeof citationAudits.$inferSelect;
export type NewCitationAudit = typeof citationAudits.$inferInsert;

export const siteGeoAudits = sqliteTable(
  'site_geo_audits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().unique().$defaultFn(generateUid),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    generationId: integer('generation_id').references(() => generations.id, {
      onDelete: 'set null',
    }),
    status: text('status', { enum: ['succeeded', 'failed'] }).notNull(),
    score: integer('score'),
    tier: text('tier', { enum: ['poor', 'fair', 'good', 'excellent'] }),
    results: text('results'),
    errorReason: text('error_reason'),
    errorMessage: text('error_message'),
    llmMsUsed: integer('llm_ms_used'),
    fetchedAt: text('fetched_at').notNull().default(sql`(current_timestamp)`),
    trigger: text('trigger', { enum: ['manual'] }).notNull(),
  },
  (t) => ({
    bySiteRecent: index('geo_audit_by_site_recent').on(t.siteId, t.fetchedAt),
  }),
);

export type SiteGeoAudit = typeof siteGeoAudits.$inferSelect;
export type NewSiteGeoAudit = typeof siteGeoAudits.$inferInsert;

export const robotsGeneratorDrafts = sqliteTable(
  'robots_generator_drafts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().unique().$defaultFn(generateUid),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    toggles: text('toggles').notNull(),
    allowAll: integer('allow_all', { mode: 'boolean' }).notNull().default(false),
    updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    uniqueSite: unique('robots_generator_drafts_site_unique').on(t.siteId),
  }),
);

export type RobotsGeneratorDraft = typeof robotsGeneratorDrafts.$inferSelect;
export type NewRobotsGeneratorDraft = typeof robotsGeneratorDrafts.$inferInsert;

export const apiTokens = sqliteTable(
  'api_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().unique().$defaultFn(generateUid),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    tokenPrefix: text('token_prefix').notNull(),
    lastUsedAt: text('last_used_at'),
    expiresAt: text('expires_at'),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    byUser: index('api_tokens_by_user').on(t.userId),
  }),
);

export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;

export const pageSummaryCache = sqliteTable(
  'page_summary_cache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    urlPath: text('url_path').notNull(),
    url: text('url').notNull(),
    contentHash: text('content_hash').notNull(),
    summary: text('summary').notNull(),
    pageType: text('page_type').notNull(),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
    updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    uniqueSitePath: unique('page_summary_cache_site_path_unique').on(
      t.siteId,
      t.urlPath,
    ),
  }),
);

export type PageSummaryCache = typeof pageSummaryCache.$inferSelect;
export type NewPageSummaryCache = typeof pageSummaryCache.$inferInsert;

export const pageQuestionsCache = sqliteTable(
  'page_questions_cache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    urlPath: text('url_path').notNull(),
    url: text('url').notNull(),
    contentHash: text('content_hash').notNull(),
    questions: text('questions').notNull(), // JSON string representing array of strings
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
    updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    uniqueSitePath: unique('page_questions_cache_site_path_unique').on(
      t.siteId,
      t.urlPath,
    ),
  }),
);

export type PageQuestionsCache = typeof pageQuestionsCache.$inferSelect;
export type NewPageQuestionsCache = typeof pageQuestionsCache.$inferInsert;

export const pageQuestionAnswersCache = sqliteTable(
  'page_question_answers_cache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    urlPath: text('url_path').notNull(),
    question: text('question').notNull(),
    model: text('model').notNull(),
    contentHash: text('content_hash').notNull(),
    answer: text('answer').notNull(),
    citations: text('citations'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
    updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    uniqueSitePathQuestionModel: unique('page_question_answers_cache_site_path_q_model_unique').on(
      t.siteId,
      t.urlPath,
      t.question,
      t.model,
    ),
  }),
);

export type PageQuestionAnswersCache = typeof pageQuestionAnswersCache.$inferSelect;
export type NewPageQuestionAnswersCache = typeof pageQuestionAnswersCache.$inferInsert;
