const { createRoute } = require('../../utils/featureScaffold');
const controller = require('./wallet.controller');
const validation = require('./wallet.validation');

module.exports = createRoute(controller, validation);
