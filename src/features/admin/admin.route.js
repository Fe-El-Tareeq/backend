const { createRoute } = require('../../utils/featureScaffold');
const controller = require('./admin.controller');
const validation = require('./admin.validation');

module.exports = createRoute(controller, validation);
