import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role', { enum: ['user', 'admin'] })
    .notNull()
    .default('user'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const otpCodes = sqliteTable('otp_codes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
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
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rootUrl: text('root_url').notNull(),
    sitemapUrl: text('sitemap_url'),
    webhookTokenHash: text('webhook_token_hash').notNull().unique(),
    webhookTokenPrefix: text('webhook_token_prefix').notNull(),
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
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
    updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    bySiteRecent: index('gen_by_site_recent').on(t.siteId, t.createdAt),
  }),
);

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type Generation = typeof generations.$inferSelect;
export type NewGeneration = typeof generations.$inferInsert;
