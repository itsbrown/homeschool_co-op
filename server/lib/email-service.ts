
import * as brevo from '@getbrevo/brevo';
import type { Payment } from '@shared/schema';

if (!process.env.BREVO_API_KEY) {
  throw new Error("BREVO_API_KEY environment variable must be set");
}

// Initialize Brevo API instance
const apiInstance = new brevo.TransactionalEmailsApi();
apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);

interface PaymentConfirmationData {
  parentEmail: string;
  parentName?: string;
  payment: Payment;
  enrollmentDetails: Array<{
    childName: string;
    className: string;
    price: number;
    amountPaid: number;
  }>;
  nextPaymentDate?: Date;
  remainingBalance?: number;
  paymentPlan?: string;
}

export async function sendPaymentConfirmationEmail(data: PaymentConfirmationData): Promise<boolean> {
  try {
    const { parentEmail, parentName, payment, enrollmentDetails, nextPaymentDate, remainingBalance, paymentPlan } = data;

    // Format currency
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount / 100);
    };

    // Format date
    const formatDate = (date: Date) => {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date);
    };

    // Generate enrollment details HTML
    const enrollmentItemsHtml = enrollmentDetails.map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.childName}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.className}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.price)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.amountPaid)}</td>
      </tr>
    `).join('');

    // Generate payment plan information
    let paymentPlanHtml = '';
    if (paymentPlan && paymentPlan !== 'full_payment') {
      paymentPlanHtml = `
        <div style="margin-top: 24px; padding: 16px; background-color: #f8f9fa; border-radius: 8px;">
          <h3 style="margin: 0 0 12px 0; color: #495057;">Payment Plan Information</h3>
          <p style="margin: 0 0 8px 0;"><strong>Payment Plan:</strong> ${paymentPlan}</p>
          ${nextPaymentDate ? `<p style="margin: 0 0 8px 0;"><strong>Next Payment Date:</strong> ${formatDate(nextPaymentDate)}</p>` : ''}
          ${remainingBalance ? `<p style="margin: 0;"><strong>Remaining Balance:</strong> ${formatCurrency(remainingBalance)}</p>` : ''}
        </div>
      `;
    }

    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4F46E5; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0;">Payment Confirmation</h1>
            <p style="color: #E0E7FF; margin: 8px 0 0 0;">American Seekers Academy</p>
          </div>
          
          <div style="padding: 24px;">
            <h2 style="color: #1F2937; margin-bottom: 16px;">Thank you for your payment!</h2>
            
            <p>Dear ${parentName || 'Parent'},</p>
            
            <p>We have successfully processed your payment. Here are the details:</p>
            
            <div style="background-color: #F3F4F6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <h3 style="margin: 0 0 12px 0; color: #374151;">Payment Details</h3>
              <p style="margin: 0 0 8px 0;"><strong>Amount Paid:</strong> ${formatCurrency(payment.amount)}</p>
              <p style="margin: 0 0 8px 0;"><strong>Payment Date:</strong> ${formatDate(payment.createdAt)}</p>
              <p style="margin: 0 0 8px 0;"><strong>Transaction ID:</strong> ${payment.stripePaymentIntentId}</p>
              <p style="margin: 0;"><strong>Payment Method:</strong> ${payment.paymentMethod || 'Card'}</p>
            </div>
            
            <h3 style="color: #374151; margin-top: 24px;">Enrollment Details</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
              <thead>
                <tr style="background-color: #F9FAFB;">
                  <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #E5E7EB;">Child</th>
                  <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #E5E7EB;">Class</th>
                  <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #E5E7EB;">Total Price</th>
                  <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #E5E7EB;">Amount Paid</th>
                </tr>
              </thead>
              <tbody>
                ${enrollmentItemsHtml}
              </tbody>
            </table>
            
            ${paymentPlanHtml}
            
            <div style="margin-top: 32px; padding: 16px; background-color: #EFF6FF; border-left: 4px solid #3B82F6; border-radius: 0 8px 8px 0;">
              <h3 style="margin: 0 0 12px 0; color: #1E40AF;">Next Steps</h3>
              <ul style="margin: 0; padding-left: 20px;">
                <li>Your child's enrollment has been confirmed</li>
                <li>You will receive class details and schedules closer to the start date</li>
                <li>If you have any questions, please contact us at support@americanseekersacademy.com</li>
                ${nextPaymentDate ? `<li>Your next payment of ${formatCurrency(remainingBalance || 0)} is due on ${formatDate(nextPaymentDate)}</li>` : ''}
              </ul>
            </div>
            
            <div style="margin-top: 32px; text-align: center; color: #6B7280;">
              <p>Thank you for choosing American Seekers Academy!</p>
              <p style="margin-top: 16px; font-size: 12px;">
                If you have any questions about this payment, please contact us at 
                <a href="mailto:support@americanseekersacademy.com" style="color: #4F46E5;">support@americanseekersacademy.com</a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const textContent = `
