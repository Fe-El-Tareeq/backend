# Backend Test Audit

This audit records the coverage surface used by the backend CI pipeline. It is intentionally conservative: a module is only marked covered when there are meaningful tests in this repository on the current branch.

## Current Automated Coverage

| Area | Test files | Coverage notes |
| --- | --- | --- |
| Core middleware and health | `tests/middleware.test.js` | Health, validation, 404, and rate limiting are covered. |
| Authentication and user management | `tests/auth.test.js`, `tests/users.test.js` | OTP, registration, login, refresh/logout, password recovery, profile updates, and profile image service paths are covered. |
| Wallet and ledger | `tests/wallet*.test.js` | Wallet API, internal debit/credit/refund behavior, idempotency, signup bonus, and a PostgreSQL concurrency integration test are covered. |
| Errands | `tests/errands.test.js` | Create/list/detail/update/cancel, wallet debit, idempotency, validation, and owner checks are covered. |
| Trips | `tests/trips*.test.js` | API auth, create/list/detail/update/cancel, repository behavior, idempotency, validation, and ownership checks are covered. |
| Delivery pricing | `tests/deliveryPricing*.test.js` | Pricing rules and quote API validation are covered. |
| Matching | `tests/matching.test.js` | Hard filters, ranking, ownership, limits, and API routes are covered. |
| Assignments | `tests/assignments*.test.js` | Accept flow, duplicate/concurrent handling, lifecycle transitions, cancellation, authorization, and API routing are covered. |
| Chat | `tests/chat.test.js` | Authorization, text and voice metadata, idempotency, list/sync, lifecycle blocking, read markers, and sensitive field leakage are covered. |
| Ratings and badges | `tests/ratings*.test.js` | Rating eligibility, idempotency, trust calculation, badges, ownership, and API validation are covered. |
| Payments | `tests/payments*.test.js` | Packages, invoices, idempotency, mock payment, signed webhook handling, duplicate provider transactions, ownership, and API validation are covered. |
| Notifications | none on current `dev` base | Prisma notification tables and a route scaffold exist, and payments mock `createTopUpNotification`, but there is no meaningful notifications API/service test coverage on this branch. Treat this as a release-blocking coverage gap for a notifications release until Phase 12 tests land. |

## CI Database Contract

Two integration suites require a real PostgreSQL database:

- `tests/wallet.concurrency.test.js`
- `tests/trips.repository.test.js`

They intentionally require `TEST_DATABASE_URL` and require that URL to include `wallet_test` before running. CI provisions PostgreSQL with a `wallet_test` database, sets `DATABASE_URL`, `DIRECT_URL`, and `TEST_DATABASE_URL` to that same isolated service database, applies Prisma migrations with `npx prisma migrate deploy`, verifies `_prisma_migrations` exists in `wallet_test`, and then runs the generic full-suite command `npm run test:ci`.

CI does not skip DB-backed tests. Future test files added under `tests/` are automatically discovered by Jest because the workflow does not pass a curated test-file list.

## Known Gaps

- Notifications cannot be declared fully covered from this branch alone because Phase 12 notifications tests live on a separate feature branch and are not merged into the current `dev` base. A notifications release must add or merge tests for listing, unread counts, read/mark-read behavior, notification creation side effects, authorization, pagination, and safe response shape. Once those tests exist under `tests/`, CI will run them automatically.
- There is no project ESLint configuration or ESLint dependency on this branch. The CI lint gate uses Node's JavaScript parser via `node --check` for `src`, `tests`, `scripts`, and `prisma` JavaScript files. Adding ESLint should be a separate cleanup or can be done when dependency installation/package-lock updates are available.
- Render deployment is wired through GitHub deploy-hook workflows when `RENDER_STAGING_DEPLOY_HOOK_URL` and `RENDER_PRODUCTION_DEPLOY_HOOK_URL` are configured. If the project already uses Render dashboard auto-deploys, keep the matching deploy-hook secret unset to avoid duplicate deploys. The actual Render service settings still must be verified in Render because this repository does not include `render.yaml` or a checked-in Render service manifest.
