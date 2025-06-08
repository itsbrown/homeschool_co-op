
import { Router } from 'express';
import Stripe from 'stripe';

const router = Router();

// Initialize Stripe (you already have this in your main routes)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// Get payment history for authenticated user
router.get('/history', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Get user email from token (similar to your parent.ts pattern)
    const token = authHeader.split(' ')[1];
    let userEmail;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      userEmail = payload.email;
    } catch (error) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Retrieve payment intents for this customer
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 100,
      expand: ['data.customer'],
    });

    // Filter by customer email or metadata
    const userPayments = paymentIntents.data.filter(payment => 
      payment.metadata.userEmail === userEmail ||
      (payment.customer && typeof payment.customer === 'object' && payment.customer.email === userEmail)
    );

    // Format response to match your PaymentManagement component
    const formattedPayments = userPayments.map(payment => ({
      id: payment.id,
      date: new Date(payment.created * 1000).toISOString().split('T')[0],
      amount: payment.amount / 100, // Convert from cents
      description: payment.description || payment.metadata.title || 'Payment',
      status: payment.status === 'succeeded' ? 'paid' : 
              payment.status === 'processing' ? 'pending' : 
              payment.status === 'canceled' ? 'failed' : payment.status,
      method: payment.payment_method_types[0] || 'card',
      programName: payment.metadata.programName || payment.metadata.title || 'Program',
      childName: payment.metadata.childName || 'Child',
      receiptUrl: payment.charges?.data?.[0]?.receipt_url || null,
      stripePaymentIntentId: payment.id,
    }));

    res.json(formattedPayments);
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ message: 'Error fetching payment history' });
  }
});

// Get specific payment details
router.get('/history/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentId, {
      expand: ['charges', 'customer']
    });

    res.json({
      id: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      created: new Date(paymentIntent.created * 1000).toISOString(),
      description: paymentIntent.description,
      metadata: paymentIntent.metadata,
      charges: paymentIntent.charges?.data?.map(charge => ({
        id: charge.id,
        amount: charge.amount / 100,
        receipt_url: charge.receipt_url,
        paid: charge.paid,
        refunded: charge.refunded,
      })),
    });
  } catch (error) {
    console.error('Error fetching payment details:', error);
    res.status(500).json({ message: 'Error fetching payment details' });
  }
});

// Get subscription history
router.get('/subscriptions', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    let userEmail;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      userEmail = payload.email;
    } catch (error) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Find customer by email
    const customers = await stripe.customers.list({
      email: userEmail,
      limit: 1,
    });

    if (customers.data.length === 0) {
      return res.json([]);
    }

    const customer = customers.data[0];
    
    // Get subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      expand: ['data.latest_invoice'],
    });

    res.json(subscriptions.data);
  } catch (error) {
    console.error('Error fetching subscription history:', error);
    res.status(500).json({ message: 'Error fetching subscription history' });
  }
});

export default router;