Payment Confirmation - American Seekers Academy

Dear ${parentName || 'Parent'},

We have successfully processed your payment. Here are the details:

Payment Details:
- Amount Paid: ${formatCurrency(payment.amount)}
- Payment Date: ${formatDate(payment.createdAt)}
- Transaction ID: ${payment.stripePaymentIntentId}
- Payment Method: ${payment.paymentMethod || 'Card'}

Enrollment Details:
${enrollmentDetails.map(item => `- ${item.childName} - ${item.className}: ${formatCurrency(item.amountPaid)} paid of ${formatCurrency(item.price)}`).join('\n')}

${paymentPlan && paymentPlan !== 'full_payment' ? `
Payment Plan Information:
- Payment Plan: ${paymentPlan}
${nextPaymentDate ? `- Next Payment Date: ${formatDate(nextPaymentDate)}` : ''}
${remainingBalance ? `- Remaining Balance: ${formatCurrency(remainingBalance)}` : ''}
` : ''}

Next Steps:
- Your child's enrollment has been confirmed
- You will receive class details and schedules closer to the start date
- If you have any questions, please contact us at support@americanseekersacademy.com
${nextPaymentDate ? `- Your next payment of ${formatCurrency(remainingBalance || 0)} is due on ${formatDate(nextPaymentDate)}` : ''}

Thank you for choosing American Seekers Academy!

If you have any questions about this payment, please contact us at support@americanseekersacademy.com
    `;

    // Create Brevo email object
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.to = [{ email: parentEmail, name: parentName || 'Parent' }];
    sendSmtpEmail.sender = { email: 'support@americanseekersacademy.com', name: 'American Seekers Academy' };
    sendSmtpEmail.subject = 'Payment Confirmation - American Seekers Academy';
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.textContent = textContent;

    // Send email via Brevo
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    
    console.log('✅ Payment confirmation email sent successfully via Brevo to:', parentEmail);
    console.log('📧 Brevo Message ID:', result.body.messageId);
    return true;
  } catch (error) {
    console.error('❌ Failed to send payment confirmation email via Brevo:', error);
    return false;
  }
}

// Generic email sending function for other use cases
export async function sendEmail(
  to: string,
  toName: string,
  subject: string,
  htmlContent: string,
  textContent?: string
): Promise<boolean> {
  try {
    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.to = [{ email: to, name: toName }];
    sendSmtpEmail.sender = { email: 'support@americanseekersacademy.com', name: 'American Seekers Academy' };
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    if (textContent) {
      sendSmtpEmail.textContent = textContent;
    }

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    
    console.log('✅ Email sent successfully via Brevo to:', to);
    console.log('📧 Brevo Message ID:', result.body.messageId);
    return true;
  } catch (error) {
    console.error('❌ Failed to send email via Brevo:', error);
    return false;
  }
}
