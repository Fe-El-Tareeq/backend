const { createRoute } = require('../../utils/featureScaffold');
const controller = require('./ratings.controller');
const validation = require('./ratings.validation');

module.exports = createRoute(controller, validation);
