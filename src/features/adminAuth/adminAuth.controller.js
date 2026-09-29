const ApiResponse = require("../../utils/ApiResponse");
const service = require("./adminAuth.service");

const login = async (req, res, next) => {
  try {
    const { phone, password } = req.validatedData.body;
    const result = await service.login(phone, password);
    const { message, ...data } = result;
    return res.status(200).json(new ApiResponse(200, message, data));
  } catch (error) {
    return next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const result = await service.refresh(req.validatedData.body.refreshToken);
    const { message, ...data } = result;
    return res.status(200).json(new ApiResponse(200, message, data));
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const result = await service.logout(req.validatedData.body.refreshToken);
    return res.status(200).json(new ApiResponse(200, result.message));
  } catch (error) {
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const result = service.me(req.user);
    return res
      .status(200)
      .json(new ApiResponse(200, "Administrator retrieved successfully", result));
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  login,
  logout,
  me,
  refresh,
};
