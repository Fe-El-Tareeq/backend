# Backend

## Bidirectional Offers and Trip Requests

- `POST /api/v1/proposals` creates either a traveler offer (`TRAVELER_OFFER`) or a requester trip request (`REQUESTER_REQUEST`). Creating a proposal does not charge tokens or reserve capacity.
- `GET /api/v1/errands/:id/proposals` is the errand owner's incoming-offers page; `GET /api/v1/trips/:id/proposals` is the trip owner's incoming-requests page.
- Both inboxes support `PENDING`, `ACCEPTED`, and `REJECTED` filters, pagination, and server-calculated totals for the All, New, Accepted, and Rejected tabs.
- `POST /api/v1/proposals/:id/accept` can only be called by the receiver. Acceptance atomically creates the assignment, charges the traveler, reserves trip capacity, marks the errand matched, creates chat, and rejects other pending proposals for that errand.
- `POST /api/v1/proposals/:id/reject` records a manual rejection. Automatic rejection after another offer wins uses `ANOTHER_PROPOSAL_ACCEPTED` and affects only that errand; the traveler remains eligible for other matches.
- Trips and errands remain editable while proposals are pending. An accepted assignment locks further edits; the errand is already protected by its `MATCHED` status, and the trip now checks accepted assignment history.
- Direct assignment creation is no longer exposed publicly. Assignment lifecycle endpoints remain available after proposal acceptance.
- Chat is created only after acceptance. Proposal creation is idempotent through `clientRequestKey`.
- `GET /api/v1/errands?mine=true` lists the authenticated requester's own errands for the design's “My Requests” page.
## CI/CD

GitHub Actions validates pull requests targeting `dev` or `main` and pushes to `dev` or `main` with Node.js 22, `npm ci --ignore-scripts`, an isolated PostgreSQL 16 service, Prisma migrations, Prisma validation/generation, JavaScript syntax linting, OpenAPI validation, an application import check, and Jest coverage. This PR temporarily also validates pushes to `chore/backend-ci-cd` so the new workflow can prove itself before manual merge. Prisma generation runs as an explicit CI step after dependency installation. The workflow prints Node/npm versions before dependency installation so package-manager failures are visible in the run log.

CI/CD never merges pull requests. Merging remains a manual repository action.

CI uses one test database for all database-backed suites:

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wallet_test?schema=public
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/wallet_test?schema=public
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wallet_test?schema=public
```

`npx prisma migrate deploy` runs against that same `wallet_test` database before `npm run test:ci`. The Jest command is generic and runs every test discovered under `tests/`, including wallet concurrency and trips repository integration tests.

Local verification uses the same command:

```bash
npm run verify
```

The full suite requires PostgreSQL because the wallet concurrency and trips repository integration tests intentionally refuse to run without a safe test database. Configure these values before running the full local gate:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wallet_test?schema=public
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/wallet_test?schema=public
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wallet_test?schema=public
SHADOW_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wallet_test_shadow?schema=public
JWT_ACCESS_SECRET=local_access_secret
JWT_REFRESH_SECRET=local_refresh_secret
MOCK_PAYMENT_ENABLED=true
MOCK_PAYMENT_WEBHOOK_SECRET=local_mock_payment_secret
```

Then apply migrations:

```bash
npx prisma migrate deploy
```

Coverage output and Jest JSON results are written to `coverage/` and uploaded as a CI artifact. CI fails if the wallet concurrency or trips repository suites do not run and pass, or if Jest reports skipped tests. The current module-by-module test audit is tracked in `docs/backend-test-audit.md`.

Render deployment can run through checked-in GitHub deploy-hook workflows or through Render dashboard auto-deploys. To use the checked-in workflow, configure repository/environment secrets:

```text
RENDER_STAGING_DEPLOY_HOOK_URL
RENDER_PRODUCTION_DEPLOY_HOOK_URL
```

Use only one deployment trigger per environment. If Render dashboard auto-deploy is already enabled for `dev` or `main`, leave the matching deploy-hook secret unset; the CD workflow records that dashboard auto-deploy is expected. Render service runtime variables should match `.env.example`.

## Phase 11 - Payments and QR Token Top-Up

