import { sendEmail } from '../lib/email-service';

function wrapBody(title: string, body: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #4F46E5; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 20px;">${title}</h1>
      </div>
      <div style="padding: 24px;">${body}</div>
    </div>
  `;
}

export async function sendLocationActivationNoticeEmail(params: {
  email: string;
  parentName: string;
  locationName: string;
  chargeAt: Date;
  threshold: number;
  currentCount: number;
}): Promise<void> {
  const dateStr = params.chargeAt.toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
  });
  const html = wrapBody(
    'Campus opening — payment scheduled',
    `<p>Dear ${params.parentName},</p>
    <p>Great news: <strong>${params.locationName}</strong> reached ${params.currentCount} of ${params.threshold} students with a saved payment method.</p>
    <p>Your tuition will be charged on <strong>${dateStr}</strong> using the card on file. No action is needed unless you wish to update your payment method before that date.</p>`,
  );
  await sendEmail(
    params.email,
    params.parentName,
    `${params.locationName} — tuition charge scheduled`,
    html,
    undefined,
    'location_activation_notice',
  );
}

export async function sendLocationActivationChargeSuccessEmail(params: {
  email: string;
  parentName: string;
  locationName: string;
  amountCents: number;
}): Promise<void> {
  const amount = (params.amountCents / 100).toFixed(2);
  const html = wrapBody(
    'Enrollment confirmed',
    `<p>Dear ${params.parentName},</p>
    <p>Your payment of <strong>$${amount}</strong> for <strong>${params.locationName}</strong> was successful. Your student(s) are now enrolled.</p>`,
  );
  await sendEmail(
    params.email,
    params.parentName,
    `Payment received — ${params.locationName}`,
    html,
    undefined,
    'location_activation_charge_success',
  );
}

export async function sendLocationActivationChargeFailedEmail(params: {
  email: string;
  parentName: string;
  locationName: string;
  reason: string;
}): Promise<void> {
  const html = wrapBody(
    'Payment could not be processed',
    `<p>Dear ${params.parentName},</p>
    <p>We could not charge your card for <strong>${params.locationName}</strong>.</p>
    <p><strong>Reason:</strong> ${params.reason}</p>
    <p>Please sign in and update your payment method, or contact the school office for help.</p>`,
  );
  await sendEmail(
    params.email,
    params.parentName,
    `Action needed — ${params.locationName} payment`,
    html,
    undefined,
    'location_activation_charge_failed',
  );
}

export async function sendLocationActivationCancelledEmail(params: {
  email: string;
  parentName: string;
  locationName: string;
  reason: string;
}): Promise<void> {
  const html = wrapBody(
    'Campus not opening',
    `<p>Dear ${params.parentName},</p>
    <p><strong>${params.locationName}</strong> will not open at this time (${params.reason}).</p>
    <p>Your wishlist enrollment has been cancelled and you will not be charged. You may remove your saved card from your account settings if you no longer need it on file.</p>`,
  );
  await sendEmail(
    params.email,
    params.parentName,
    `${params.locationName} — campus update`,
    html,
    undefined,
    'location_activation_cancelled',
  );
}

export async function sendLocationWishlistPmReminderEmail(params: {
  email: string;
  parentName: string;
  locationName: string;
  threshold: number;
  currentCount: number;
}): Promise<void> {
  const html = wrapBody(
    'Save a payment method to join the waitlist',
    `<p>Dear ${params.parentName},</p>
    <p>You added a student to the opening waitlist for <strong>${params.locationName}</strong>.</p>
    <p>Save a payment method on your account to count toward the goal (${params.currentCount} of ${params.threshold} students committed with a card on file). You will not be charged until the campus opens and after a short notice period.</p>`,
  );
  await sendEmail(
    params.email,
    params.parentName,
    `Complete your waitlist signup — ${params.locationName}`,
    html,
    undefined,
    'location_wishlist_pm_reminder',
  );
}
