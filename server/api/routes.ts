import express from 'express';
import stripeRoutes from './stripe.js';
import billingRoutes from './billing.js';
import paymentHistoryRoutes from './payment-history.js';
import scheduledPaymentsRoutes from './scheduled-payments.js';
import stripeMigrationRoutes from './stripe-migration.js';
import stripeWebhookRoutes from './stripe-webhook.js';
import cartRoutes from './cart.js';
import marketingRoutes from './marketing.js';
import schoolRoutes from './school.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Public routes (no auth required)
router.use('/stripe', stripeRoutes);
router.use('/stripe-webhooks', stripeWebhookRoutes);
router.use('/marketing', marketingRoutes);

// Protected routes (require authentication)
router.use('/billing', authMiddleware, billingRoutes);
router.use('/payment-history', authMiddleware, paymentHistoryRoutes);
router.use('/scheduled-payments', authMiddleware, scheduledPaymentsRoutes);
router.use('/stripe-migration', authMiddleware, stripeMigrationRoutes);
router.use('/cart', authMiddleware, cartRoutes);
router.use('/school', authMiddleware, schoolRoutes);

export default router;