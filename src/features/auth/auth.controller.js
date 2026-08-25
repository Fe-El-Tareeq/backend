const authService = require("./auth.service");
const ApiResponse = require("../../utils/ApiResponse");

const register = async (req, res, next) => {
  try {
    const {
      fullName,
      phone,
      password,
      neighborhoodId,
    } = req.validatedData.body;

    const result = await authService.register({
      fullName,
      phone,
      password,
      neighborhoodId,
    });

    return res.status(201).json(
      new ApiResponse(201, result.message, {
        expiresInMinutes: result.expiresInMinutes,
      })
    );
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { phone, password } = req.validatedData.body;

    const result = await authService.login(phone, password);

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

const forgotPassword = async (req, res, next) => {
  try {
    const { phone, channel } = req.validatedData.body;
    const result = await authService.forgotPassword(phone, channel);

    return res.status(200).json(
      new ApiResponse(200, result.message, {
        expiresInMinutes: result.expiresInMinutes,
      }),
    );
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { phone, otp, newPassword } = req.validatedData.body;
    const result = await authService.resetPassword(phone, otp, newPassword);

    return res.status(200).json(new ApiResponse(200, result.message));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  requestOtp,
  verifyOtp,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
};
