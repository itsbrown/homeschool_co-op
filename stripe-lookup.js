const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function lookupCustomer(email) {
  console.log(`🔍 Searching for customer with email: ${email}\n`);
  
  try {
    // Search for customer by email
    const customers = await stripe.customers.search({
      query: `email:'${email}'`
    });
    
    if (customers.data.length === 0) {
      console.log('❌ No customer found with that email in Stripe');
      return;
    }
    
    console.log(`✅ Found ${customers.data.length} customer(s):\n`);
    
    for (const customer of customers.data) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Customer ID: ${customer.id}`);
      console.log(`Email: ${customer.email}`);
      console.log(`Name: ${customer.name || 'Not set'}`);
      console.log(`Created: ${new Date(customer.created * 1000).toLocaleDateString()}`);
      console.log(`Default Payment Method: ${customer.invoice_settings?.default_payment_method || 'None'}`);
      if (customer.metadata && Object.keys(customer.metadata).length > 0) {
        console.log(`Customer Metadata:`, JSON.stringify(customer.metadata, null, 2));
      }
      
      // Get active subscriptions
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'all'
      });
      
      console.log(`\n📋 Subscriptions (${subscriptions.data.length}):`);
      
      if (subscriptions.data.length === 0) {
        console.log('  No subscriptions found');
      } else {
        subscriptions.data.forEach((sub, idx) => {
          console.log(`\n  Subscription ${idx + 1}:`);
          console.log(`    ID: ${sub.id}`);
          console.log(`    Status: ${sub.status}`);
          console.log(`    Amount: $${(sub.items.data[0]?.price?.unit_amount / 100).toFixed(2)} ${sub.items.data[0]?.price?.currency?.toUpperCase()}`);
          console.log(`    Interval: ${sub.items.data[0]?.price?.recurring?.interval}`);
          console.log(`    Current Period: ${new Date(sub.current_period_start * 1000).toLocaleDateString()} - ${new Date(sub.current_period_end * 1000).toLocaleDateString()}`);
          console.log(`    Next Billing Date: ${sub.current_period_end ? new Date(sub.current_period_end * 1000).toLocaleDateString() : 'N/A'}`);
          console.log(`    Cancel At Period End: ${sub.cancel_at_period_end}`);
          if (sub.canceled_at) {
            console.log(`    Canceled At: ${new Date(sub.canceled_at * 1000).toLocaleDateString()}`);
          }
          if (sub.metadata && Object.keys(sub.metadata).length > 0) {
            console.log(`    Subscription Metadata:`, JSON.stringify(sub.metadata, null, 2));
          }
        });
      }
      
      // Get payment methods
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customer.id,
        type: 'card'
      });
      
      console.log(`\n💳 Payment Methods (${paymentMethods.data.length}):`);
      if (paymentMethods.data.length === 0) {
        console.log('  No payment methods found');
      } else {
        paymentMethods.data.forEach((pm, idx) => {
          console.log(`  ${idx + 1}. ${pm.card.brand.toUpperCase()} ending in ${pm.card.last4} (exp: ${pm.card.exp_month}/${pm.card.exp_year})`);
        });
      }
      
      // Get recent charges
      const charges = await stripe.charges.list({
        customer: customer.id,
        limit: 5
      });
      
      console.log(`\n💰 Recent Charges (last 5):`);
      if (charges.data.length === 0) {
        console.log('  No charges found');
      } else {
        charges.data.forEach((charge, idx) => {
          console.log(`  ${idx + 1}. $${(charge.amount / 100).toFixed(2)} - ${charge.status} - ${new Date(charge.created * 1000).toLocaleDateString()}`);
        });
      }
      
      console.log('\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.type === 'StripeInvalidRequestError') {
      console.error('   This might be a permissions issue with your Stripe API key');
    }
  }
}

lookupCustomer('lhumphrey87@gmail.com');
