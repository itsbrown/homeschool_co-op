import sgMail from '@sendgrid/mail';

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('✅ SendGrid initialized for email service');
} else {
  console.warn('⚠️ SENDGRID_API_KEY not found - SendGrid email service will not be available');
}

interface AccountInviteData {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  temporaryPassword: string;
}

interface PasswordResetData {
  email: string;
  firstName: string;
  resetToken: string;
}

export async function sendAccountInviteEmail(data: AccountInviteData): Promise<boolean> {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.log('📧 SendGrid not configured, skipping account invite email');
      return false;
    }

    const { email, firstName, lastName, role, temporaryPassword } = data;
    const loginUrl = `${process.env.CLIENT_URL || window.location.origin}/login`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #059669; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Account Created Successfully!</h1>
          <p style="color: #A7F3D0; margin: 8px 0 0 0;">American Seekers Academy</p>
        </div>

        <div style="padding: 24px;">
          <h2 style="color: #1F2937;">Welcome to the Team, ${firstName}!</h2>

          <p>Your account has been created and you can now access the ASA Platform.</p>

          <div style="background-color: #FEF3C7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B;">
            <h3 style="margin: 0 0 12px 0; color: #92400E;">Your Login Credentials</h3>
            <p style="margin: 8px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 8px 0;"><strong>Temporary Password:</strong> <code style="background: #FFF; padding: 4px 8px; font-size: 14px; border-radius: 4px;">${temporaryPassword}</code></p>
            <p style="margin: 8px 0;"><strong>Role:</strong> ${role}</p>
          </div>

          <div style="background-color: #FEE2E2; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #DC2626;"><strong>Important:</strong> You will be required to change this password when you first log in for security reasons.</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" 
               style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
               Login to Your Account
            </a>
          </div>

          <p style="font-size: 14px; color: #6B7280;">
            If you have any questions or need assistance, please contact us at support@americanseekersacademy.com
          </p>
        </div>
      </div>
    `;

    const textContent = `
Welcome to the Team, ${firstName}!

Your account has been created and you can now access the ASA Platform.

Your Login Credentials:
Email: ${email}
Temporary Password: ${temporaryPassword}
Role: ${role}

Important: You will be required to change this password when you first log in for security reasons.

Login at: ${loginUrl}

If you have any questions or need assistance, please contact us at support@americanseekersacademy.com
    `;

    const msg = {
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'support@americanseekersacademy.com',
        name: 'American Seekers Academy'
      },
      subject: `Welcome to ASA Platform - Your ${role} Account is Ready!`,
      html: htmlContent,
      text: textContent,
    };

    await sgMail.send(msg);
    console.log(`✅ Account invite email sent successfully to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending account invite email:', error);
    return false;
  }
}

export async function sendPasswordResetEmail(data: PasswordResetData): Promise<boolean> {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.log('📧 SendGrid not configured, skipping password reset email');
      return false;
    }

    const { email, firstName, resetToken } = data;
    const resetUrl = `${process.env.CLIENT_URL || window.location.origin}/reset-password?token=${resetToken}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #DC2626; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Password Reset Request</h1>
          <p style="color: #FCA5A5; margin: 8px 0 0 0;">American Seekers Academy</p>
        </div>

        <div style="padding: 24px;">
          <h2 style="color: #1F2937;">Hello ${firstName},</h2>

          <p>We received a request to reset your password for your ASA Platform account.</p>

          <p>If you made this request, click the button below to reset your password:</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
               Reset Your Password
            </a>
          </div>

          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666; font-size: 14px;">${resetUrl}</p>

          <div style="background-color: #FEF3C7; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B;">
            <p style="margin: 0; color: #92400E;"><strong>Security Note:</strong> This password reset link will expire in 24 hours for your security.</p>
          </div>

          <p>If you didn't request this password reset, please ignore this email. Your account remains secure.</p>

          <p style="font-size: 14px; color: #6B7280;">
            If you have any questions or need assistance, please contact us at support@americanseekersacademy.com
          </p>
        </div>
      </div>
    `;

    const textContent = `
Hello ${firstName},

We received a request to reset your password for your ASA Platform account.

If you made this request, visit this link to reset your password:
${resetUrl}

Security Note: This password reset link will expire in 24 hours for your security.

If you didn't request this password reset, please ignore this email. Your account remains secure.

If you have any questions or need assistance, please contact us at support@americanseekersacademy.com
    `;

    const msg = {
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'support@americanseekersacademy.com',
        name: 'American Seekers Academy'
      },
      subject: 'Password Reset Request - ASA Platform',
      html: htmlContent,
      text: textContent,
    };

    await sgMail.send(msg);
    console.log(`✅ Password reset email sent successfully to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    return false;
  }
}