# AI Starter Pack

A batteries-included Next.js starter template for building AI-powered applications. Comes pre-configured with authentication, database, file storage, AI integration, and a full component library.

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript, Turbopack)
- **Styling:** Tailwind CSS v4 + ShadCN UI + AI Elements
- **Database:** Drizzle ORM + Turso (libsql/SQLite)
- **Storage:** Cloudflare R2
- **Auth:** Email OTP (Resend) with JWT cookie sessions
- **AI:** Vercel AI SDK + Anthropic
- **Data Fetching:** TanStack Query
- **Testing:** Vitest + React Testing Library
- **Formatting:** Prettier + EditorConfig

## Prerequisites

- [Node.js](https://nodejs.org/) 22.11+
- [pnpm](https://pnpm.io/) package manager
- A [Turso](https://turso.tech/) database
- A [Cloudflare](https://dash.cloudflare.com/) account with an R2 bucket
- A [Resend](https://resend.com/) API key for production email delivery (optional in dev — OTPs print to the console)
- An [Anthropic](https://console.anthropic.com/) API key

## Setup

If you're using [Claude Code](https://claude.com/claude-code), run `/setup-project` for a guided walkthrough. Otherwise, follow the steps below.

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Copy the example env file:

```bash
cp .env.example .env.local
```

Fill in your credentials in `.env.local`:

#### Turso

Create a database at [turso.tech](https://turso.tech), then set:

```
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
```

#### Cloudflare R2

Create an R2 bucket and API token in the [Cloudflare dashboard](https://dash.cloudflare.com), then set:

```
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=your-bucket
```

#### Auth

Generate a session secret (used to sign JWT cookies):

```
SESSION_SECRET=<generate with: openssl rand -base64 32>
```

#### Resend (optional in dev)

In development, OTPs are printed to the dev server console — leave the Resend variables blank. For production, create an API key at [resend.com](https://resend.com) and verify a sending domain, then set:

```
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Auth <noreply@yourdomain.com>
```

#### Anthropic

Get an API key from the [Anthropic Console](https://console.anthropic.com/), then set:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run database migrations

```bash
pnpm db:migrate
```

### 4. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the landing page with Sign In / Sign Up buttons.

## Scripts

| Command              | Description                      |
| -------------------- | -------------------------------- |
| `pnpm dev`           | Start dev server (Turbopack)     |
| `pnpm build`         | Production build                 |
| `pnpm start`         | Start production server          |
| `pnpm lint`          | Run ESLint                       |
| `pnpm format`        | Format code with Prettier        |
| `pnpm format:check`  | Check formatting                 |
| `pnpm test`          | Run tests                        |
| `pnpm test:watch`    | Run tests in watch mode          |
| `pnpm db:generate`   | Generate Drizzle migrations      |
| `pnpm db:migrate`    | Run Drizzle migrations           |
| `pnpm db:push`       | Push schema directly to database |
| `pnpm db:studio`     | Open Drizzle Studio              |

## Project Structure

```
src/
├── app/                  # Next.js App Router pages and layouts
│   ├── api/
│   │   ├── auth/         # OTP sign-up, sign-in, verify, sign-out routes
│   │   └── chat/         # AI chat API route (streaming)
│   ├── signin/           # Sign-in page (email → OTP)
│   ├── signup/           # Sign-up page (name + email → OTP)
│   ├── globals.css       # Tailwind + ShadCN theme
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Home page
├── components/
│   ├── auth/             # OtpForm, SignOutButton
│   ├── ui/               # ShadCN primitives
│   └── providers.tsx     # Client providers (TanStack Query)
├── db/
│   ├── index.ts          # Drizzle database client
│   └── schema.ts         # Database schema (users, otp_codes)
├── lib/
│   ├── auth.ts           # Sessions (JWT cookies) + getCurrentUser
│   ├── email.ts          # Resend wrapper (logs OTP in dev)
│   ├── otp.ts            # OTP generation/hash/verify
│   ├── r2.ts             # Cloudflare R2 helpers
│   └── utils.ts          # ShadCN utility (cn)
└── test/
    ├── setup.ts          # Vitest setup (jest-dom + jsdom polyfills)
    └── utils.tsx         # Test helpers (QueryClient wrapper)
```

## Adding Components

**ShadCN UI:**

```bash
pnpm dlx shadcn@latest add button
```

**AI Elements** (for AI-specific UI like chat, messages, code blocks):

```bash
pnpm dlx shadcn@latest add https://elements.ai-sdk.dev/api/registry/conversation.json
```

## Creating a Workspace

Use the `create-workspace` script to spin up an isolated [git worktree](https://git-scm.com/docs/git-worktree) for a new feature. It creates a worktree at `.worktrees/<name>` on branch `feature/<name>`, copies `.env.local`, installs dependencies, runs migrations, and launches Claude Code.

```bash
# Create worktree and launch Claude Code
scripts/create-workspace.sh my-feature

# Create worktree without launching Claude
scripts/create-workspace.sh my-feature --no-claude
```

## Claude Code Skills

This project includes Claude Code skills for common workflows:

| Skill | Description |
| ----- | ----------- |
| `/setup-project` | Guided environment setup |
| `/code-review` | Review code for DRY violations, prop drilling, hooks/context issues, and test coverage |
| `/preflight` | Run build, tests, and lint to confirm code is clean |
| `/pr-ready` | Final cleanup scan: debug statements, dead code, component structure, quality checks |
| `/commit` | Atomic commit workflow |
| `/pr` | Create a GitHub pull request |

### Recommended Workflow

1. `/code-review` — find structural and quality issues
2. Fix the issues found
3. `/preflight` — make sure build, tests, and lint pass
4. `/pr-ready` — final cleanliness scan before committing
5. `/commit` — create atomic commits
6. `/pr` — open a pull request
