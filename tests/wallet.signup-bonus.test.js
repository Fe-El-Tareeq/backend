process.env.NODE_ENV = "test";

jest.mock("../src/features/auth/auth.repository");
jest.mock("../src/features/wallet/wallet.repository");

const authRepository = require("../src/features/auth/auth.repository");
const walletRepository = require("../src/features/wallet/wallet.repository");
const authService = require("../src/features/auth/auth.service");

describe("Signup Bonus Wallet Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    authRepository.runTransaction.mockImplementation(async (callback) =>
      callback({ tx: true }),
    );
  });

  test("new user receives a wallet with a SIGNUP_BONUS ledger entry", async () => {
    const tx = { tx: true };

    const otpRecord = {
      id: "otp-1",
      phone: "+970599000000",
      otpHash: "$2b$10$abcdefghijklmnopqrstuv",
      verifiedAt: null,
      attemptCount: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };

    const user = {
      id: "user-1",
      phone: "+970599000000",
      role: "USER",
      status: "ACTIVE",
      phoneVerifiedAt: new Date(),
    };

    const wallet = {
      id: "wallet-1",
      userId: "user-1",
      tokenBalance: 3,
    };

    authRepository.findLatestOtpByPhone.mockResolvedValue(otpRecord);

    const bcrypt = require("bcryptjs");
    jest.spyOn(bcrypt, "compare").mockResolvedValue(true);

    authRepository.claimOtpVerification.mockResolvedValue({ count: 1 });

    authRepository.findUserByPhone.mockResolvedValue({
      ...user,
      phoneVerifiedAt: null,
      wallet: null,
    });
    authRepository.updateUserPhoneVerifiedAt.mockResolvedValue(user);
    authRepository.createWallet.mockResolvedValue(wallet);

    walletRepository.createLedgerEntry.mockResolvedValue({
      id: "ledger-1",
      walletId: wallet.id,
      transactionType: "SIGNUP_BONUS",
      tokenAmount: 3,
      balanceBefore: 0,
      balanceAfter: 3,
    });

    authRepository.createRefreshToken.mockResolvedValue({
      id: "refresh-1",
    });

    await authService.verifyOtp("+970599000000", "123456");

    expect(authRepository.createUser).not.toHaveBeenCalled();
    expect(authRepository.updateUserPhoneVerifiedAt).toHaveBeenCalledWith(
      "user-1",
      expect.anything(),
    );

    expect(authRepository.createWallet).toHaveBeenCalledWith(
      "user-1",
      expect.anything(),
    );

    expect(walletRepository.createLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: "wallet-1",
        transactionType: "SIGNUP_BONUS",
        tokenAmount: 3,
        balanceBefore: 0,
        balanceAfter: 3,
        referenceType: "USER",
        referenceId: "user-1",
        idempotencyKey: "signup-bonus:user-1",
        description: "Initial signup bonus",
      }),
      expect.anything(),
    );
  });
});
