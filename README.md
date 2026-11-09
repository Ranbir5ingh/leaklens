# LeakLens — order, payment & return reconciliation

LeakLens shows a D2C home brand, order by order, whether each sales channel, courier and payment gateway paid the right amount. When one didn't, it shows how much is at risk, who owes it and how old it is, and gives you the evidence to claim it back.

Built for brief #4 (Company A: website + 3 marketplaces + 2 quick-commerce apps, 2 courier aggregators, 1 gateway, ~12,000 orders/month).

## What it does

- **Imports any partner report** (CSV/Excel). Each partner + report type keeps a **saved, versioned column mapping**. When a format changes, AI (Gemini, with a rule-based fallback) suggests a new mapping with a confidence per field. You preview 20 normalised rows, approve, and only then is the mapping saved as a new version (rollback is co-founder only).
- **Matches every order** against settlements, COD remittances, freight invoices and warehouse return scans. Each order gets one of five statuses: *settled, short-paid, unpaid past due, freight overcharged, return not received* (plus *awaiting payment* while not yet due).
- **Rate cards** per channel and courier (commission, fixed-fee bands, weight slabs per zone, COD and RTO rules). Any gap over **₹10** is flagged.
- **Claims list per partner** with CSV and PDF evidence packs and a status workflow: open → raised → recovered / rejected.
- **Money-at-risk overview** by partner and age.
- **Review queue**: partner rows with a missing or unknown order ID get scored match suggestions with reasons. They are never linked automatically.
- **TCS/TDS** are shown separately as tax credits, never as leakage.
- **Customer PII is masked** in the browser before upload and again on the server (DPDP Act 2023). Addresses are never stored.
- **Two roles with real RBAC**: finance executive and finance co-founder, enforced on the server.

## Quick start (local)

Requires Node ≥ 20.9 and PostgreSQL 15+.

```bash
cp .env.example .env.local     # set DATABASE_URL and SESSION_SECRET (GEMINI_API_KEY optional)
npm install
npm run db:setup               # migrate + seed 12,000 synthetic orders (~3 s)
npm run dev                    # http://localhost:3000
```

Demo logins (synthetic data only):

| Role | Email | Password |
|---|---|---|
| Finance executive | `exec@leaklens.demo` | `Exec@Demo2026` |
| Finance co-founder | `cofounder@leaklens.demo` | `Founder@Demo2026` |

## Checks

```bash
npm run typecheck && npm run lint && npm test   # unit + 1-lakh performance test
npm run bench                                    # 1,00,000-order pipeline benchmark
npm run build && npm start &                     # then:
BASE_URL=http://localhost:3000 npm run e2e       # Playwright flows, desktop + phone
```

## Stack

Next.js 16 (App Router, server actions, `proxy.ts`), TypeScript, Tailwind CSS 4, PostgreSQL via `postgres` + Drizzle schema/migrations, zod, jose (signed session cookies), bcrypt, pdf-lib, Papa Parse / SheetJS (in-browser parsing), Vitest, Playwright.

See `deployment.md` and the TDD in the submission for architecture, the matching algorithm, assumptions and limitations.
