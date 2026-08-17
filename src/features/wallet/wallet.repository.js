const prisma = require("../../config/prisma");

// Returns the wallet that belongs to the authenticated user.
const findWalletByUserId = async (userId, client = prisma) => {
  return client.wallet.findUnique({
    where: {
      userId,
    },
    select: {
      id: true,
      userId: true,
      tokenBalance: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

// Returns the wallet transaction history ordered from newest to oldest.
const findTransactionsByWalletId = async (
  walletId,
  options = {},
  client = prisma,
) => {
  const { skip = 0, take = 20 } = options;

  return client.walletTransaction.findMany({
    where: {
      walletId,
    },
    orderBy: {
      createdAt: "desc",
    },
    skip,
    take,
    select: {
      id: true,
      transactionType: true,
      tokenAmount: true,
      balanceBefore: true,
      balanceAfter: true,
      referenceType: true,
      referenceId: true,
      idempotencyKey: true,
      description: true,
      createdAt: true,
    },
  });
};
// Returns the total number of transactions for a wallet.
const countTransactionsByWalletId = async (walletId, client = prisma) => {
  return client.walletTransaction.count({
    where: {
      walletId,
    },
  });
};

// Checks whether the wallet already has an operation with this idempotency key.
const findByIdempotencyKey = async (
  walletId,
  idempotencyKey,
  client = prisma,
) => {
  if (!walletId || !idempotencyKey) {
    return null;
  }

  return client.walletTransaction.findFirst({
    where: {
      walletId,
      idempotencyKey,
    },
  });
};

// Locks the wallet row during a database transaction.
// This prevents concurrent operations from modifying the same balance at the same time.
const lockWallet = async (userId, client) => {
  const rows = await client.$queryRaw`
    SELECT
      id,
      user_id,
      token_balance
    FROM wallets
    WHERE user_id = ${userId}::uuid
    FOR UPDATE
  `;

  return rows[0] || null;
};

// Updates the wallet token balance inside the current database transaction.
const updateBalance = async (walletId, tokenBalance, client) => {
  return client.wallet.update({
    where: {
      id: walletId,
    },
    data: {
      tokenBalance,
    },
  });
};

// Creates an immutable ledger entry for a wallet operation.
const createLedgerEntry = async (data, client) => {
  return client.walletTransaction.create({
    data: {
      walletId: data.walletId,
      transactionType: data.transactionType,
      tokenAmount: data.tokenAmount,
      balanceBefore: data.balanceBefore,
      balanceAfter: data.balanceAfter,
      referenceType: data.referenceType || null,
      referenceId: data.referenceId || null,
      idempotencyKey: data.idempotencyKey || null,
      description: data.description || null,
      paymentInvoiceId: data.paymentInvoiceId || null,
    },
  });
};

module.exports = {
  findWalletByUserId,
  findTransactionsByWalletId,
  countTransactionsByWalletId,
  findByIdempotencyKey,
  lockWallet,
  updateBalance,
  createLedgerEntry,
};
