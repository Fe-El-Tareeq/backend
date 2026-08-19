const ApiError = require("../../utils/ApiError");
const repository = require("./wallet.repository");
const prisma = require("../../config/prisma");

// Returns the authenticated user's wallet.
const getWallet = async (userId) => {
  const wallet = await repository.findWalletByUserId(userId);

  if (!wallet) {
    throw new ApiError(404, "Wallet not found");
  }

  return wallet;
};

// Returns the authenticated user's wallet transaction history with pagination.
const getTransactionHistory = async (userId, options = {}) => {
  const wallet = await repository.findWalletByUserId(userId);

  if (!wallet) {
    throw new ApiError(404, "Wallet not found");
  }

  const { skip = 0, take = 20 } = options;

  const [transactions, total] = await Promise.all([
    repository.findTransactionsByWalletId(wallet.id, { skip, take }),
    repository.countTransactionsByWalletId(wallet.id),
  ]);

  return {
    transactions,
    pagination: {
      skip,
      take,
      total,
    },
  };
};

// Validates the token amount before performing a wallet operation.
const validateTokenAmount = (amount) => {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ApiError(400, "Token amount must be a positive integer");
  }
};
// Checks whether a repeated idempotency key belongs to the same operation.
const validateIdempotentOperation = (
  existingTransaction,
  { amount, transactionType, referenceType = null, referenceId = null },
) => {
  const isSameOperation =
    existingTransaction.tokenAmount === amount &&
    existingTransaction.transactionType === transactionType &&
    (existingTransaction.referenceType || null) === referenceType &&
    (existingTransaction.referenceId || null) === referenceId;

  if (!isSameOperation) {
    throw new ApiError(
      409,
      "Idempotency key has already been used with different operation data",
    );
  }

  return existingTransaction;
};

const executeDebit = async (
  {
    userId,
    amount,
    transactionType,
    referenceType = null,
    referenceId = null,
    idempotencyKey = null,
    description = null,
  },
  client,
) => {
  // Locks the wallet row until this database transaction finishes.
  const wallet = await repository.lockWallet(userId, client);

  if (!wallet) {
    throw new ApiError(404, "Wallet not found");
  }

  // Check after locking so concurrent retries return the first operation.
  if (idempotencyKey) {
    const existingTransaction = await repository.findByIdempotencyKey(
      wallet.id,
      idempotencyKey,
      client,
    );

    if (existingTransaction) {
      return validateIdempotentOperation(existingTransaction, {
        amount,
        transactionType,
        referenceType,
        referenceId,
      });
    }
  }

  const balanceBefore = wallet.token_balance;

  // Prevents the wallet balance from becoming negative.
  if (balanceBefore < amount) {
    throw new ApiError(400, "Insufficient token balance");
  }

  const balanceAfter = balanceBefore - amount;

  // Updates the wallet balance inside the same database transaction.
  await repository.updateBalance(wallet.id, balanceAfter, client);
  // Records the debit operation in the wallet ledger.
  const ledgerEntry = await repository.createLedgerEntry(
    {
      walletId: wallet.id,
      transactionType,
      tokenAmount: amount,
      balanceBefore,
      balanceAfter,
      referenceType,
      referenceId,
      idempotencyKey,
      description,
    },
    client,
  );

  return ledgerEntry;
};

// Deducts tokens from a user's wallet safely inside a database transaction.
const debit = async ({
  userId,
  amount,
  transactionType,
  referenceType = null,
  referenceId = null,
  idempotencyKey = null,
  description = null,
  client = null,
}) => {
  validateTokenAmount(amount);

  const payload = {
    userId,
    amount,
    transactionType,
    referenceType,
    referenceId,
    idempotencyKey,
    description,
  };

  if (client) {
    return executeDebit(payload, client);
  }

  return prisma.$transaction((tx) => executeDebit(payload, tx));
};
// Adds tokens to a user's wallet safely inside a database transaction.
const credit = async ({
  userId,
  amount,
  transactionType,
  referenceType = null,
  referenceId = null,
  idempotencyKey = null,
  description = null,
}) => {
  validateTokenAmount(amount);

  return prisma.$transaction(async (tx) => {
    // Locks the wallet so concurrent operations cannot update the same balance.
    const wallet = await repository.lockWallet(userId, tx);

    if (!wallet) {
      throw new ApiError(404, "Wallet not found");
    }

    // Prevents the same credit operation from being processed more than once.
    if (idempotencyKey) {
      const existingTransaction = await repository.findByIdempotencyKey(
        wallet.id,
        idempotencyKey,
        tx,
      );

      if (existingTransaction) {
        return validateIdempotentOperation(existingTransaction, {
          amount,
          transactionType,
          referenceType,
          referenceId,
        });
      }
    }

    const balanceBefore = wallet.token_balance;
    const balanceAfter = balanceBefore + amount;

    // Updates the wallet balance inside the same database transaction.
    await repository.updateBalance(wallet.id, balanceAfter, tx);

    // Records the credit operation in the wallet ledger.
    const ledgerEntry = await repository.createLedgerEntry(
      {
        walletId: wallet.id,
        transactionType,
        tokenAmount: amount,
        balanceBefore,
        balanceAfter,
        referenceType,
        referenceId,
        idempotencyKey,
        description,
      },
      tx,
    );

    return ledgerEntry;
  });
}; // Refunds tokens back to a user's wallet.
const refund = async ({
  userId,
  amount,
  referenceType = null,
  referenceId = null,
  idempotencyKey,
  description = "Token refund",
}) => {
  if (!idempotencyKey) {
    throw new ApiError(400, "Idempotency key is required for refunds");
  }

  return credit({
    userId,
    amount,
    transactionType: "REFUND",
    referenceType,
    referenceId,
    idempotencyKey,
    description,
  });
};

module.exports = {
  getWallet,
  getTransactionHistory,
  validateTokenAmount,
  validateIdempotentOperation,
  debit,
  credit,
  refund,
};
