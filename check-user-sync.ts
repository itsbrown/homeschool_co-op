import { storage } from './server/storage/index';

async function checkUser() {
  const email = 'lhumphrey87@gmail.com';
  const stripeCustomerId = 'cus_T1adGJanRMBT7m';
  const stripeSubscriptionId = 'sub_1S5XhBGhVuNOnUs7g4x2gBoN';
  
  console.log('\n🔍 Checking database for:', email);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    // Check if user exists
    const user = await storage.getUserByEmail(email);
    
    if (!user) {
      console.log('❌ User NOT found in database');
      console.log('\n📋 Next Steps:');
      console.log('   1. User needs to be created in the system');
      console.log('   2. Then link Stripe customer ID to user record');
      console.log('   3. Then create membership enrollment');
      process.exit(0);
    }
    
    console.log('✅ User found in database:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   School ID: ${user.schoolId || 'Not assigned'}`);
    console.log(`   Stripe Customer ID: ${user.stripeCustomerId || 'NOT SET ⚠️'}`);
    
    // Check for memberships
    const memberships = await storage.getMembershipEnrollmentsByParentId(user.id);
    
    console.log(`\n📋 Membership Enrollments: ${memberships.length}`);
    
    if (memberships.length === 0) {
      console.log('   No memberships found');
      console.log('\n📋 Sync Plan:');
      console.log('   1. Update user.stripeCustomerId =', stripeCustomerId);
      console.log('   2. Create membership enrollment with:');
      console.log('      - parentUserId:', user.id);
      console.log('      - schoolId:', user.schoolId || '[NEED TO SET]');
      console.log('      - amount: 17500 (cents)');
      console.log('      - amountPaid: 17500 (fully paid)');
      console.log('      - remainingBalance: 0');
      console.log('      - stripeSubscriptionId:', stripeSubscriptionId);
      console.log('      - stripeCustomerId:', stripeCustomerId);
      console.log('      - status: active');
      console.log('      - membershipTier: basic');
      console.log('      - membershipYear: 2025-2026');
    } else {
      for (const membership of memberships) {
        const school = membership.schoolId ? await storage.getSchool(membership.schoolId) : null;
        
        console.log(`\n   Membership:`);
        console.log(`     School: ${school?.name || 'Unknown'}`);
        console.log(`     Year: ${membership.membershipYear}`);
        console.log(`     Tier: ${membership.membershipTier}`);
        console.log(`     Amount: $${(membership.amount / 100).toFixed(2)}`);
        console.log(`     Paid: $${(membership.amountPaid / 100).toFixed(2)}`);
        console.log(`     Status: ${membership.status}`);
        console.log(`     Stripe Subscription: ${membership.stripeSubscriptionId || 'NOT SET ⚠️'}`);
        console.log(`     Stripe Customer: ${membership.stripeCustomerId || 'NOT SET ⚠️'}`);
        
        // Check if Stripe IDs match
        if (membership.stripeCustomerId && membership.stripeCustomerId !== stripeCustomerId) {
          console.log(`     ⚠️ Stripe Customer ID mismatch!`);
          console.log(`        Database: ${membership.stripeCustomerId}`);
          console.log(`        Stripe: ${stripeCustomerId}`);
        }
        
        if (!membership.stripeSubscriptionId || membership.stripeSubscriptionId !== stripeSubscriptionId) {
          console.log(`     🔄 Need to update Stripe Subscription ID`);
          console.log(`        Current: ${membership.stripeSubscriptionId || 'null'}`);
          console.log(`        Should be: ${stripeSubscriptionId}`);
        }
      }
    }
    
    console.log('\n');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

checkUser();
