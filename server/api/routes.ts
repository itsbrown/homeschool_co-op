import express from 'express';
import stripeRoutes from './stripe';
import billingRoutes from './billing';
import paymentHistoryRoutes from './payment-history';
import scheduledPaymentsRoutes from './scheduled-payments';
import stripeMigrationRoutes from './stripe-migration';
// REMOVED: stripeWebhookRoutes - Consolidated into secure webhook-handler.ts
import cartRoutes from './cart';
import marketingRoutes from './marketing';
import schoolRoutes from './school';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Public routes (no auth required)
router.use('/stripe', stripeRoutes);
// REMOVED: /stripe-webhooks route - Consolidated into secure webhook-handler.ts
router.use('/marketing', marketingRoutes);

// Protected routes (require authentication)
router.use('/billing', authMiddleware, billingRoutes);
router.use('/payment-history', authMiddleware, paymentHistoryRoutes);
router.use('/scheduled-payments', authMiddleware, scheduledPaymentsRoutes);
router.use('/stripe-migration', authMiddleware, stripeMigrationRoutes);
router.use('/cart', authMiddleware, cartRoutes);
router.use('/school', authMiddleware, schoolRoutes);

export default router;