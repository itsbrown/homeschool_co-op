import webpush from 'web-push';

// VAPID keys for web push (generated via npx web-push generate-vapid-keys)
// These should be stored as environment variables in production
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BCGmUSATUlw1hM6mLZPP7wTfvFtTDPw3eTm3klDrSa9129ZJJvCmNbi8B3tDpbGuN-OyACDzx_OUY2knRXIpqXM';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'bZl4pYZEJLKRLyxTdSe65YyK2wgDn0CbNcCJffiutNs';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@americanseekersacademy.com';

// Configure web push with VAPID details
webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: any;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Send a push notification to a single subscription
 */
export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushNotificationPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    };

    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload)
    );

    console.log(`🔔 Push notification sent successfully to ${subscription.endpoint.substring(0, 50)}...`);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Failed to send push notification:', error);
    
    // Handle subscription errors (expired, invalid, etc.)
    if (error.statusCode === 404 || error.statusCode === 410) {
      console.log('📱 Subscription expired or invalid, should be removed from database');
      return { success: false, error: 'subscription_expired' };
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Send push notifications to multiple subscriptions
 */
export async function sendPushNotifications(
  subscriptions: PushSubscriptionData[],
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number; expired: string[] }> {
  const results = {
    sent: 0,
    failed: 0,
    expired: [] as string[],
  };

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      const result = await sendPushNotification(subscription, payload);
      
      if (result.success) {
        results.sent++;
      } else {
        results.failed++;
        if (result.error === 'subscription_expired') {
          results.expired.push(subscription.endpoint);
        }
      }
    })
  );

  console.log(`📊 Push notification batch: ${results.sent} sent, ${results.failed} failed, ${results.expired.length} expired`);
  return results;
}

/**
 * Get the public VAPID key for client-side subscription
 */
export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

/**
 * Check if web push is configured
 */
export function isWebPushConfigured(): boolean {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
}
