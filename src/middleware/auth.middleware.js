function optionalAuth(req, res, next) {
  req.user = null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication is required',
    });
  }

  return next();
}

module.exports = {
  optionalAuth,
  requireAuth,
};
