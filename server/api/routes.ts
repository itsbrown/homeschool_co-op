import express from 'express';
import stripeRoutes from './stripe';
import billingRoutes from './billing';
import paymentHistoryRoutes from './payment-history';
import scheduledPaymentsRoutes from './scheduled-payments';
import stripeMigrationRoutes from './stripe-migration';
import stripeWebhookRoutes from './stripe-webhook';
import cartRoutes from './cart';
import marketingRoutes from './marketing';
import schoolRoutes from './school';
import { authMiddleware } from '../middleware/auth';

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