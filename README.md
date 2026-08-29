# Backend

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
