# LeakLens — deployment

- **Live app:** https://leaklens-pi.vercel.app
- **Source:** https://github.com/Ranbir5ingh/leaklens

## Demo logins

All data is synthetic (no real customers, partners or money).

| Role | Email | Password | Can do |
|---|---|---|---|
| Finance executive | `exec@leaklens.demo` | `Exec@Demo2026` | Upload reports, approve column mappings, work the review queue, raise and recover claims, export evidence |
| Finance co-founder | `cofounder@leaklens.demo` | `Founder@Demo2026` | Everything above, plus edit rate cards, roll back mappings, reject claims and read the activity log |

The sign-in page also has one-click buttons that fill these in. Five wrong passwords in 15 minutes lock that email for 15 minutes.

**A quick tour (about 5 minutes):**
1. Sign in as the finance executive. The **Overview** shows money at risk by type, partner and age. TCS and TDS are kept separate from it.
2. Press **⌘K** (or Ctrl K) and type `88120`. This opens the brief's sample order ORD-M-88120: expected ₹899, received ₹862, short-paid by ₹37. `204118` and `204377` are the other two sample rows.
3. Go to **Imports → Upload a report** and choose the sample *Marketplace 1 settlement — new format*. Every column has been renamed. AI suggests a mapping with a confidence score for each field. Check the 20-row preview, tick the approval box, then import.
4. In the **Review queue**, link a suggested match. Then go to **Claims**, select a few, mark them raised, and download the PDF evidence pack.
5. Sign in as the co-founder. Edit a rate card under **Rate cards → Marketplace 1**, and matching re-runs. Each change shows up in the **Activity log**.

## Run it locally

**Requirements:** Node.js 20.9 or newer (tested on Node 24) and PostgreSQL 15 or newer. An empty database is enough.

```bash
git clone https://github.com/Ranbir5ingh/leaklens.git
cd leaklens
cp .env.example .env            # then fill in the values (names listed below)
npm install
npm run db:setup                # runs migrations, then seeds 12,000 synthetic orders (~3 s)
npm run dev                     # http://localhost:3000
```

Without Docker or a local Postgres, a free Neon database works too. Put its connection string in `DATABASE_URL`.

For a production build: `npm run build && npm start`.

To reset the demo data at any time, run `npm run db:seed`. It truncates the tables and seeds them again.

### Checks

```bash
npm run typecheck
npm run lint
npm test                        # 45 unit tests, including the 1-lakh-row performance test
npm run bench                   # 1,00,000 orders + 1,30,046 partner rows through parse → map → match → suggest
npm run bench:db                # the same run, plus writing the results to Postgres

npm run build && npm start &    # Playwright needs the app running
PW_CHROME=/usr/bin/google-chrome BASE_URL=http://localhost:3000 npm run e2e   # 13 flows, desktop and phone
```

Leave `PW_CHROME` unset to use Playwright's bundled Chromium (`npx playwright install chromium`).

## How it is deployed

- **Hosting:** Vercel (Hobby). It is a Next.js 16 app with serverless functions pinned to `sin1` (Singapore) in `vercel.json`, next to the database.
- **Database:** Neon serverless Postgres (free plan, `ap-southeast-1`), added through the Vercel Marketplace integration. That integration injects the connection variables.
- **Build:** Vercel runs `npm run vercel-build`, which is:
  1. `tsx scripts/migrate.ts`: applies the Drizzle SQL migrations. They are idempotent.
  2. `tsx scripts/seed.ts --if-stale`: seeds demo data only when the database is empty or the generator's `SEED_VERSION` has changed. A normal redeploy keeps whatever reviewers did on the live demo.
  3. `next build`.
- **Deploying:** `vercel deploy --prod` from the repository root, or connect the GitHub repo in Vercel so every push to `main` deploys.
- **Runtime:** sessions are stateless signed cookies. The app holds no state between requests beyond Postgres. Large uploads are parsed in the browser and sent in 5,000-row chunks, so every request stays well inside Vercel's body-size and time limits.

## Environment variables (names only)

| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (a pooled one is fine) |
| `DATABASE_URL_UNPOOLED` | recommended on Neon | Direct connection used by migrations and the seed |
| `SESSION_SECRET` | yes | 32+ random bytes that sign session cookies (`openssl rand -hex 32`) |
| `GEMINI_API_KEY` | optional | Google AI Studio key for AI column-mapping suggestions. Without it the rule-based mapper is used and the UI says so |
| `GEMINI_MODEL` | optional | Overrides the model (default `gemini-3.5-flash-lite`) |
| `SEED_ORDERS` | optional | Seed size (default 12000) |
| `SEED_EXEC_PASSWORD`, `SEED_COFOUNDER_PASSWORD` | optional | Override the demo passwords at seed time |
| `DEMO_MODE` | optional | Set to `off` to hide the demo-account buttons on the sign-in page |

The Neon integration also adds `POSTGRES_*` and `PG*` aliases, which the app does not read. `.env`, `.env.local` and `.vercel/` are git-ignored. No secret values are in the repository.
