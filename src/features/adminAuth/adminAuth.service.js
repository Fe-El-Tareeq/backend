const ApiError = require("../../utils/ApiError");
const authService = require("../auth/auth.service");
const {
  assertDashboardAdmin,
  isDashboardAdmin,
} = require("./adminAuth.policy");
const { isAccountVerifiedForAccess } = require("../auth/accountVerification");

const invalidCredentials = () =>
  new ApiError(401, "Invalid phone or password.");

const login = async (phone, password) => {
  const user = await authService.authenticatePassword(phone, password);

  if (!isAccountVerifiedForAccess(user) || !isDashboardAdmin(user)) {
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
    if (!isAccountVerifiedForAccess(user)) {
      throw new ApiError(403, "Dashboard administrator access is required.");
    }
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
