
import * as brevo from '@getbrevo/brevo';
import type { Payment } from '@shared/schema';

// Initialize Brevo API instance
let apiInstance: brevo.TransactionalEmailsApi | null = null;
if (process.env.BREVO_API_KEY) {
  apiInstance = new brevo.TransactionalEmailsApi();
  apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
  console.log('✅ Brevo initialized for email service');
} else {
  console.warn('⚠️ BREVO_API_KEY not found - email service will not be available');
}

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
    if (!apiInstance) {
      console.log('📧 Brevo not configured, skipping payment confirmation email send');
      return true; // Return true to indicate graceful handling
    }

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
              <p style="margin: 0;"><strong>Payment Method:</strong> Card</p>
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
- Payment Method: Card

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
    sendSmtpEmail.sender = { 
      email: process.env.BREVO_SENDER_EMAIL || 'support@americanseekersacademy.com', 
      name: 'American Seekers Academy' 
    };
    sendSmtpEmail.subject = 'Payment Confirmation - American Seekers Academy';
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.textContent = textContent;

    // Send email via Brevo
    if (!apiInstance) {
      console.log('📧 Brevo not configured, skipping payment confirmation email send');
      return false;
    }

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    
    console.log('✅ Payment confirmation email sent successfully via Brevo to:', parentEmail);
    console.log('📧 Brevo Message ID:', result.body.messageId);
    return true;
  } catch (error: any) {
    // Handle specific Brevo authorization errors gracefully
    if (error.body?.code === 'unauthorized' || error.statusCode === 401) {
      console.log('📧 Brevo authorization issue (IP not whitelisted), skipping email - payment still successful');
    } else {
      console.error('❌ Failed to send payment confirmation email via Brevo:', error.message || error);
    }
    return true; // Return true to indicate payment success despite email failure
  }
}

