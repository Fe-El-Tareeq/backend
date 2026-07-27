const { createRoute } = require('../../utils/featureScaffold');
const controller = require('./matching.controller');
const validation = require('./matching.validation');

module.exports = createRoute(controller, validation);
