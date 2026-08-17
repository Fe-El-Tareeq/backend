const ApiResponse = require("../../utils/ApiResponse");
const service = require("./wallet.service");

// Returns the authenticated user's wallet balance and wallet information.
const getWallet = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const wallet = await service.getWallet(userId);

    return res
      .status(200)
      .json(new ApiResponse(200, "Wallet retrieved successfully.", wallet));
  } catch (error) {
    next(error);
  }
};

// Returns the authenticated user's wallet transaction history.
const getTransactions = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { skip, take } = req.validatedData.query;

    const transactions = await service.getTransactionHistory(userId, {
      skip,
      take,
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Wallet transactions retrieved successfully.",
          transactions,
        ),
      );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getWallet,
  getTransactions,
};
