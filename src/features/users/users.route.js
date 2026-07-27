const { createRoute } = require('../../utils/featureScaffold');
const controller = require('./users.controller');
const validation = require('./users.validation');

module.exports = createRoute(controller, validation);
