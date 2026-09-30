const ApiError = require("../../utils/ApiError");
const authService = require("../auth/auth.service");
const {
  assertDashboardAdmin,
  isDashboardAdmin,
} = require("./adminAuth.policy");

const invalidCredentials = () =>
  new ApiError(401, "Invalid phone or password.");

const login = async (phone, password) => {
  const user = await authService.authenticatePassword(phone, password);

  if (!user.phoneVerifiedAt || !isDashboardAdmin(user)) {
    throw invalidCredentials();
  }

  const auth = await authService.buildAuthResponse(user);

  return {
    message: "Administrator logged in successfully",
    ...auth,
    user: {
      id: user.id,
      phone: user.phone,
      role: user.role,
    },
  };
};

const refresh = (refreshToken) =>
  authService.refresh(refreshToken, async (user) => {
    assertDashboardAdmin(user);
  });

const logout = (refreshToken) => authService.logout(refreshToken);

const me = (user) => ({
  user: {
    id: user.id,
    phone: user.phone,
    role: user.role,
  },
});

module.exports = {
  login,
  logout,
  me,
  refresh,
};
