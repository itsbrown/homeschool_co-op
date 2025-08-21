
import * as brevo from '@getbrevo/brevo';

// Initialize Brevo API instance  
let brevoApiInstance: brevo.TransactionalEmailsApi | null = null;

// Initialize Brevo if API key is available
if (process.env.BREVO_API_KEY) {
  brevoApiInstance = new brevo.TransactionalEmailsApi();
  brevoApiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
  console.log('✅ Brevo initialized for email service');
} else {
  console.log('⚠️ Brevo API key not found, email functionality will be limited');
}

export async function sendWelcomeEmail(email: string, name: string) {
  try {
    if (!brevoApiInstance) {
      console.log('📧 Brevo not configured, skipping welcome email');
      return false;
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4F46E5; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Welcome to American Seekers Academy!</h1>
        </div>
        <div style="padding: 24px;">
          <p>Dear ${name},</p>
          <p>Welcome to American Seekers Academy! We're excited to have you join our learning community.</p>
          <p>Best regards,<br>The American Seekers Academy Team</p>
        </div>
      </div>
    `;

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.subject = "Welcome to American Seekers Academy";
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = { 
      name: "American Seekers Academy", 
      email: "noreply@americanseekersacademy.com" 
    };
    sendSmtpEmail.to = [{ email, name }];

    const result = await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Welcome email sent successfully via Brevo to: ${email}`);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to send welcome email via Brevo:', error);
    return false;
  }
}

export async function sendVerificationEmail(email: string, token: string) {
  try {
    if (!brevoApiInstance) {
      console.log('📧 Brevo not configured, skipping verification email');
      return false;
    }

    const verificationUrl = `${process.env.CLIENT_URL || 'http://localhost:5000'}/verify-email?token=${token}`;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4F46E5; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Email Verification</h1>
          <p style="color: #E0E7FF; margin: 8px 0 0 0;">American Seekers Academy</p>
        </div>
        <div style="padding: 24px;">
          <p>Please click the button below to verify your email address:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="display: inline-block; background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Verify Email
            </a>
          </div>
          <p style="color: #6B7280; font-size: 14px;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${verificationUrl}" style="color: #4F46E5; word-break: break-all;">${verificationUrl}</a>
          </p>
        </div>
      </div>
    `;

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.subject = "Verify Your Email - American Seekers Academy";
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = { 
      name: "American Seekers Academy", 
      email: "noreply@americanseekersacademy.com" 
    };
    sendSmtpEmail.to = [{ email, name: email }];

    const result = await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Verification email sent successfully via Brevo to: ${email}`);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to send verification email via Brevo:', error);
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  try {
    if (!brevoApiInstance) {
      console.log('📧 Brevo not configured, skipping password reset email');
      return false;
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #059669; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Password Reset Request</h1>
          <p style="color: #A7F3D0; margin: 8px 0 0 0;">American Seekers Academy</p>
        </div>

        <div style="padding: 24px;">
          <h2 style="color: #1F2937;">Reset Your Password</h2>

          <p>We received a request to reset your password for your American Seekers Academy account.</p>

          <div style="background-color: #FEF3C7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B;">
            <p style="margin: 0; color: #92400E;">
              <strong>Click the button below to reset your password:</strong>
            </p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="display: inline-block; background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Reset Password
            </a>
          </div>

          <p style="color: #6B7280; font-size: 14px;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${resetUrl}" style="color: #059669; word-break: break-all;">${resetUrl}</a>
          </p>

          <div style="background-color: #FEE2E2; padding: 16px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #DC2626;">
            <p style="margin: 0; color: #991B1B; font-size: 14px;">
              <strong>Security Notice:</strong> This link will expire in 24 hours. If you didn't request this password reset, please ignore this email.
            </p>
          </div>

          <p style="color: #6B7280; font-size: 14px; margin-top: 20px;">
            Best regards,<br>
            The American Seekers Academy Team
          </p>
        </div>

        <div style="background-color: #F3F4F6; padding: 16px; text-align: center; font-size: 12px; color: #6B7280;">
          <p style="margin: 0;">© 2025 American Seekers Academy. All rights reserved.</p>
        </div>
      </div>
    `;

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.subject = "Reset Your Password - American Seekers Academy";
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = { 
      name: "American Seekers Academy", 
      email: "noreply@americanseekersacademy.com" 
    };
    sendSmtpEmail.to = [{ email, name: email }];

    const result = await brevoApiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`✅ Password reset email sent successfully via Brevo to: ${email}`);
    console.log(`📧 Brevo Message ID: ${result.response.headers['message-id']}`);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to send password reset email via Brevo:', error);
    return false;
  }
}

// New Brevo-style functions
export async function sendStaffInvitationEmail(email: string, firstName: string, lastName: string, role: string, department: string, message?: string) {
  console.log(`[MOCK EMAIL] Staff invitation would be sent via Brevo to: ${email}`);
  console.log(`[MOCK EMAIL] Staff details: ${firstName} ${lastName}, Role: ${role}, Department: ${department}`);
  if (message) console.log(`[MOCK EMAIL] Personal message: ${message}`);
  
  return {
    messageId: `mock-brevo-staff-${Date.now()}`,
    response: 'Mock Brevo email service'
  };
}

export async function sendRoleInvitationEmail(email: string, role: string, token: string) {
  console.log(`[MOCK EMAIL] Role invitation would be sent via Brevo to: ${email}`);
  console.log(`[MOCK EMAIL] Role: ${role}, Token: ${token}`);
  
  return {
    messageId: `mock-brevo-role-${Date.now()}`,
    response: 'Mock Brevo email service'
  };
}