// Create payment receipt email template in Brevo
export async function createPaymentReceiptTemplate(): Promise<number | null> {
  try {
    if (!apiInstance) {
      console.log('📧 Brevo not configured, cannot create template');
      return null;
    }

    const createSmtpTemplate = new brevo.CreateSmtpTemplate();
    createSmtpTemplate.templateName = 'Payment Receipt - ASA Platform';
    createSmtpTemplate.subject = 'Payment Receipt - {{params.RECEIPT_NUMBER}} - American Seekers Academy';
    createSmtpTemplate.htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4F46E5; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Payment Receipt</h1>
          <p style="color: #E0E7FF; margin: 8px 0 0 0;">American Seekers Academy</p>
        </div>
        
        <div style="padding: 24px;">
          <div style="background-color: #f8f9fa; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="margin: 0 0 16px 0; color: #495057;">Receipt Details</h2>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span><strong>Receipt #:</strong></span>
              <span>{{params.RECEIPT_NUMBER}}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span><strong>Date:</strong></span>
              <span>{{params.PAYMENT_DATE}}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span><strong>Payment Method:</strong></span>
              <span>{{params.PAYMENT_METHOD}}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span><strong>Amount Paid:</strong></span>
              <span style="font-size: 1.2em; font-weight: bold; color: #28a745;">
                {{params.AMOUNT}}
              </span>
            </div>
          </div>

          <div style="margin-bottom: 24px;">
            <h3 style="margin: 0 0 16px 0; color: #495057;">Payment For</h3>
            <div style="background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 8px;">
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background-color: #f8f9fa;">
                    <th style="padding: 12px 8px; text-align: left; border-bottom: 1px solid #dee2e6;">Child</th>
                    <th style="padding: 12px 8px; text-align: left; border-bottom: 1px solid #dee2e6;">Program/Class</th>
                    <th style="padding: 12px 8px; text-align: right; border-bottom: 1px solid #dee2e6;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">{{params.CHILD_NAME}}</td>
                    <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">{{params.CLASS_NAME}}</td>
                    <td style="padding: 12px 8px; border-bottom: 1px solid #eee; text-align: right;">{{params.AMOUNT}}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {{#if params.REMAINING_BALANCE}}
          <div style="margin-bottom: 24px; padding: 16px; background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px;">
            <h3 style="margin: 0 0 12px 0; color: #856404;">Payment Plan Information</h3>
            <p style="margin: 0 0 8px 0;"><strong>Remaining Balance:</strong> {{params.REMAINING_BALANCE}}</p>
            {{#if params.NEXT_PAYMENT_DATE}}
            <p style="margin: 0;"><strong>Next Payment Due:</strong> {{params.NEXT_PAYMENT_DATE}}</p>
            {{/if}}
          </div>
          {{/if}}

          {{#if params.NOTES}}
          <div style="margin-bottom: 24px; padding: 16px; background-color: #e7f3ff; border-radius: 8px;">
            <h3 style="margin: 0 0 12px 0; color: #0c5aa6;">Additional Notes</h3>
            <p style="margin: 0;">{{params.NOTES}}</p>
          </div>
          {{/if}}

          <div style="margin-top: 32px; padding-top: 24px; border-top: 2px solid #eee;">
            <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600;">Thank you for choosing American Seekers Academy!</p>
            <p style="margin: 0 0 8px 0; font-size: 14px;">For questions about this payment, please contact us:</p>
            <p style="margin: 0 0 8px 0; font-size: 14px;">📧 Email: <a href="mailto:support@americanseekersacademy.com" style="color: #4F46E5;">support@americanseekersacademy.com</a></p>
            <p style="margin: 0; font-size: 14px;">📞 Phone: (555) 123-4567</p>
          </div>
        </div>

        <div style="background-color: #f8f9fa; padding: 16px; text-align: center; color: #6c757d; font-size: 12px;">
          <p style="margin: 0;">This is an automated receipt. Please keep this for your records.</p>
          <p style="margin: 8px 0 0 0;">© 2025 American Seekers Academy. All rights reserved.</p>
        </div>
      </body>
    </html>
    `;
    createSmtpTemplate.textContent = `
PAYMENT RECEIPT - AMERICAN SEEKERS ACADEMY

Receipt #: {{params.RECEIPT_NUMBER}}
Date: {{params.PAYMENT_DATE}}
Payment Method: {{params.PAYMENT_METHOD}}
Amount Paid: {{params.AMOUNT}}

PAYMENT FOR:
Child: {{params.CHILD_NAME}}
Program/Class: {{params.CLASS_NAME}}
Amount: {{params.AMOUNT}}

{{#if params.REMAINING_BALANCE}}
PAYMENT PLAN INFORMATION:
Remaining Balance: {{params.REMAINING_BALANCE}}
{{#if params.NEXT_PAYMENT_DATE}}
Next Payment Due: {{params.NEXT_PAYMENT_DATE}}
{{/if}}
{{/if}}

{{#if params.NOTES}}
ADDITIONAL NOTES:
{{params.NOTES}}
{{/if}}

Thank you for choosing American Seekers Academy!

For questions about this payment, please contact us:
Email: support@americanseekersacademy.com
Phone: (555) 123-4567

This is an automated receipt. Please keep this for your records.
© 2025 American Seekers Academy. All rights reserved.
    `;

    // Check if template already exists first
    try {
      const templatesApi = new brevo.TransactionalEmailsApi();
      templatesApi.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY!);
      const templates = await templatesApi.getSmtpTemplates();
      
      const existingTemplate = templates.body.templates?.find(
        template => template.name === 'Payment Receipt - ASA Platform'
      );
      
      if (existingTemplate) {
        console.log('✅ Payment receipt template already exists with ID:', existingTemplate.id);
        return existingTemplate.id;
      }
    } catch (error: any) {
      // Handle authorization errors gracefully
      if (error.body?.code === 'unauthorized' || error.statusCode === 401) {
        console.log('📧 Brevo authorization issue (IP not whitelisted), using fallback - payment still successful');
        return null; // Skip template creation, use fallback
      }
      console.log('📧 Checking existing templates failed, creating new one:', error.message || error);
    }

    const result = await apiInstance.createSmtpTemplate(createSmtpTemplate);
    console.log('✅ Payment receipt template created with ID:', result.body.id);
    return result.body.id;
  } catch (error: any) {
    // Handle authorization errors gracefully
    if (error.body?.code === 'unauthorized' || error.statusCode === 401) {
      console.log('📧 Brevo authorization issue (IP not whitelisted), template creation skipped - payment still successful');
    } else {
      console.error('❌ Failed to create payment receipt template:', error.message || error);
    }
    return null;
  }
}

// Send payment receipt using Brevo template
export async function sendPaymentReceipt(data: {
  parentEmail: string;
  parentName: string;
  receiptNumber: string;
  paymentDate: string;
  paymentMethod: string;
  amount: string;
  childName: string;
  className: string;
  remainingBalance?: string;
  nextPaymentDate?: string;
  notes?: string;
}): Promise<boolean> {
  try {
    if (!apiInstance) {
      console.log('📧 Brevo not configured, skipping payment receipt email send');
      return false;
    }

    // Try to get template ID from environment or create template
    let templateId = process.env.BREVO_PAYMENT_RECEIPT_TEMPLATE_ID ? 
      parseInt(process.env.BREVO_PAYMENT_RECEIPT_TEMPLATE_ID) : null;
    
    if (!templateId) {
      templateId = await createPaymentReceiptTemplate();
      if (!templateId) {
        console.error('❌ Could not create or find payment receipt template');
        return false;
      }
    }

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.to = [{ email: data.parentEmail, name: data.parentName }];
    sendSmtpEmail.sender = { 
      email: process.env.BREVO_SENDER_EMAIL || 'support@americanseekersacademy.com', 
      name: 'American Seekers Academy' 
    };
    sendSmtpEmail.templateId = templateId;
    sendSmtpEmail.params = {
      RECEIPT_NUMBER: data.receiptNumber,
      PAYMENT_DATE: data.paymentDate,
      PAYMENT_METHOD: data.paymentMethod,
      AMOUNT: data.amount,
      CHILD_NAME: data.childName,
      CLASS_NAME: data.className,
      REMAINING_BALANCE: data.remainingBalance || '',
      NEXT_PAYMENT_DATE: data.nextPaymentDate || '',
      NOTES: data.notes || ''
    };

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    
    console.log('✅ Payment receipt email sent successfully to:', data.parentEmail);
    console.log('📧 Brevo Message ID:', result.body.messageId);
    return true;
  } catch (error: any) {
    // Handle specific Brevo authorization errors gracefully
    if (error.body?.code === 'unauthorized' || error.statusCode === 401) {
      console.log('📧 Brevo authorization issue (IP not whitelisted), skipping receipt email - payment still successful');
    } else {
      console.error('❌ Failed to send payment receipt email:', error.message || error);
    }
    return true; // Return true to indicate payment success despite email failure
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
    sendSmtpEmail.sender = { 
      email: process.env.BREVO_SENDER_EMAIL || 'support@americanseekersacademy.com', 
      name: 'American Seekers Academy' 
    };
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    if (textContent) {
      sendSmtpEmail.textContent = textContent;
    }

    if (!apiInstance) {
      console.log('📧 Brevo not configured, skipping email send');
      return false;
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
