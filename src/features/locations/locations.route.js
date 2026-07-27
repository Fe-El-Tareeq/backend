const { createRoute } = require('../../utils/featureScaffold');
const controller = require('./locations.controller');
const validation = require('./locations.validation');

module.exports = createRoute(controller, validation);
