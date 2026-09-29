const env = require("../../config/env");
const ApiError = require("../../utils/ApiError");

const isDashboardAdmin = (user) => {
  return Boolean(
    env.adminUserId &&
      user &&
      user.status === "ACTIVE" &&
      user.role === "SUPER_ADMIN" &&
      user.id === env.adminUserId,
  );
};

const assertDashboardAdmin = (user) => {
  if (!isDashboardAdmin(user)) {
    throw new ApiError(403, "Dashboard administrator access is required.");
  }
};

module.exports = {
  assertDashboardAdmin,
  isDashboardAdmin,
};