- `GET /api/v1/payments/packages` returns active server-controlled token packages.
- `POST /api/v1/payments/invoices` creates a 15-minute QR invoice. The client sends only `tokenPackageId` and a UUID `clientRequestKey`; price and token quantities are snapshotted from the database.
- `GET /api/v1/payments/invoices` and `GET /api/v1/payments/invoices/:id` expose only the authenticated user's invoices and lazily mark overdue pending invoices as `EXPIRED`.
- `POST /api/v1/payments/mock/invoices/:id/pay` simulates a successful provider payment only when `MOCK_PAYMENT_ENABLED=true`. It must remain disabled in production.
- `POST /api/v1/payments/webhooks/mock` verifies an HMAC SHA-256 signature using `MOCK_PAYMENT_WEBHOOK_SECRET` and does not use user JWT authentication.
- A successful exact-amount webhook creates the provider transaction, locks and credits the wallet, writes one immutable `TOKEN_TOP_UP` ledger entry, creates an in-app notification, and marks the invoice `PAID` in one database transaction.
- Duplicate create requests, duplicate provider transaction IDs, repeated paid-invoice webhooks, and concurrent wallet updates are protected by database constraints, row locks, and idempotency checks.
- The QR value is returned as `qrCodePayload`; the frontend renders the QR image. This MVP does not transfer real money.
- The payment provider contract isolates the current `MockPaymentProvider`; a future `JawwalPayProvider` can implement the same create-payment and webhook-verification responsibilities.

Local/staging mock configuration:

```env
MOCK_PAYMENT_ENABLED=true
MOCK_PAYMENT_WEBHOOK_SECRET=replace_with_a_long_random_environment_secret
```

Never enable mock payment confirmation in a real production environment.

## Phase 10 - Ratings, Trust Score, and Badges

- Ratings are allowed only after an assignment reaches `COMPLETED`; requester and traveler each rate the other participant once.
- `POST /api/v1/ratings` accepts integer stars from 1 to 5, an optional 500-character comment, up to 5 approved unique feedback tags, and optional `CASH`/`BARTER` payment confirmation.
- Ratings are immutable. An identical retry is idempotent; a changed second submission returns `409`.
- `GET /api/v1/ratings/pending` returns unfinished rating prompts. The frontend treats the prompt as required, while the backend does not block login or unrelated endpoints.
- `GET /api/v1/ratings/me/received`, `GET /api/v1/ratings/me/summary`, and `GET /api/v1/ratings/assignments/:assignmentId` expose received ratings, trust/badges, and participant-only assignment ratings.
- Trust is recalculated immediately from all received stars: `((70 * 5) + sum(stars * 20)) / (5 + ratingCount)`, clamped to 0-100 and rounded to two decimals.
- Comments, feedback tags, and payment modality do not affect Trust Score. Submitting a rating has no wallet token cost.
- Badges are awarded idempotently: First Delivery (1 completed traveler delivery), Helpful Neighbor (5), Trusted Traveler (5+ ratings and trust >= 80), and Top Rated (10+ ratings, average >= 4.5, trust >= 90).
- Completing an assignment returns `ratingPrompt` so the frontend can immediately open the rating screen.

## Phase 7 - Matching Engine

The matching engine treats each trip as a round outing: the traveler leaves their origin area, visits a destination area, then returns to the origin area with accepted errands.

- Errand writes require `pickupNeighborhoodId`; it is stored as `destinationNeighborhoodId` and represents where the item is bought.
- Trip creation requires `expectedReturnTime`, which must be after `departureTime`.
- `GET /api/v1/matching/errands/:id` returns ranked compatible trips to the errand owner.
- `GET /api/v1/matching/trips/:id` returns ranked compatible errands to the trip owner.
- Hard filters require OPEN/ACTIVE status, unexpired records, exact or nearby origin and destination neighborhoods, return before the errand deadline, enough weight class and remaining units, and different users.
- Capacity consumption mapping is `LIGHT=1`, `MEDIUM=2`, and `HEAVY=3` units.
- Ranking uses destination (40), time (30), load fit (15), urgency boost (10), and a trust penalty up to 10; the final value is normalized to 0-100.
- Results are computed on read, capped at 10 by default and 20 maximum, and do not deduct wallet tokens.
- Tie-breaking is score descending, relevant time ascending, then UUID ascending.
- Existing trips without `expectedReturnTime` remain readable but are excluded from matching.

