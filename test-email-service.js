
#!/usr/bin/env node

/**
 * Test email service functionality
 */

console.log('🧪 Testing Email Service Functionality\n');

async function testEmailService() {
  try {
    // Import required modules
    const { sendPaymentConfirmationEmail } = await import('./server/lib/email-service.js');
    const { sendPasswordResetEmail } = await import('./server/services/emailService.js');

    console.log('📧 Testing Payment Confirmation Email...');

    // Test payment confirmation email
    const testPaymentData = {
      parentEmail: 'test@example.com',
      parentName: 'Test Parent',
      payment: {
        id: 'test_payment_123',
        stripePaymentIntentId: 'pi_test_123',
        amount: 5000, // $50.00 in cents
        currency: 'usd',
        status: 'completed',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      enrollmentDetails: [
        {
          childName: 'Test Child',
          className: 'Mathematics Grade 1',
          price: 5000,
          amountPaid: 5000
        }
      ],
      paymentPlan: 'full_payment'
    };

    const paymentEmailResult = await sendPaymentConfirmationEmail(testPaymentData);
    console.log('✅ Payment confirmation email test result:', paymentEmailResult);

    console.log('\n📧 Testing Password Reset Email...');

    // Test password reset email
    const resetUrl = 'https://example.com/reset-password?token=test123';
    const resetEmailResult = await sendPasswordResetEmail('test@example.com', resetUrl);
    console.log('✅ Password reset email test result:', resetEmailResult);

    console.log('\n🎉 Email service tests completed!');

    // Check environment variables
    console.log('\n🔑 Environment Check:');
    console.log('BREVO_API_KEY configured:', !!process.env.BREVO_API_KEY);
    console.log('CLIENT_URL:', process.env.CLIENT_URL || 'Not set');

  } catch (error) {
    console.error('❌ Email service test failed:', error);
  }
}

testEmailService();
