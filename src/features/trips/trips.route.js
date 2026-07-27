const { createRoute } = require('../../utils/featureScaffold');
const controller = require('./trips.controller');
const validation = require('./trips.validation');

module.exports = createRoute(controller, validation);
