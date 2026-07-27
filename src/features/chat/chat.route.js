const { createRoute } = require('../../utils/featureScaffold');
const controller = require('./chat.controller');
const validation = require('./chat.validation');

module.exports = createRoute(controller, validation);
