/**
 * Validate Enrollment System Fixes
 * Checks code and database for enrollment system integrity
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

console.log('🧪 Validating Enrollment System Fixes\n');
console.log('='.repeat(70));

// ========================================
// TEST 1: Verify enrollmentDate uses Date objects
// ========================================
console.log('\n📅 TEST 1: Checking enrollmentDate implementation...');
try {
  const filesToCheck = [
    'server/api/classes.ts',
    'server/api/registration.ts',
    'server/api/enrollment-assistant.ts',
    'server/routes.ts'
  ];
  
  let hasISOStringIssue = false;
  let filesWithIssues: string[] = [];
  
  for (const file of filesToCheck) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check for the problematic pattern
      if (content.includes('enrollmentDate: new Date().toISOString()')) {
        hasISOStringIssue = true;
        filesWithIssues.push(file);
      }
    }
  }
  
  if (hasISOStringIssue) {
    results.push({
      name: 'enrollmentDate Date object usage',
      passed: false,
      message: `❌ Files still use .toISOString(): ${filesWithIssues.join(', ')}`
    });
    console.log(`   ❌ FAILED: Files still use .toISOString() for enrollmentDate`);
    filesWithIssues.forEach(f => console.log(`      - ${f}`));
  } else {
    results.push({
      name: 'enrollmentDate Date object usage',
      passed: true,
      message: '✅ All files use new Date() for enrollmentDate'
    });
    console.log('   ✅ PASSED: All files correctly use new Date() objects');
  }
} catch (error) {
  results.push({
    name: 'enrollmentDate Date object usage',
    passed: false,
    message: `⚠️  Test error: ${error instanceof Error ? error.message : String(error)}`
  });
  console.log(`   ⚠️  Test error: ${error instanceof Error ? error.message : String(error)}`);
}

// ========================================
// TEST 2: Verify getEnrollmentsByChildIds uses dbStorage
// ========================================
console.log('\n🗄️  TEST 2: Checking storage routing...');
try {
  const storageFile = path.join(process.cwd(), 'server/storage.ts');
  const content = fs.readFileSync(storageFile, 'utf8');
  
  // Look for the correct implementation
  const correctPattern = /async getEnrollmentsByChildIds[\s\S]*?return this\.dbStorage\.getEnrollmentsByChildIds/;
  const incorrectPattern = /async getEnrollmentsByChildIds[\s\S]*?return this\.memStorage\.getEnrollmentsByChildIds/;
  
  if (incorrectPattern.test(content)) {
    results.push({
      name: 'Storage routing for getEnrollmentsByChildIds',
      passed: false,
      message: '❌ Uses memStorage instead of dbStorage'
    });
    console.log('   ❌ FAILED: getEnrollmentsByChildIds uses memStorage (should use dbStorage)');
  } else if (correctPattern.test(content)) {
    results.push({
      name: 'Storage routing for getEnrollmentsByChildIds',
      passed: true,
      message: '✅ Correctly uses dbStorage'
    });
    console.log('   ✅ PASSED: getEnrollmentsByChildIds correctly uses dbStorage');
  } else {
    results.push({
      name: 'Storage routing for getEnrollmentsByChildIds',
      passed: false,
      message: '⚠️  Could not find getEnrollmentsByChildIds implementation'
    });
    console.log('   ⚠️  WARNING: Could not verify implementation');
  }
} catch (error) {
  results.push({
    name: 'Storage routing for getEnrollmentsByChildIds',
    passed: false,
    message: `⚠️  Test error: ${error instanceof Error ? error.message : String(error)}`
  });
  console.log(`   ⚠️  Test error: ${error instanceof Error ? error.message : String(error)}`);
}

// ========================================
// TEST 3: Verify migration adds class_type column
// ========================================
console.log('\n🔧 TEST 3: Checking database migration...');
try {
  const initDbFile = path.join(process.cwd(), 'server/init-db.ts');
  const content = fs.readFileSync(initDbFile, 'utf8');
  
  const hasClassTypeMigration = content.includes('class_type') && 
                                 content.includes('ALTER TABLE program_enrollments');
  
  if (hasClassTypeMigration) {
    results.push({
      name: 'class_type column migration',
      passed: true,
      message: '✅ Migration adds class_type column'
    });
    console.log('   ✅ PASSED: Migration script includes class_type column addition');
  } else {
    results.push({
      name: 'class_type column migration',
      passed: false,
      message: '❌ Migration does not add class_type column'
    });
    console.log('   ❌ FAILED: Migration script missing class_type column addition');
  }
} catch (error) {
  results.push({
    name: 'class_type column migration',
    passed: false,
    message: `⚠️  Test error: ${error instanceof Error ? error.message : String(error)}`
  });
  console.log(`   ⚠️  Test error: ${error instanceof Error ? error.message : String(error)}`);
}

// ========================================
// TEST 4: Verify schema defines class_type
// ========================================
console.log('\n📋 TEST 4: Checking schema definition...');
try {
  const schemaFile = path.join(process.cwd(), 'shared/schema.ts');
  const content = fs.readFileSync(schemaFile, 'utf8');
  
  const hasClassTypeInSchema = content.includes('classType: text("class_type"') &&
                                 content.includes('enum: ["school_class", "marketplace"]');
  
  if (hasClassTypeInSchema) {
    results.push({
      name: 'class_type schema definition',
      passed: true,
      message: '✅ Schema defines class_type with correct enum values'
    });
    console.log('   ✅ PASSED: Schema correctly defines class_type field');
  } else {
    results.push({
      name: 'class_type schema definition',
      passed: false,
      message: '❌ Schema missing or incorrect class_type definition'
    });
    console.log('   ❌ FAILED: Schema missing or incorrect class_type definition');
  }
} catch (error) {
  results.push({
    name: 'class_type schema definition',
    passed: false,
    message: `⚠️  Test error: ${error instanceof Error ? error.message : String(error)}`
  });
  console.log(`   ⚠️  Test error: ${error instanceof Error ? error.message : String(error)}`);
}

// ========================================
// TEST 5: Verify database storage has required methods
// ========================================
console.log('\n💾 TEST 5: Checking database storage methods...');
try {
  const dbStorageFile = path.join(process.cwd(), 'server/db/database-storage.ts');
  const content = fs.readFileSync(dbStorageFile, 'utf8');
  
  const requiredMethods = [
    'getEnrollmentsByChildIds',
    'createProgramEnrollment',
    'getProgramEnrollmentById',
    'getEnrollmentsByProgramId'
  ];
  
  const missingMethods = requiredMethods.filter(method => !content.includes(`async ${method}`));
  
  if (missingMethods.length === 0) {
    results.push({
      name: 'Database storage methods',
      passed: true,
      message: '✅ All required methods exist'
    });
    console.log('   ✅ PASSED: All required database storage methods exist');
  } else {
    results.push({
      name: 'Database storage methods',
      passed: false,
      message: `❌ Missing methods: ${missingMethods.join(', ')}`
    });
    console.log(`   ❌ FAILED: Missing methods: ${missingMethods.join(', ')}`);
  }
} catch (error) {
  results.push({
    name: 'Database storage methods',
    passed: false,
    message: `⚠️  Test error: ${error instanceof Error ? error.message : String(error)}`
  });
  console.log(`   ⚠️  Test error: ${error instanceof Error ? error.message : String(error)}`);
}

// ========================================
// SUMMARY
// ========================================
console.log('\n' + '='.repeat(70));
console.log('📊 VALIDATION SUMMARY');
console.log('='.repeat(70));

const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;
const total = results.length;

console.log(`\nTests Run: ${total}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);

if (failed === 0) {
  console.log('\n🎉 All validation checks passed! The enrollment system fixes are in place.');
} else {
  console.log('\n⚠️  Some validation checks failed. See details above.');
  console.log('\nFailed tests:');
  results.filter(r => !r.passed).forEach(r => {
    console.log(`   • ${r.name}: ${r.message}`);
  });
}

console.log('\n' + '='.repeat(70));
console.log('\n💡 NEXT STEPS:');
console.log('   1. Clear browser cache and hard refresh (Ctrl+Shift+R)');
console.log('   2. Try enrolling a child in a class');
console.log('   3. If errors occur, check the browser console timestamp');
console.log('   4. Report any errors that occurred AFTER the latest server restart');
console.log('\n');

process.exit(failed === 0 ? 0 : 1);
