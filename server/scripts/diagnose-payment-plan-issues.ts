/**
 * Diagnostic Script: Find all users with potential payment plan issues
 * Run with: npx tsx server/scripts/diagnose-payment-plan-issues.ts
 * 
 * This script identifies:
 * 1. Balance mismatches - scheduled payments don't match remaining balance
 * 2. Orphaned payments - scheduled payments without valid enrollments
 * 3. Missing Stripe IDs - payment plans without Stripe subscription
 * 4. Stale pending payments - past due dates but not processed
 * 5. Zero/negative amounts - invalid payment amounts
 */

import { getDb } from '../db';
import { 
  users, 
  children, 
  programEnrollments,
  scheduledPayments, 
  membershipEnrollments
} from '../../shared/schema';
import { eq } from 'drizzle-orm';

interface PaymentIssue {
  userId: number;
  userEmail: string;
  userName: string | null;
  issueType: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  details: string;
  affectedAmount: number;
}

async function diagnoseAllPaymentPlans() {
  const db = await getDb();
  const issues: PaymentIssue[] = [];
  const today = new Date();
  
  console.log('🔍 Starting Payment Plan Diagnostic...\n');
  console.log(`📅 Current Date: ${today.toISOString().split('T')[0]}\n`);
  console.log('='.repeat(80));
  
  // 1. Find all users with scheduled payments
  const allScheduledPayments = await db.select().from(scheduledPayments);
  const uniqueEmails = [...new Set(allScheduledPayments.map(sp => sp.parentEmail))];
  
  console.log(`\n📊 Found ${allScheduledPayments.length} scheduled payments for ${uniqueEmails.length} unique users\n`);
  
  for (const email of uniqueEmails) {
    if (!email) continue;
    
    // Get user info
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      issues.push({
        userId: 0,
        userEmail: email,
        userName: null,
        issueType: 'ORPHANED_USER',
        severity: 'HIGH',
        details: `Scheduled payments exist for email "${email}" but no user record found`,
        affectedAmount: 0
      });
      continue;
    }
    
    // Get user's scheduled payments
    const userScheduledPayments = allScheduledPayments.filter(sp => sp.parentEmail === email);
    
    // Get user's enrollments from programEnrollments (what scheduledPayments references)
    const userEnrollments = await db.select().from(programEnrollments)
      .where(eq(programEnrollments.parentEmail, email));
    
    // Get user's membership enrollments
    const userMemberships = await db.select().from(membershipEnrollments)
      .where(eq(membershipEnrollments.parentUserId, user.id));
    
    // CHECK 1: Stale pending payments (past due date, still pending)
    const stalePendingPayments = userScheduledPayments.filter(sp => {
      const scheduledDate = new Date(sp.scheduledDate);
      return sp.status === 'pending' && scheduledDate < today;
    });
    
    if (stalePendingPayments.length > 0) {
      const totalStaleAmount = stalePendingPayments.reduce((sum, sp) => sum + (sp.amount || 0), 0);
      issues.push({
        userId: user.id,
        userEmail: email,
        userName: user.name || user.username,
        issueType: 'STALE_PENDING_PAYMENTS',
        severity: 'HIGH',
        details: `${stalePendingPayments.length} payment(s) past due date but still pending. Oldest: ${stalePendingPayments[0].scheduledDate}`,
        affectedAmount: totalStaleAmount
      });
    }
    
    // CHECK 2: Zero or negative payment amounts
    const invalidAmountPayments = userScheduledPayments.filter(sp => 
      sp.status === 'pending' && (sp.amount === null || sp.amount === undefined || sp.amount <= 0)
    );
    
    if (invalidAmountPayments.length > 0) {
      issues.push({
        userId: user.id,
        userEmail: email,
        userName: user.name || user.username,
        issueType: 'INVALID_PAYMENT_AMOUNT',
        severity: 'HIGH',
        details: `${invalidAmountPayments.length} scheduled payment(s) with zero or invalid amounts`,
        affectedAmount: 0
      });
    }
    
    // CHECK 3: Orphaned scheduled payments (no matching enrollment)
    for (const sp of userScheduledPayments) {
      if (sp.enrollmentId) {
        const matchingEnrollment = userEnrollments.find(e => e.id === sp.enrollmentId);
        if (!matchingEnrollment) {
          issues.push({
            userId: user.id,
            userEmail: email,
            userName: user.name || user.username,
            issueType: 'ORPHANED_SCHEDULED_PAYMENT',
            severity: 'MEDIUM',
            details: `Scheduled payment ID ${sp.id} references enrollment ID ${sp.enrollmentId} which doesn't exist for this user`,
            affectedAmount: sp.amount || 0
          });
        }
      }
    }
    
    // CHECK 4: Enrollments with remaining balance but no pending scheduled payments
    for (const enrollment of userEnrollments) {
      if (enrollment.remainingBalance && enrollment.remainingBalance > 0) {
        const pendingPaymentsForEnrollment = userScheduledPayments.filter(
          sp => sp.enrollmentId === enrollment.id && sp.status === 'pending'
        );
        
        if (pendingPaymentsForEnrollment.length === 0 && enrollment.paymentStatus === 'payment_plan') {
          issues.push({
            userId: user.id,
            userEmail: email,
            userName: user.name || user.username,
            issueType: 'MISSING_SCHEDULED_PAYMENTS',
            severity: 'HIGH',
            details: `Enrollment ID ${enrollment.id} (${enrollment.childName}) has $${(enrollment.remainingBalance/100).toFixed(2)} remaining but no pending scheduled payments`,
            affectedAmount: enrollment.remainingBalance
          });
        }
        
        // CHECK 5: Scheduled payment total doesn't match remaining balance
        const totalScheduledPending = pendingPaymentsForEnrollment.reduce((sum, sp) => sum + (sp.amount || 0), 0);
        const balanceDifference = Math.abs(totalScheduledPending - enrollment.remainingBalance);
        
        if (balanceDifference > 100 && pendingPaymentsForEnrollment.length > 0) { // More than $1 difference
          issues.push({
            userId: user.id,
            userEmail: email,
            userName: user.name || user.username,
            issueType: 'BALANCE_MISMATCH',
            severity: 'MEDIUM',
            details: `Enrollment ID ${enrollment.id}: Remaining balance ($${(enrollment.remainingBalance/100).toFixed(2)}) doesn't match scheduled payments total ($${(totalScheduledPending/100).toFixed(2)}). Difference: $${(balanceDifference/100).toFixed(2)}`,
            affectedAmount: balanceDifference
          });
        }
      }
    }
    
    // CHECK 6: Membership balance issues (simplified - check if any memberships have remaining balance)
    for (const membership of userMemberships) {
      if (membership.remainingBalance && membership.remainingBalance > 0 && membership.status === 'active') {
        issues.push({
          userId: user.id,
          userEmail: email,
          userName: user.name || user.username,
          issueType: 'MEMBERSHIP_WITH_REMAINING_BALANCE',
          severity: 'MEDIUM',
          details: `Membership ID ${membership.id} has $${(membership.remainingBalance/100).toFixed(2)} remaining balance`,
          affectedAmount: membership.remainingBalance
        });
      }
    }
    
    // CHECK 7: User has payment plan enrollments but no Stripe customer ID
    const paymentPlanEnrollments = userEnrollments.filter(e => e.paymentStatus === 'payment_plan');
    if (paymentPlanEnrollments.length > 0 && !user.stripeCustomerId) {
      const totalRemaining = paymentPlanEnrollments.reduce((sum, e) => sum + (e.remainingBalance || 0), 0);
      issues.push({
        userId: user.id,
        userEmail: email,
        userName: user.name || user.username,
        issueType: 'MISSING_STRIPE_CUSTOMER',
        severity: 'HIGH',
        details: `User has ${paymentPlanEnrollments.length} payment plan enrollment(s) but no Stripe customer ID`,
        affectedAmount: totalRemaining
      });
    }
  }
  
  // Sort issues by severity and amount
  const severityOrder = { 'HIGH': 0, 'MEDIUM': 1, 'LOW': 2 };
  issues.sort((a, b) => {
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return b.affectedAmount - a.affectedAmount;
  });
  
  // Print report
  console.log('\n' + '='.repeat(80));
  console.log('📋 PAYMENT PLAN DIAGNOSTIC REPORT');
  console.log('='.repeat(80));
  
  if (issues.length === 0) {
    console.log('\n✅ No payment plan issues found!\n');
  } else {
    console.log(`\n⚠️  Found ${issues.length} potential issue(s)\n`);
    
    // Group by user
    const issuesByUser = issues.reduce((acc, issue) => {
      const key = issue.userEmail;
      if (!acc[key]) acc[key] = [];
      acc[key].push(issue);
      return acc;
    }, {} as Record<string, PaymentIssue[]>);
    
    // Summary by issue type
    const issueTypeCounts = issues.reduce((acc, issue) => {
      acc[issue.issueType] = (acc[issue.issueType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('📊 SUMMARY BY ISSUE TYPE:');
    console.log('-'.repeat(40));
    for (const [type, count] of Object.entries(issueTypeCounts)) {
      console.log(`   ${type}: ${count}`);
    }
    
    console.log('\n📊 SUMMARY BY SEVERITY:');
    console.log('-'.repeat(40));
    console.log(`   HIGH: ${issues.filter(i => i.severity === 'HIGH').length}`);
    console.log(`   MEDIUM: ${issues.filter(i => i.severity === 'MEDIUM').length}`);
    console.log(`   LOW: ${issues.filter(i => i.severity === 'LOW').length}`);
    
    const totalAffectedAmount = issues.reduce((sum, i) => sum + i.affectedAmount, 0);
    console.log(`\n💰 TOTAL AFFECTED AMOUNT: $${(totalAffectedAmount/100).toFixed(2)}`);
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 DETAILED ISSUES BY USER:');
    console.log('='.repeat(80));
    
    for (const [email, userIssues] of Object.entries(issuesByUser)) {
      const firstIssue = userIssues[0];
      console.log(`\n👤 ${firstIssue.userName || 'Unknown'} (${email})`);
      console.log(`   User ID: ${firstIssue.userId}`);
      console.log('-'.repeat(60));
      
      for (const issue of userIssues) {
        const severityEmoji = issue.severity === 'HIGH' ? '🔴' : issue.severity === 'MEDIUM' ? '🟡' : '🟢';
        console.log(`   ${severityEmoji} [${issue.severity}] ${issue.issueType}`);
        console.log(`      ${issue.details}`);
        if (issue.affectedAmount > 0) {
          console.log(`      Amount: $${(issue.affectedAmount/100).toFixed(2)}`);
        }
      }
    }
    
    // Export to JSON for further processing
    console.log('\n' + '='.repeat(80));
    console.log('📁 EXPORTABLE DATA (JSON):');
    console.log('='.repeat(80));
    console.log(JSON.stringify(issues, null, 2));
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Diagnostic complete');
  console.log('='.repeat(80) + '\n');
  
  return issues;
}

// Run the diagnostic
diagnoseAllPaymentPlans()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Diagnostic failed:', error);
    process.exit(1);
  });
