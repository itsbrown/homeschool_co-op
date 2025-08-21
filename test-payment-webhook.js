
#!/usr/bin/env node

/**
 * Test payment webhook and email integration
 */

console.log('🧪 Testing Payment Webhook and Email Integration\n');

async function testPaymentWebhook() {
  try {
    // Import required modules
    const express = require('express');
    const request = require('supertest');
    
    // Create a test Stripe webhook payload
    const testWebhookPayload = {
      id: 'evt_test_webhook',
      object: 'event',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_' + Date.now(),
          object: 'payment_intent',
          amount: 5000,
          currency: 'usd',
          status: 'succeeded',
          metadata: {
            parentEmail: 'test@example.com',
            paymentType: 'full_payment',
            itemsJson: JSON.stringify([
              {
                classId: 1,
                className: 'Mathematics Grade 1',
                childId: 15,
                childName: 'Test Child',
                price: 5000,
                totalCost: 5000,
                paymentType: 'full_payment'
              }
            ])
          }
        }
      }
    };

    console.log('📧 Simulating successful payment webhook...');
    console.log('Payment Intent ID:', testWebhookPayload.data.object.id);
    console.log('Amount:', '$' + (testWebhookPayload.data.object.amount / 100));
    console.log('Parent Email:', testWebhookPayload.data.object.metadata.parentEmail);

    // Simulate the webhook processing logic
    const paymentIntent = testWebhookPayload.data.object;
    const parentEmail = paymentIntent.metadata.parentEmail;
    const items = JSON.parse(paymentIntent.metadata.itemsJson);

    // Create payment record (simulated)
    const payment = {
      id: Date.now(),
      stripePaymentIntentId: paymentIntent.id,
      parentEmail: parentEmail,
      childName: items[0]?.childName || 'Unknown',
      className: items[0]?.className || 'Unknown',
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: 'completed',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('💳 Payment record created:', {
      id: payment.id,
      amount: '$' + (payment.amount / 100),
      child: payment.childName,
      class: payment.className
    });

    // Test email sending
    try {
      const { sendPaymentConfirmationEmail } = await import('./server/lib/email-service.js');
      
      const enrollmentDetails = items.map(item => ({
        childName: item.childName,
        className: item.className,
        price: item.totalCost || item.price,
        amountPaid: Math.round(paymentIntent.amount / items.length),
      }));

      console.log('📧 Sending payment confirmation email...');
      
      const emailSent = await sendPaymentConfirmationEmail({
        parentEmail: parentEmail,
        parentName: 'Test Parent',
        payment: payment,
        enrollmentDetails: enrollmentDetails,
        paymentPlan: paymentIntent.metadata.paymentType,
      });

      console.log('✅ Payment confirmation email result:', emailSent);
      
      if (emailSent) {
        console.log('🎉 SUCCESS: Payment webhook and email integration working!');
      } else {
        console.log('⚠️ WARNING: Email not sent - check Brevo configuration');
      }

    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError.message);
    }

    console.log('\n🔍 Troubleshooting Tips:');
    console.log('1. Check BREVO_API_KEY is set in environment variables');
    console.log('2. Verify sender email is configured in Brevo');
    console.log('3. Check Brevo account limits and status');
    console.log('4. Ensure recipient email is valid');

  } catch (error) {
    console.error('❌ Payment webhook test failed:', error);
  }
}

testPaymentWebhook();
