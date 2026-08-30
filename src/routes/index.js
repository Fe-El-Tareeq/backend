const express = require('express');

const adminRoutes = require('../features/admin/admin.route');
const assignmentsRoutes = require('../features/assignments/assignments.route');
const authRoutes = require('../features/auth/auth.route');
const chatRoutes = require('../features/chat/chat.route');
const errandsRoutes = require('../features/errands/errands.route');
const locationsRoutes = require('../features/locations/locations.route');
const matchingRoutes = require('../features/matching/matching.route');
const notificationsRoutes = require('../features/notifications/notifications.route');
const paymentsRoutes = require('../features/payments/payments.route');
const ratingsRoutes = require('../features/ratings/ratings.route');
const tripsRoutes = require('../features/trips/trips.route');
const usersRoutes = require('../features/users/users.route');
const walletRoutes = require('../features/wallet/wallet.route');
const deliveryPricingRoutes = require('../features/deliveryPricing/deliveryPricing.route');

const router = express.Router();

router.use('/admin', adminRoutes);
router.use('/assignments', assignmentsRoutes);
router.use('/auth', authRoutes);
router.use('/chat-rooms', chatRoutes);
router.use('/errands', errandsRoutes);
router.use('/locations', locationsRoutes);
router.use('/matching', matchingRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/payments', paymentsRoutes);
router.use('/ratings', ratingsRoutes);
router.use('/trips', tripsRoutes);
router.use('/users', usersRoutes);
router.use('/wallet', walletRoutes);
router.use('/delivery-pricing', deliveryPricingRoutes);

module.exports = router;