Example request:

```http
GET /api/v1/matching/errands/{errandId}?limit=10
Authorization: Bearer <access-token>
```

## Phase 1 - Database Foundation

Built and prepared the database foundation based on the SRS and ERD.

### Implemented

- Added versioned JSON-based delivery pricing with same-area, nearby-area, same-zone, cross-zone, and manual override rules.
- Added `GET /api/v1/delivery-pricing/quote`; trip creation recalculates and stores an immutable fee snapshot.
- Travelers cannot submit or edit `deliveryFeeNis`; new trips require `destinationNeighborhoodId`.

- Added versioned JSON-based delivery pricing with same-area, nearby-area, same-zone, cross-zone, and area-override rules
- Added `GET /api/v1/delivery-pricing/quote`; trip creation recalculates and stores an immutable delivery-fee snapshot
- Travelers cannot submit or edit `deliveryFeeNis`; new trips require a structured destination neighborhood

- Created the Prisma models based on the ERD
- Formatted the Prisma schema using `prisma format`
- Validated the Prisma schema using `prisma validate`
- Generated the Prisma Client using `prisma generate`
- Connected Prisma to PostgreSQL
- Created the initial database migration
- Added CHECK constraints and partial indexes
- Verified database relationships
- Created `prisma/seed.js`
- Added seed data for:
  - Neighborhoods
  - Categories
  - Token Packages
  - Badges
- Tested and verified the database data using Prisma Studio

### Result

Database schema created, migrated, seeded, and validated successfully.

---

## Phase 2 - Core Backend Infrastructure

Built the shared backend infrastructure required before implementing authentication, trips, and other APIs.

### Implemented

- Created the core backend folder structure
- Added Prisma Client configuration
- Added environment configuration
- Added global error handling
- Added 404 handling
- Added request validation middleware
- Added authentication middleware foundation
- Added API rate limiting
- Added request logging
- Added standardized API response helpers
- Added core middleware testing

### Standard Response Format

Success response:

```json
{
  "success": true,
  "message": "...",
  "data": {}
}
```

Error response:

```json
{
  "success": false,
  "message": "...",
  "errors": []
}
```

### Testing

Core middleware was tested for:

- Health endpoint
- Request validation
- 404 handling
- Rate limiting
- Valid and invalid requests

**Test Result: 6 passed, 6 total**

### Result

Backend foundation ready for feature development.
---

## Phase 3 - Authentication & User Management

Implemented the authentication and user management foundation using phone number and OTP verification.

### Implemented

- Added phone-based OTP authentication
- Added OTP request and verification flow
- Added OTP expiration and maximum attempt protection
- Added secure OTP hashing using bcrypt
- Added phone verification for users
- Added automatic user creation after successful OTP verification
- Added automatic wallet creation for new users
- Added JWT access token generation
- Added JWT refresh token generation
- Added refresh token storage using secure hashing
- Added refresh token rotation
- Added logout and refresh token revocation
- Added authentication middleware for protected routes
- Added user status validation
- Prevented `SUSPENDED` and `BANNED` users from accessing protected routes
- Added user profile retrieval
- Added authenticated profile-image upload, replacement, and deletion using Supabase Storage
- Profile images accept JPEG, PNG, or WebP files up to 5 MB at `PUT /api/v1/users/me/profile-image` (multipart field: `image`)
- Added `DELETE /api/v1/users/me/profile-image`; the public image URL is returned by `GET /api/v1/users/me`

Profile-image storage setup:

1. Create a public Supabase Storage bucket named `profile-images`.
2. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `PROFILE_IMAGES_BUCKET` on the backend/Render environment.
3. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend. The frontend only sends the image with the authenticated API request.
- Added authentication and user management tests

### Authentication Flow

```text
Request OTP
    ↓
Verify OTP
    ↓
Create / Find User
    ↓
Create Wallet (if needed)
    ↓
Generate Access Token
    ↓
Generate Refresh Token
```

