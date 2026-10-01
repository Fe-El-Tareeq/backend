// Temporary migration rule: email-era accounts require verified email, while
// legacy accounts without email retain their historical phone verification.
const isAccountVerifiedForAccess = (user) =>
  Boolean(user?.email ? user.emailVerifiedAt : user?.phoneVerifiedAt);

module.exports = { isAccountVerifiedForAccess };
