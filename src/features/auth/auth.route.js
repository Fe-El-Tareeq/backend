const { createRoute } = require('../../utils/featureScaffold');
const controller = require('./auth.controller');
const validation = require('./auth.validation');

module.exports = createRoute(controller, validation);
