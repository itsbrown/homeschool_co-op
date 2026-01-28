/**
 * Diagnostic Script: Find bi-weekly enrollments with duplicate scheduled payment dates
 * Run with: npx tsx server/scripts/diagnose-biweekly-issues.ts
 * 
 * This script identifies:
 * 1. Bi-weekly enrollments with duplicate payment dates
 * 2. Payments not properly spaced at 14-day intervals
 */

import { getDb } from '../db';
import { 
  programEnrollments,
  scheduledPayments
} from '../../shared/schema';
import { eq } from 'drizzle-orm';

interface BiweeklyIssue {
  enrollmentId: number;
  childName: string;
  className: string;
  parentEmail: string;
  scheduledDates: string[];
  duplicateDates: string[];
  expectedSpacing: number;
  actualSpacings: number[];
  issueType: 'DUPLICATE_DATES' | 'INCORRECT_SPACING' | 'BOTH';
}

async function diagnoseBiweeklyIssues() {
  const db = await getDb();
  const issues: BiweeklyIssue[] = [];
  
  console.log('🔍 Starting Bi-weekly Payment Schedule Diagnostic...\n');
  console.log('='.repeat(80));
  
  // 1. Find all bi-weekly enrollments
  const biweeklyEnrollments = await db.select().from(programEnrollments)
    .where(eq(programEnrollments.paymentFrequency, 'biweekly'));
  
  console.log(`\n📊 Found ${biweeklyEnrollments.length} bi-weekly enrollments\n`);
  
  for (const enrollment of biweeklyEnrollments) {
    // Get scheduled payments for this enrollment
    const payments = await db.select().from(scheduledPayments)
      .where(eq(scheduledPayments.enrollmentId, enrollment.id));
    
    if (payments.length < 2) {
      console.log(`⚠️ Enrollment ${enrollment.id} (${enrollment.childName}) has ${payments.length} scheduled payments - skipping`);
      continue;
    }
    
    // Sort by scheduled date
    const sortedPayments = [...payments].sort((a: typeof payments[0], b: typeof payments[0]) => 
      new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
    );
    
    // Check for duplicate dates
    const dateStrings = sortedPayments.map((p: typeof payments[0]) => 
      new Date(p.scheduledDate).toISOString().split('T')[0]
    );
    const uniqueDates = [...new Set(dateStrings)];
    const duplicates = dateStrings.filter((date: string, index: number) => dateStrings.indexOf(date) !== index);
    
    // Check spacing between payments (should be 14 days for bi-weekly)
    const spacings: number[] = [];
    for (let i = 1; i < sortedPayments.length; i++) {
      const prevDate = new Date(sortedPayments[i - 1].scheduledDate);
      const currDate = new Date(sortedPayments[i].scheduledDate);
      const daysDiff = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      spacings.push(daysDiff);
    }
    
    const hasDuplicates = duplicates.length > 0;
    const hasIncorrectSpacing = spacings.some(s => s !== 14 && s !== 0); // 0 means duplicate
    
    if (hasDuplicates || hasIncorrectSpacing) {
      let issueType: 'DUPLICATE_DATES' | 'INCORRECT_SPACING' | 'BOTH';
      if (hasDuplicates && hasIncorrectSpacing) {
        issueType = 'BOTH';
      } else if (hasDuplicates) {
        issueType = 'DUPLICATE_DATES';
      } else {
        issueType = 'INCORRECT_SPACING';
      }
      
      issues.push({
        enrollmentId: enrollment.id,
        childName: enrollment.childName,
        className: enrollment.className,
        parentEmail: enrollment.parentEmail,
        scheduledDates: dateStrings,
        duplicateDates: duplicates,
        expectedSpacing: 14,
        actualSpacings: spacings,
        issueType
      });
    }
  }
  
  // Print results
  console.log('\n' + '='.repeat(80));
  console.log(`\n🚨 Found ${issues.length} enrollments with bi-weekly payment issues:\n`);
  
  for (const issue of issues) {
    console.log(`\n📋 Enrollment ID: ${issue.enrollmentId}`);
    console.log(`   Child: ${issue.childName}`);
    console.log(`   Class: ${issue.className}`);
    console.log(`   Parent: ${issue.parentEmail}`);
    console.log(`   Issue Type: ${issue.issueType}`);
    console.log(`   Scheduled Dates: ${issue.scheduledDates.join(', ')}`);
    if (issue.duplicateDates.length > 0) {
      console.log(`   ❌ Duplicate Dates: ${issue.duplicateDates.join(', ')}`);
    }
    console.log(`   Spacings (days): ${issue.actualSpacings.join(', ')} (expected: 14)`);
    console.log('-'.repeat(60));
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 SUMMARY:');
  console.log(`   Total bi-weekly enrollments: ${biweeklyEnrollments.length}`);
  console.log(`   Enrollments with issues: ${issues.length}`);
  console.log(`   - Duplicate dates only: ${issues.filter(i => i.issueType === 'DUPLICATE_DATES').length}`);
  console.log(`   - Incorrect spacing only: ${issues.filter(i => i.issueType === 'INCORRECT_SPACING').length}`);
  console.log(`   - Both issues: ${issues.filter(i => i.issueType === 'BOTH').length}`);
  
  if (issues.length > 0) {
    console.log('\n💡 To fix these issues, run:');
    console.log('   npx tsx server/scripts/fix-biweekly-schedules.ts');
  }
  
  return issues;
}

// Run if executed directly
diagnoseBiweeklyIssues()
  .then(() => {
    console.log('\n✅ Diagnostic complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Diagnostic failed:', error);
    process.exit(1);
  });
