const { createRoute } = require('../../utils/featureScaffold');
const controller = require('./notifications.controller');
const validation = require('./notifications.validation');

module.exports = createRoute(controller, validation);
