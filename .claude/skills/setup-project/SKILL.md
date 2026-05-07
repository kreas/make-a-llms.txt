---
name: setup-project
description: Set up the ai-starter project for local development. Guides the user through installing dependencies, configuring environment variables, and running the dev server.
disable-model-invocation: true
argument-hint: ''
allowed-tools: Read, Bash(pnpm *), Bash(openssl *), Bash(cp *)
---

# Set Up ai-starter for Local Development

Walk the user through each step below. **Ask for their credentials at each step** — do not skip ahead or assume values.

## Step 1: Install dependencies

```bash
pnpm install
```

## Step 2: Create `.env.local` from template

Check if `.env.local` already exists. If not, copy from the example:

```bash
cp .env.example .env.local
```

Then walk the user through filling in each section, one at a time.

### 2a: Turso Database

Ask the user for their Turso database URL and auth token. They can create a database at https://turso.tech.

Set these values in `.env.local`:

- `TURSO_DATABASE_URL` — e.g. `libsql://my-db-username.turso.io`
- `TURSO_AUTH_TOKEN` — their database auth token

### 2b: Cloudflare R2

Ask the user for their R2 credentials. They can set up R2 at https://dash.cloudflare.com (R2 Object Storage).

Set these values in `.env.local`:

- `R2_ACCOUNT_ID` — their Cloudflare account ID
- `R2_ACCESS_KEY_ID` — R2 API token access key
- `R2_SECRET_ACCESS_KEY` — R2 API token secret key
- `R2_BUCKET_NAME` — the name of their R2 bucket

### 2c: Auth session secret

Generate a strong session secret used to sign JWT cookies:

```bash
openssl rand -base64 32
```

Set this value in `.env.local`:

- `SESSION_SECRET` — must be at least 32 characters

### 2d: Resend (optional in dev)

In development, OTP codes are printed to the dev server console — the user can leave `RESEND_API_KEY` and `RESEND_FROM_EMAIL` blank and skip this step. For production email delivery, ask the user for their Resend credentials. They can create a project at https://resend.com.

Set these values in `.env.local`:

- `RESEND_API_KEY` — starts with `re_`
- `RESEND_FROM_EMAIL` — must be a verified sender, e.g. `Auth <noreply@example.com>`

### 2e: Anthropic

Ask the user for their Anthropic API key. They can get one at https://console.anthropic.com/.

Set this value in `.env.local`:

- `ANTHROPIC_API_KEY` — starts with `sk-ant-`

## Step 3: Run database migrations

```bash
pnpm db:migrate
```

This applies the Drizzle migrations (creates the `users` and `otp_codes` tables) on the Turso database.

## Step 4: Start the dev server

```bash
pnpm dev
```

Confirm the app starts at http://localhost:3000 without errors.

## Step 5: Verify

Tell the user to open http://localhost:3000 in their browser. They should see:

- The "AI Starter" heading
- "Sign In" and "Sign Up" buttons (if not authenticated)
- No console errors

If there are errors, help the user debug them.
