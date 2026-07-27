const { createRoute } = require('../../utils/featureScaffold');
const controller = require('./payments.controller');
const validation = require('./payments.validation');

module.exports = createRoute(controller, validation);
