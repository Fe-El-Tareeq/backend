const { createRoute } = require('../../utils/featureScaffold');
const express = require('express');
const controller = require('./locations.controller');
const validation = require('./locations.validation');

const router = express.Router();
const scaffoldRoute = createRoute(controller, validation);

router.get('/neighborhoods', controller.listActiveNeighborhoods);
router.use('/', scaffoldRoute);

module.exports = router;
