import { db } from './server/db.js';
import { users, membershipEnrollments, schools } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function checkUser() {
  const email = 'lhumphrey87@gmail.com';
  const stripeCustomerId = 'cus_T1adGJanRMBT7m';
  const stripeSubscriptionId = 'sub_1S5XhBGhVuNOnUs7g4x2gBoN';
  
  console.log('\n🔍 Checking database for:', email);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    // Check if user exists
    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
    
    if (user.length === 0) {
      console.log('❌ User NOT found in database');
      console.log('\n📋 Next Steps:');
      console.log('   1. User needs to be created in the system');
      console.log('   2. Then link Stripe customer ID to user record');
      console.log('   3. Then create membership enrollment');
      return;
    }
    
    console.log('✅ User found in database:');
    console.log(`   ID: ${user[0].id}`);
    console.log(`   Name: ${user[0].name}`);
    console.log(`   Email: ${user[0].email}`);
    console.log(`   Role: ${user[0].role}`);
    console.log(`   School ID: ${user[0].schoolId || 'Not assigned'}`);
    console.log(`   Stripe Customer ID: ${user[0].stripeCustomerId || 'NOT SET ⚠️'}`);
    
    // Check for memberships
    const memberships = await db.select({
      id: membershipEnrollments.id,
      schoolId: membershipEnrollments.schoolId,
      amount: membershipEnrollments.amount,
      amountPaid: membershipEnrollments.amountPaid,
      status: membershipEnrollments.status,
      membershipYear: membershipEnrollments.membershipYear,
      membershipTier: membershipEnrollments.membershipTier,
      stripeSubscriptionId: membershipEnrollments.stripeSubscriptionId,
      stripeCustomerId: membershipEnrollments.stripeCustomerId,
      schoolName: schools.name
    })
    .from(membershipEnrollments)
    .leftJoin(schools, eq(membershipEnrollments.schoolId, schools.id))
    .where(eq(membershipEnrollments.parentUserId, user[0].id));
    
    console.log(`\n📋 Membership Enrollments: ${memberships.length}`);
    
    if (memberships.length === 0) {
      console.log('   No memberships found');
      console.log('\n📋 Next Steps:');
      console.log('   1. Update user.stripeCustomerId =', stripeCustomerId);
      console.log('   2. Create membership enrollment with:');
      console.log('      - amount: 17500 (cents)');
      console.log('      - stripeSubscriptionId:', stripeSubscriptionId);
      console.log('      - stripeCustomerId:', stripeCustomerId);
      console.log('      - status: active');
    } else {
      memberships.forEach((membership, idx) => {
        console.log(`\n   Membership ${idx + 1}:`);
        console.log(`     School: ${membership.schoolName}`);
        console.log(`     Year: ${membership.membershipYear}`);
        console.log(`     Tier: ${membership.membershipTier}`);
        console.log(`     Amount: $${(membership.amount / 100).toFixed(2)}`);
        console.log(`     Paid: $${(membership.amountPaid / 100).toFixed(2)}`);
        console.log(`     Status: ${membership.status}`);
        console.log(`     Stripe Subscription: ${membership.stripeSubscriptionId || 'NOT SET ⚠️'}`);
        console.log(`     Stripe Customer: ${membership.stripeCustomerId || 'NOT SET ⚠️'}`);
        
        // Check if Stripe IDs match
        if (membership.stripeCustomerId !== stripeCustomerId) {
          console.log(`     ⚠️ Stripe Customer ID mismatch!`);
          console.log(`        Database: ${membership.stripeCustomerId}`);
          console.log(`        Stripe: ${stripeCustomerId}`);
        }
        
        if (membership.stripeSubscriptionId !== stripeSubscriptionId) {
          console.log(`     ⚠️ Stripe Subscription ID mismatch!`);
          console.log(`        Database: ${membership.stripeSubscriptionId}`);
          console.log(`        Stripe: ${stripeSubscriptionId}`);
        }
      });
    }
    
    console.log('\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkUser();
