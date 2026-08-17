# Backend

## Phase 1 - Database Foundation

Built and prepared the database foundation based on the SRS and ERD.

### Implemented

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
