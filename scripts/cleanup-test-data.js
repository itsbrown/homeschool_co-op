#!/usr/bin/env node

/**
 * Test Data Cleanup Script
 * 
 * This script removes test data from all JSON files to prepare for production.
 * Run this before deploying to production.
 * 
 * Usage: node scripts/cleanup-test-data.js [--backup] [--confirm]
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Test patterns to identify test data
const TEST_PATTERNS = [
  /test/i,
  /debug/i,
  /sample/i,
  /demo/i,
  /mock/i,
  /fake/i,
  /temp/i,
  /placeholder/i,
  /example/i,
  /@test/i,
  /@testing/i,
  /testing321/i,
  /validation.*test/i,
  /token.*test/i,
  /tokenfix.*test/i,
  /auto.*test/i,
];

// Production data to keep (real users, schools, etc.)
const PRODUCTION_PATTERNS = [
  /coreycreates@gmail\.com/i,
  /american.*seekers.*academy/i,
];

function isTestData(item, type) {
  if (!item) return false;
  
  const itemStr = JSON.stringify(item).toLowerCase();
  
  // Check if it's production data (keep it)
  if (PRODUCTION_PATTERNS.some(pattern => pattern.test(itemStr))) {
    return false;
  }
  
  // Check common test fields
  const testFields = [
    item.email,
    item.name,
    item.firstName,
    item.lastName,
    item.title,
    item.description,
    item.username,
    item.position,
    item.parentEmail,
    item.emergencyContact,
    item.instructorName,
    item.instructorEmail
  ].filter(Boolean);
  
  return testFields.some(field => 
    TEST_PATTERNS.some(pattern => pattern.test(field))
  );
}

function cleanupFile(filename, cleanupFn) {
  const filePath = path.join(DATA_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${filename} not found, skipping...`);
    return;
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const originalCount = Array.isArray(data) ? data.length : Object.keys(data).length;
    
    const cleanedData = cleanupFn(data);
    const newCount = Array.isArray(cleanedData) ? cleanedData.length : Object.keys(cleanedData).length;
    
    // Create backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `${filename.replace('.json', '')}_${timestamp}.json`);
    
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
    console.log(`📁 Backup created: ${backupPath}`);
    
    // Write cleaned data
    fs.writeFileSync(filePath, JSON.stringify(cleanedData, null, 2));
    
    console.log(`✅ ${filename}: ${originalCount} → ${newCount} items (removed ${originalCount - newCount} test items)`);
  } catch (error) {
    console.error(`❌ Error processing ${filename}:`, error.message);
  }
}

function cleanupUsers(users) {
  return users.filter(user => !isTestData(user, 'user'));
}

function cleanupChildren(children) {
  return children.filter(child => !isTestData(child, 'child'));
}

function cleanupStaff(staff) {
  return staff.filter(member => !isTestData(member, 'staff'));
}

function cleanupClasses(classes) {
  // Keep production classes but remove test classes
  return classes.filter(cls => {
    // Keep real classes for American Seekers Academy
    if (cls.schoolId === 1 && !isTestData(cls, 'class')) {
      return true;
    }
    return false;
  });
}

function cleanupEnrollments(enrollments) {
  return enrollments.filter(enrollment => !isTestData(enrollment, 'enrollment'));
}

function cleanupStaffInvitations(invitations) {
  return invitations.filter(invitation => !isTestData(invitation, 'invitation'));
}

function cleanupPasswordResetTokens(tokens) {
  // Remove all password reset tokens for security
  return [];
}

function main() {
  const args = process.argv.slice(2);
  const shouldBackup = args.includes('--backup');
  const confirmed = args.includes('--confirm');
  
  if (!confirmed) {
    console.log('⚠️  PRODUCTION DATA CLEANUP');
    console.log('');
    console.log('This script will remove test data from all JSON files.');
    console.log('This action cannot be undone without restoring from backup.');
    console.log('');
    console.log('Test data patterns that will be removed:');
    console.log('- Items containing: test, debug, sample, demo, mock, fake, temp');
    console.log('- Email addresses with @test, @testing, testing321');
    console.log('- Names containing test variations');
    console.log('');
    console.log('Production data that will be kept:');
    console.log('- coreycreates@gmail.com');
    console.log('- American Seekers Academy data');
    console.log('');
    console.log('Run with --confirm to proceed:');
    console.log('node scripts/cleanup-test-data.js --confirm');
    return;
  }
  
  console.log('🧹 Starting test data cleanup...');
  console.log('');
  
  // Clean up each data file
  cleanupFile('users.json', cleanupUsers);
  cleanupFile('children.json', cleanupChildren);
  cleanupFile('staff.json', cleanupStaff);
  cleanupFile('classes.json', cleanupClasses);
  cleanupFile('enrollments.json', cleanupEnrollments);
  cleanupFile('staff-invitations.json', cleanupStaffInvitations);
  cleanupFile('password-reset-tokens.json', cleanupPasswordResetTokens);
  
  console.log('');
  console.log('✅ Test data cleanup completed!');
  console.log('📁 All backups saved to:', BACKUP_DIR);
  console.log('');
  console.log('🚀 Your application is now ready for production deployment.');
}

if (require.main === module) {
  main();
}

module.exports = {
  isTestData,
  cleanupUsers,
  cleanupChildren,
  cleanupStaff,
  cleanupClasses,
  cleanupEnrollments
};