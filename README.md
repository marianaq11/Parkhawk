[README.md](https://github.com/user-attachments/files/33177698/README.md)
# ParkHawk

ParkHawk is a crowdsourced parking application for Montclair State University students and staff. It helps answer a practical question: which parking area is worth trying right now?

The app combines recent open-space reports, upcoming departures, active search demand, and traffic reports. Its opportunity score is a transparent heuristic, not a vacancy count or a probability. All seeded conditions are simulated.

## What works

- Account login and server-protected student and admin routes.
- Six seeded parking areas, ranked by current opportunity.
- Open-space, leaving-soon, searching, and traffic reports.
- Three-minute open-space expiration, independent confirmations, and closing a report when a spot is taken.
- Continuously decaying confidence and a small reporter reliability system.
- Aggregate search counts; other users cannot see who is searching.
- Admin location creation/editing, activation, report removal, reporting suspension/restoration, and system counts.
- Responsive dashboard, lot details, accessible report dialog, relative timestamps, empty/error/loading states, and ten-second polling.

## Screenshots

Actual screenshots captured while exercising the app with seeded data:

![Desktop dashboard](docs/screenshots/dashboard.png)

[Lot details](docs/screenshots/lot-detail.png) · [Mobile dashboard](docs/screenshots/mobile.png) · [Admin reports](docs/screenshots/admin.png)

## Stack

Next.js App Router, TypeScript, React, Tailwind CSS, Lucide icons, and Zod. Supabase provides hosted PostgreSQL and authentication. A built-in Node SQLite adapter provides a fully persistent local demo without external credentials. Both use the same validation, scoring, UI, and authorization rules.

Tests use Node's test runner, Playwright, and PGlite (a local PostgreSQL engine for testing the actual SQL migration). There are no machine-learning, mapping, sensor, or university-system integrations.

## Local setup

Install **Node.js 24 or newer**, then run these commands from the project folder:

```bash
npm ci
npm run db:seed
npm run dev
```

Open **http://localhost:3000**. The first seed creates the SQLite schema, accounts, and fresh reports. No environment variables are required for this path. The SQLite file persists in `.data/parkhawk.sqlite` and is excluded from source control.

For optional configuration, copy `.env.example` to `.env.local` (on Windows, copying the file in Explorer works). The seed script loads the same environment files as Next.js.

Seed data is not continuously regenerated. Reports expire normally, including seeded reports. To restart a classroom demonstration with fresh conditions, stop the server, delete **only** `.data/parkhawk.sqlite` and any matching `-wal`/`-shm` files, then run `npm run db:seed` again. This resets local demo data. Re-running seed without deleting the database leaves existing records intact.

## Demo accounts

| Role | Email | Development-only password |
| --- | --- | --- |
| User | `student1@parkhawk.demo` | `ParkHawkDemo2026!` |
| User | `student2@parkhawk.demo` | `ParkHawkDemo2026!` |
| User | `student3@parkhawk.demo` | `ParkHawkDemo2026!` |
| Admin | `admin@parkhawk.demo` | `ParkHawkDemo2026!` |

The seed also creates student4 through student60 to give the simulated demand distinct reporters. These are fictional accounts, not real students. The admin account represents a demo administrator, not actual Parking Services. Local passwords are individually salted and hashed with scrypt. Local sessions use random, hashed server-side tokens and expire after eight hours.

Only use these public passwords in a disposable demonstration. For a real deployment, provision private accounts and do not seed public admin credentials.

## Environment variables

All application credentials stay on the server. None use a `NEXT_PUBLIC_` prefix.

| Variable | Local default | Use |
| --- | --- | --- |
| `DATA_BACKEND` | `sqlite` | Set to `supabase` for hosted PostgreSQL/Auth. |
| `SQLITE_PATH` | `.data/parkhawk.sqlite` | Persistent local database path. |
| `SUPABASE_URL` | empty | Supabase project URL. |
| `SUPABASE_ANON_KEY` | empty | Supabase anon key for password login and verified user lookup. |
| `SUPABASE_SERVICE_ROLE_KEY` | empty | Server-only database access and demo-account provisioning. |
| `ALLOW_DEMO_SEED` | `false` | Explicitly enables demo seeding into an empty Supabase project. |

## Supabase setup

1. Create a fresh Supabase project.
2. Run `supabase/migrations/001_parkhawk.sql` once in the SQL editor. This creates the tables, constraints, indexes, default-deny RLS configuration, auth profile trigger, and transactional report/admin functions.
3. Set `DATA_BACKEND=supabase` and the three Supabase variables in `.env.local`.
4. For a disposable demo, set `ALLOW_DEMO_SEED=true`, then run `npm run db:seed`. The script uses the Auth Admin API to create verified demo accounts and populate parking records. It refuses to overwrite a nonempty project. If interrupted, use a fresh disposable project rather than rerunning over partially created accounts.
5. Set `ALLOW_DEMO_SEED=false` afterward and restart the app.

For private accounts instead, create users in Supabase Authentication. The trigger creates `USER` profiles with reliability 80; metadata cannot assign an admin role. Promote your intended administrator from the SQL editor:

```sql
update public.profiles set role = 'ADMIN' where email = 'your-admin@example.com';
```

That administrator can add parking locations through `/admin`. There is no public signup, password-reset UI, or NetID/SSO integration in this MVP. Hosted sessions last for the Supabase access-token lifetime; users sign in again after expiry. Refresh tokens are deliberately not stored.

## Architecture and main files

| File or directory | Responsibility |
| --- | --- |
| `app/` | Protected dashboard, login, lot details, admin, and JSON route handlers. |
| `components/` | Dashboard, report dialog, login form, shared navigation, and admin UI. |
| `lib/parking.ts` | Expiration, confidence, opportunity scoring, traffic aggregation, ranking. |
| `lib/validation.ts` | Zod input schemas; type-specific fields and plain-text limits. |
| `lib/auth.ts`, `lib/authorization.ts` | Server session lookup, protected routes, role/suspension guards. |
| `lib/data.ts` | Small SQLite/Supabase data adapter. |
| `lib/sqlite.ts` | Local relational schema, sessions, password verification, transactional mutations. |
| `lib/view.ts` | Redacts private report identities before sending dashboard data to a browser. |
| `lib/seed-data.ts`, `scripts/seed.ts` | Demo conditions and account/database provisioning. |
| `supabase/migrations/001_parkhawk.sql` | Hosted schema, RLS/grants, and atomic mutation functions. |
| `tests/` | Scoring, database, PostgreSQL migration, security, and browser checks. |

Requests flow from React through Next.js route handlers. Handlers validate the session and input, then call the data adapter. Calculations run on the server. The browser receives lot summaries and anonymous non-search report details. Admin endpoints have separate server-side role checks.

## Database model

- **profiles**: auth-linked identity, display name, role, reliability (0–100), optional suspension deadline.
- **parking_locations**: editable name, description, type, active flag.
- **reports**: reporter and location foreign keys, type-specific details, status, creation and expiry timestamps.
- **report_feedback**: report and responder foreign keys, response type, timestamp; unique `(report_id, user_id)`.

SQLite additionally has private credentials, hashed sessions, and login-attempt tables. Supabase uses Auth instead. Both schemas constrain report values and index active-report lookups, creation time, and user/report type.

No browser role can access raw Supabase tables or call mutation RPCs. The server uses a service key after independently authenticating the request. This default-deny design protects search identities and profile data; the service key must never appear in a client bundle. See [Supabase's RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

Mutations are transactional. A user's previous active report of the same type is closed when replaced. This means a search renewal or a switch to another lot contributes one searcher, not two. A 15-second update cooldown limits rapid repeat submissions. Browser role fields and expiration timestamps are never trusted.

## Expiration

An active report must have status `ACTIVE`, a creation time no later than now, and `expires_at > now`. Expiration is checked when reading/scoring/responding; no background worker is needed. A historically expired record may still have database status `ACTIVE`, but it is never considered current.

| Report | Lifetime |
| --- | --- |
| Open spot | 3 minutes |
| Leaving now | 5 minutes |
| Leaving in 10 minutes | 15 minutes |
| Leaving in 30 minutes | 35 minutes |
| Searching | 15 minutes |
| Traffic | 10 minutes |

The dashboard polls every ten seconds. A displayed value can therefore lag expiration by at most one successful polling interval. A failed refresh shows an error rather than implying data is current. Server mutations always check actual expiry.

## Confidence and reliability

For an active report, define freshness `F` as remaining lifetime divided by original lifetime, clamped to `[0,1]`.

```text
confidence = round(clamp((20 + 0.6 × reliability + 8 × min(confirmations, 3)) × F, 0, 100))
```

A fresh report from an 80-reliability user starts at 68. High confidence is at least 65, Medium is at least 35, otherwise Low. A taken response gives zero confidence and closes the report immediately. Closed/expired reports have zero influence. Confirmations do not extend a report's lifetime.

Each account can respond once to an open report, cannot respond to its own report, and cannot submit feedback while suspended. A positive response increases reporter reliability by 1. A spot becoming taken is often normal turnover: the first early taken report does not reduce reliability. Starting with the second report marked taken within 45 seconds during the past 24 hours, the reporter loses 3 points. Admin removal for abuse/inaccuracy reduces reliability by 5, once. All changes are bounded to 0–100.

These rules are intentionally small. Multiple accounts could collude, so the reputation system should not be treated as fraud detection.

## Opportunity score

For each enabled lot, use only currently active reports:

```text
score = round(clamp(45 + open_bonus + departure_bonus - demand_penalty - traffic_penalty, 0, 100))
```

- `open_bonus`: sum of `12 × quantity × confidence/100`, capped at 30. “3+” is conservatively counted as 3.
- `departure_bonus`: sum of `weight × freshness × reliability/100`, capped at 30. Weight is 7 when departure is due, 4 within ten minutes, and 1.5 beyond ten minutes. Remaining time is recalculated as the clock advances.
- `demand_penalty`: sum of `2.5 × freshness` per active searcher, capped at 40. All searches count toward demand; reliability does not make a person disappear.
- `traffic_penalty`: ten times the freshness-and-reliability-weighted mean of Light=0, Moderate=1, Heavy=2. Several reports are combined, rather than trusting the newest one alone.

Scores at least 65 display High estimated availability; 40–64 display Moderate; lower scores display Low. A lot with no active evidence displays Unknown and is not recommended. Enabled lots sort by score, then name for deterministic ties. Demand labels use raw active counts: Low below 4, Moderate 4–7, High 8–14, Very high 15+.

The 45 baseline and weights are project assumptions, not calibrated measurements. The strongest available signal may still describe a busy lot. Scores do not account for permit eligibility, walking distance, overlapping observations of the same physical space, or actual capacity.

## Tests and build

```bash
npm test
npm run lint
npm run build
npm start
```

Browser checks require Playwright's Chromium:

```bash
npx playwright install chromium
npm run test:e2e
```

The browser suite starts its own server on port 3100 and uses an isolated, freshly seeded SQLite database. It checks login/logout, both protected roles, all report types, independent feedback, duplicate denial, private search redaction, admin editing/removal/suspension, cross-origin rejection, and a 390px mobile layout. It also saves screenshots under `docs/screenshots/`. `CHROMIUM_PATH` can point to an existing Chromium binary where standard browser downloads are unavailable.

Unit/integration tests cover expiry boundaries, continuous confidence, reliability, departures, demand, aggregated traffic, no-evidence states, SQL constraints, transactions, and administrator checks. PGlite runs the real PostgreSQL migration with a minimal mock of Supabase's `auth.users` boundary. It does not emulate Supabase Auth or the hosted network service.

## Deployment

For a hosted deployment, use **Supabase**, not the local SQLite adapter. Local SQLite needs a persistent filesystem and a single Node deployment; serverless filesystems do not provide that persistence.

1. Complete Supabase setup above and test those accounts locally.
2. Push this source to your GitHub repository; do not commit `.env.local`, `.data`, `node_modules`, or `.next`.
3. Import the repository into Vercel as a Next.js project. If the repository contains a parent folder, choose the folder containing `package.json` as its root directory.
4. Select a Node.js 24 runtime. Add `DATA_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the server environment. Leave demo seeding disabled.
5. Use the default Next.js build (`npm run build`) and deploy. Sign in and check `/`, a lot page, and `/admin` with the appropriate accounts.

[Vercel's Next.js deployment guide](https://vercel.com/docs/frameworks/full-stack/nextjs) covers repository imports and CLI deployment. This project has no static-export mode because authentication and authorization run on the server.

## Limitations and verification boundary

This is a semester-sized MVP with simulated reports, manually provisioned accounts, and an explainable heuristic. It does not guarantee parking availability or enforce actual campus parking permits. Snapshot calculations read the database in pages and compute in memory; this is suitable for a small demo, not a high-volume production deployment. Admin report history is limited to the 100 most recent rows in the interface.

Local application and database behavior can be tested without credentials. The hosted Supabase Auth connection, hosted seed, and deployment still require your Supabase project credentials. Never interpret a passing local PostgreSQL test as verification of your remote configuration.

No plates, GPS coordinates, addresses, payments, or device tracking are collected. Free-text notes should describe parking conditions only. Admins can see the reporter on moderation records; ordinary users cannot see who is searching or another person's reliability score.

## Possible future work

Montclair SSO, official Parking Services integration, historical demand forecasting, anonymous aggregate analytics, real-time shuttle information, campus navigation, push notifications, native mobile apps, and authorized parking sensors/cameras could be separate extensions. They are not implemented here.

## Disclaimer

ParkHawk is an independent student project and is not an official Montclair State University parking service. It does not use the official university logo. Location names identify demo parking areas; the app is not a source of current parking rules or live university data.