### Security

Authentication includes:

- Hashed OTP storage
- OTP expiration
- Maximum OTP attempts
- One-time OTP verification
- JWT access and refresh tokens
- Hashed refresh token storage
- Refresh token rotation
- Refresh token revocation on logout
- User status checks for protected routes

### Result

Authentication and user management are ready for use by protected backend features.

---

## Phase 4 - Wallet & Token Ledger

Implemented a safe and auditable wallet system for managing user tokens and recording token transactions.

### Implemented

- Added authenticated wallet retrieval
- Added wallet transaction history
- Added pagination and validation for transaction history
- Added internal token debit operations
- Added internal token credit operations
- Added token refund operations
- Added wallet ledger entries for balance changes
- Added database transactions for wallet operations
- Added PostgreSQL row-level locking using `FOR UPDATE`
- Added insufficient balance and negative balance protection
- Added wallet-scoped idempotency
- Added duplicate operation protection
- Added signup bonus tracking in the wallet ledger
- Added `SIGNUP_BONUS` wallet transaction type
- Added wallet-related Prisma migrations
- Added concurrency protection and integration testing
- Protected all public wallet routes with authentication
- Prevented direct public wallet balance modification

### Wallet API

Available authenticated endpoints:

```text
GET /api/v1/wallet
GET /api/v1/wallet/transactions
```

Transaction history supports pagination using:

```text
skip
take
```

Wallet balance modifications are intentionally not exposed through public API endpoints.

Other backend modules should use the internal Wallet Service for debit, credit, and refund operations.

### Transaction Safety

Wallet balance modifications follow this flow:

```text
Begin Database Transaction
        ↓
Lock Wallet
        ↓
Check Idempotency
        ↓
Validate Balance
        ↓
Update Balance
        ↓
Create Ledger Entry
        ↓
Commit
```

Row-level locking prevents concurrent operations from incorrectly modifying the same wallet balance.

### Wallet-Scoped Idempotency

Idempotency is scoped by:

```text
walletId + idempotencyKey
```

Different wallets can safely use the same idempotency key, while duplicate operations within the same wallet remain protected.

### Signup Bonus

New wallets start with `3` tokens.

The initial balance is now recorded in the wallet ledger using:

```text
Transaction Type: SIGNUP_BONUS
Token Amount:     3
Balance Before:   0
Balance After:    3
```

User creation, wallet creation, and signup bonus ledger creation are executed within the authentication database transaction.

### Concurrency Protection

A PostgreSQL integration test verifies concurrent wallet operations.

Example:

```text
Initial Balance = 5

Debit A = 4
Debit B = 4
```

Only one debit succeeds, resulting in:

```text
Final Balance = 1
Ledger Entries = 1
```

This verifies that database transactions and row-level locking prevent race conditions and negative balances.

### Testing

Wallet tests cover:

- Wallet retrieval
- Transaction history
- Pagination
- Authentication
- Debit
- Credit
- Refund
- Insufficient balance
- Idempotency
- Wallet-scoped idempotency
- Ledger creation
- Concurrent debit operations
- Signup bonus ledger creation
- Prevention of public wallet balance modification

**Final Backend Test Result: 9 test suites passed, 50 tests passed**

### Result

Wallet and Token Ledger are ready to be used internally by upcoming modules such as Errands and Trips, with transaction safety, concurrency protection, idempotency, and complete token movement tracking.

---

## Authentication Testing OTP & Password Recovery

Authentication supports a fixed six-digit OTP for explicitly allowlisted test
phone numbers. Configure it only in controlled development or staging testing:

```env
OTP_FIXED_CODE=000000
OTP_TEST_PHONES=0590000000
```

Phone-verification and password-reset OTP records are separated by purpose, so
a registration OTP cannot be reused to reset a password.

Password recovery endpoints:

```text
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
```

Successful password reset replaces the previous bcrypt password hash, consumes
the reset OTP, and revokes all active refresh tokens for the account. The user
must log in again with the new password.

Do not enable a fixed OTP for real user phone numbers in production. A real
SMS/WhatsApp provider is still required before production authentication.
