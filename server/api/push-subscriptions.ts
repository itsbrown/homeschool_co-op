import express, { Response } from 'express';
import { storage } from '../storage';
import { supabaseAuth } from '../middleware/supabase-auth';
import { getVapidPublicKey } from '../services/web-push';

const router = express.Router();

// Get VAPID public key (for client-side subscription)
router.get('/vapid-public-key', (req, res) => {
  try {
    const publicKey = getVapidPublicKey();
    res.json({ publicKey });
  } catch (error) {
    console.error('Error getting VAPID public key:', error);
    res.status(500).json({ message: 'Failed to get VAPID public key' });
  }
});

// Get user's push subscriptions
router.get('/subscriptions', supabaseAuth, async (req: any, res: Response) => {
  try {
    const userEmail = req.auth?.payload?.email;
    
    if (!userEmail) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const subscriptions = await storage.getPushSubscriptionsByUserId(user.id);
    res.json(subscriptions);
  } catch (error) {
    console.error('Error getting push subscriptions:', error);
    res.status(500).json({ message: 'Failed to get push subscriptions' });
  }
});

// Subscribe to push notifications
router.post('/subscribe', supabaseAuth, async (req: any, res: Response) => {
  try {
    const userEmail = req.auth?.payload?.email;
    const { endpoint, keys, userAgent } = req.body;
    
    if (!userEmail) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ 
        message: 'Missing required subscription data' 
      });
    }
    
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if subscription already exists
    const existing = await storage.getPushSubscriptionByEndpoint(endpoint);
    if (existing) {
      // 🔒 SECURITY: Verify ownership - prevent toggling another user's subscription
      if (existing.userId !== user.id) {
        return res.status(403).json({ 
          message: 'This device is already registered to another account' 
        });
      }
      
      // Update to active if it was deactivated
      if (!existing.isActive) {
        const updated = await storage.updatePushSubscription(existing.id, {
          isActive: true,
          updatedAt: new Date(),
        });
        return res.json(updated);
      }
      return res.json(existing);
    }
    
    // Create new subscription
    const subscription = await storage.createPushSubscription({
      userId: user.id,
      endpoint,
      p256dhKey: keys.p256dh,
      authKey: keys.auth,
      userAgent: userAgent || req.headers['user-agent'] || null,
      isActive: true,
    });
    
    console.log(`🔔 Push subscription created for user ${userEmail}`);
    res.status(201).json(subscription);
  } catch (error) {
    console.error('Error creating push subscription:', error);
    res.status(500).json({ message: 'Failed to create push subscription' });
  }
});

// Unsubscribe from push notifications
router.post('/unsubscribe', supabaseAuth, async (req: any, res: Response) => {
  try {
    const userEmail = req.auth?.payload?.email;
    const { endpoint } = req.body;
    
    if (!userEmail) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    if (!endpoint) {
      return res.status(400).json({ message: 'Endpoint required' });
    }
    
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // 🔒 SECURITY: Verify ownership before deleting
    const subscription = await storage.getPushSubscriptionByEndpoint(endpoint);
    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }
    
    if (subscription.userId !== user.id) {
      return res.status(403).json({ message: 'Access denied: You can only unsubscribe your own devices' });
    }
    
    await storage.deletePushSubscriptionByEndpoint(endpoint);
    
    console.log(`🔕 Push subscription removed for user ${userEmail}: ${endpoint.substring(0, 50)}...`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    res.status(500).json({ message: 'Failed to remove push subscription' });
  }
});

// Test endpoint to send a push notification to yourself
router.post('/test', supabaseAuth, async (req: any, res: Response) => {
  try {
    const userEmail = req.auth?.payload?.email;
    
    if (!userEmail) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const subscriptions = await storage.getPushSubscriptionsByUserId(user.id);
    
    if (subscriptions.length === 0) {
      return res.status(404).json({ 
        message: 'No push subscriptions found. Please subscribe first.' 
      });
    }
    
    const { sendPushNotifications } = await import('../services/web-push.js');
    
    const payload = {
      title: 'Test Notification',
      body: 'This is a test push notification from ASA Learning Platform!',
      icon: '/icon-192x192.png',
      data: {
        url: '/',
        timestamp: new Date().toISOString(),
      },
    };
    
    const results = await sendPushNotifications(
      subscriptions.map(sub => ({
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dhKey,
          auth: sub.authKey,
        },
      })),
      payload
    );
    
    // Remove expired subscriptions
    for (const expiredEndpoint of results.expired) {
      await storage.deletePushSubscriptionByEndpoint(expiredEndpoint);
    }
    
    res.json({
      success: true,
      sent: results.sent,
      failed: results.failed,
      expired: results.expired.length,
    });
  } catch (error) {
    console.error('Error sending test push notification:', error);
    res.status(500).json({ message: 'Failed to send test push notification' });
  }
});

export default router;
