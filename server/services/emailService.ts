import nodemailer from "nodemailer";

// Configure transporter based on environment
const getTransporter = () => {
  // In production, use Amazon SES
  if (process.env.NODE_ENV === "production") {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "email-smtp.us-east-1.amazonaws.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.AWS_ACCESS_KEY_ID || process.env.EMAIL_USER || "",
        pass: process.env.AWS_SECRET_ACCESS_KEY || process.env.EMAIL_PASS || "",
      },
    });
  }
  
  // In development, use Ethereal (fake SMTP service)
  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user: "ethereal.user@ethereal.email",
      pass: "ethereal_pass",
    },
  });
};

const transporter = getTransporter();

const fromAddress = process.env.EMAIL_FROM || "no-reply@learnsphere.com";

export async function sendWelcomeEmail(email: string, name: string) {
  try {
    const result = await transporter.sendMail({
      from: `LearnSphere <${fromAddress}>`,
      to: email,
      subject: "Welcome to LearnSphere!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e3a8a; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Welcome to LearnSphere!</h1>
          </div>
          <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
            <p>Hello ${name},</p>
            <p>Thank you for joining LearnSphere! We're excited to have you as part of our community.</p>
            <p>With LearnSphere, you can:</p>
            <ul>
              <li>Create personalized curriculum with AI assistance</li>
              <li>Generate adaptive lessons for your students</li>
              <li>Access our knowledge marketplace</li>
              <li>Get help from our AI-powered virtual tutor</li>
            </ul>
            <p>To get started, simply <a href="${process.env.APP_URL || "https://learnsphere.com"}/login" style="color: #1e3a8a;">log in to your account</a>.</p>
            <p>If you have any questions, feel free to reply to this email or contact our support team.</p>
            <p>Best regards,<br>The LearnSphere Team</p>
          </div>
        </div>
      `,
    });
    
    console.log("Welcome email sent:", result.messageId);
    return result;
  } catch (error) {
    console.error("Error sending welcome email:", error);
    throw error;
  }
}

export async function sendVerificationEmail(email: string, token: string) {
  try {
    const verificationUrl = `${process.env.APP_URL || "https://learnsphere.com"}/verify?token=${token}`;
    
    const result = await transporter.sendMail({
      from: `LearnSphere <${fromAddress}>`,
      to: email,
      subject: "Verify Your Email Address",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e3a8a; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Verify Your Email</h1>
          </div>
          <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
            <p>Hello,</p>
            <p>Please verify your email address to complete your LearnSphere registration.</p>
            <p style="text-align: center;">
              <a href="${verificationUrl}" style="display: inline-block; background-color: #1e3a8a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
            </p>
            <p>If you didn't create an account with us, you can safely ignore this email.</p>
            <p>Best regards,<br>The LearnSphere Team</p>
          </div>
        </div>
      `,
    });
    
    console.log("Verification email sent:", result.messageId);
    return result;
  } catch (error) {
    console.error("Error sending verification email:", error);
    throw error;
  }
}

export async function sendPasswordResetEmail(email: string, token: string) {
  try {
    const resetUrl = `${process.env.APP_URL || "https://learnsphere.com"}/reset-password?token=${token}`;
    
    const result = await transporter.sendMail({
      from: `LearnSphere <${fromAddress}>`,
      to: email,
      subject: "Reset Your Password",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e3a8a; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Reset Your Password</h1>
          </div>
          <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
            <p>Hello,</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <p style="text-align: center;">
              <a href="${resetUrl}" style="display: inline-block; background-color: #1e3a8a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
            </p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request a password reset, you can safely ignore this email.</p>
            <p>Best regards,<br>The LearnSphere Team</p>
          </div>
        </div>
      `,
    });
    
    console.log("Password reset email sent:", result.messageId);
    return result;
  } catch (error) {
    console.error("Error sending password reset email:", error);
    throw error;
  }
}
