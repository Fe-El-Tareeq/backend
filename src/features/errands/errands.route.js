const { createRoute } = require('../../utils/featureScaffold');
const controller = require('./errands.controller');
const validation = require('./errands.validation');

module.exports = createRoute(controller, validation);
