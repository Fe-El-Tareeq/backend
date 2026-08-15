const authService = require("./auth.service");
const ApiResponse = require("../../utils/ApiResponse");

const requestOtp = async (req, res, next) => {
  try {
    const { phone, channel } = req.validatedData.body;

    const result = await authService.requestOtp(phone, channel);

    return res.status(200).json(
      new ApiResponse(200, result.message, {
        expiresInMinutes: result.expiresInMinutes,
      })
    );
  } catch (error) {
    next(error);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const { phone, otp } = req.validatedData.body;

    const result = await authService.verifyOtp(phone, otp);

    return res.status(200).json(
      new ApiResponse(200, result.message, {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenType: result.tokenType,
        accessTokenExpiresIn: result.accessTokenExpiresIn,
        refreshTokenExpiresIn: result.refreshTokenExpiresIn,
      })
    );
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.validatedData.body;

    const result = await authService.refresh(refreshToken);

    return res.status(200).json(
      new ApiResponse(200, result.message, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenType: result.tokenType,
        accessTokenExpiresIn: result.accessTokenExpiresIn,
        refreshTokenExpiresIn: result.refreshTokenExpiresIn,
      })
    );
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.validatedData.body;

    const result = await authService.logout(refreshToken);

    return res.status(200).json(new ApiResponse(200, result.message));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requestOtp,
  verifyOtp,
  refresh,
  logout,
};
