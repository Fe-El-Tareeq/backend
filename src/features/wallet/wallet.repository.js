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

const getWalletTotals = async (walletId, client = prisma) => {
  const groups = await client.walletTransaction.groupBy({
    by: ["transactionType"],
    where: { walletId },
    _sum: { tokenAmount: true },
  });
  const debitTypes = new Set([
    "ERRAND_POST_DEBIT",
    "TRIP_POST_DEBIT",
    "ERRAND_ACCEPT_DEBIT",
    "ADMIN_DEBIT",
  ]);
  return groups.reduce(
    (totals, group) => {
      const amount = group._sum.tokenAmount || 0;
      if (group.transactionType === "TOKEN_TOP_UP")
        totals.totalTokensPurchased += amount;
      if (debitTypes.has(group.transactionType))
        totals.totalTokensSpent += amount;
      return totals;
    },
    { totalTokensPurchased: 0, totalTokensSpent: 0 },
  );
};

// A paid invoice is represented by its ledger entry only. Other invoices
// describe attempted top-ups and must never contribute to balances or totals.
const getWalletActivity = async (
  userId,
  walletId,
  options = {},
  client = prisma,
) => {
  const { skip = 0, take = 20, status, transactionType } = options;
  return client.$transaction(
    async (db) => {
      const {
        expirePendingInvoicesForUser,
      } = require("../payments/payments.repository");
      await expirePendingInvoicesForUser(userId, new Date(), db);
      const includeLedger = !status || status === "SUCCESS";
      const includeInvoices =
        status !== "SUCCESS" &&
        (!transactionType || transactionType === "TOKEN_TOP_UP");
      const ledgerWhere = {
        walletId,
        ...(transactionType ? { transactionType } : {}),
      };
      const invoiceWhere = {
        userId,
        status: status || {
          in: ["PENDING", "PENDING_VERIFICATION", "FAILED", "EXPIRED"],
        },
      };
      const orderBy = [{ createdAt: "desc" }, { id: "desc" }];
      const [ledger, invoices, ledgerCount, invoiceCount] = await Promise.all([
        includeLedger
          ? db.walletTransaction.findMany({
              where: ledgerWhere,
              orderBy,
              take: skip + take,
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
                paymentInvoiceId: true,
              },
            })
          : [],
        includeInvoices
          ? db.paymentInvoice.findMany({
              where: invoiceWhere,
              orderBy,
              take: skip + take,
              select: {
                id: true,
                status: true,
                totalTokens: true,
                createdAt: true,
                paymentMethod: true,
                referenceCode: true,
                rejectionNotes: true,
              },
            })
          : [],
        includeLedger ? db.walletTransaction.count({ where: ledgerWhere }) : 0,
        includeInvoices ? db.paymentInvoice.count({ where: invoiceWhere }) : 0,
      ]);
      const rows = [
        ...ledger.map((row) => ({
          ...row,
          status: "SUCCESS",
          source: "WALLET_TRANSACTION",
        })),
        ...invoices.map((row) => ({
          id: row.id,
          transactionType: "TOKEN_TOP_UP",
          tokenAmount: row.totalTokens,
          balanceBefore: null,
          balanceAfter: null,
          referenceType: "PAYMENT_INVOICE",
          referenceId: row.id,
          paymentInvoiceId: row.id,
          idempotencyKey: null,
          description: null,
          createdAt: row.createdAt,
          status: row.status,
          source: "PAYMENT_INVOICE",
          paymentMethod: row.paymentMethod,
          referenceCode: row.referenceCode,
          rejectionNotes: row.rejectionNotes,
        })),
      ];
      rows.sort(
        (a, b) =>
          new Date(b.createdAt) - new Date(a.createdAt) ||
          (a.id < b.id
            ? 1
            : a.id > b.id
              ? -1
              : a.source.localeCompare(b.source)),
      );
      return {
        transactions: rows.slice(skip, skip + take),
        pagination: { skip, take, total: ledgerCount + invoiceCount },
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
};

module.exports = {
  getWalletTotals,
  getWalletActivity,
  findWalletByUserId,
  findTransactionsByWalletId,
  countTransactionsByWalletId,
  findByIdempotencyKey,
  lockWallet,
  updateBalance,
  createLedgerEntry,
};
