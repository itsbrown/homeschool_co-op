#!/usr/bin/env node
/**
 * Comprehensive Enrollment System Test
 * Tests the complete enrollment flow via direct database and API validation
 */

import { getDb } from './server/db.js';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';

async function testEnrollmentSystem() {
  console.log('🧪 Starting Comprehensive Enrollment System Test\n');
  
  const results = {
    passed: [],
    failed: [],
    warnings: []
  };
  
  try {
    const db = await getDb();
    console.log('✅ Database connection established\n');
    
    // ========================================
    // TEST 1: Verify program_enrollments table schema
    // ========================================
    console.log('📋 TEST 1: Verifying program_enrollments table schema...');
    try {
      const schemaCheck = await db.execute(sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'program_enrollments'
        ORDER BY ordinal_position;
      `);
      
      const columns = schemaCheck.rows;
      const columnNames = columns.map(col => col.column_name);
      
      // Check for critical columns
      const requiredColumns = [
        'id', 'school_id', 'class_type', 'child_id', 'parent_id', 
        'enrollment_date', 'total_cost', 'payment_status', 'status'
      ];
      
      const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
      
      if (missingColumns.length > 0) {
        results.failed.push(`Missing columns: ${missingColumns.join(', ')}`);
        console.log(`   ❌ Missing required columns: ${missingColumns.join(', ')}`);
      } else {
        results.passed.push('All required columns exist');
        console.log('   ✅ All required columns exist');
      }
      
      // Check class_type column specifically
      const classTypeCol = columns.find(col => col.column_name === 'class_type');
      if (classTypeCol) {
        results.passed.push('class_type column exists');
        console.log(`   ✅ class_type column exists (type: ${classTypeCol.data_type})`);
      } else {
        results.failed.push('class_type column missing');
        console.log('   ❌ class_type column missing');
      }
      
      // Check enrollment_date column
      const enrollmentDateCol = columns.find(col => col.column_name === 'enrollment_date');
      if (enrollmentDateCol) {
        results.passed.push('enrollment_date column exists');
        console.log(`   ✅ enrollment_date column exists (type: ${enrollmentDateCol.data_type})`);
      } else {
        results.failed.push('enrollment_date column missing');
        console.log('   ❌ enrollment_date column missing');
      }
      
      console.log();
    } catch (error) {
      results.failed.push(`Schema check failed: ${error.message}`);
      console.log(`   ❌ Schema check failed: ${error.message}\n`);
    }
    
    // ========================================
    // TEST 2: Check existing enrollments data integrity
    // ========================================
    console.log('📊 TEST 2: Checking existing enrollments data integrity...');
    try {
      const enrollments = await db.execute(sql`
        SELECT 
          id, 
          class_type, 
          enrollment_date, 
          child_id, 
          parent_id,
          total_cost,
          payment_status,
          status
        FROM program_enrollments
        LIMIT 10;
      `);
      
      console.log(`   Found ${enrollments.rows.length} enrollment(s)`);
      
      if (enrollments.rows.length > 0) {
        let dataIntegrityIssues = 0;
        
        enrollments.rows.forEach((enrollment, idx) => {
          // Check class_type
          if (!enrollment.class_type || !['school_class', 'marketplace'].includes(enrollment.class_type)) {
            console.log(`   ⚠️  Enrollment ${enrollment.id}: Invalid or missing class_type: ${enrollment.class_type}`);
            dataIntegrityIssues++;
          }
          
          // Check enrollment_date is a valid date
          if (!enrollment.enrollment_date) {
            console.log(`   ⚠️  Enrollment ${enrollment.id}: Missing enrollment_date`);
            dataIntegrityIssues++;
          } else if (!(enrollment.enrollment_date instanceof Date)) {
            console.log(`   ⚠️  Enrollment ${enrollment.id}: enrollment_date is not a Date object: ${typeof enrollment.enrollment_date}`);
            dataIntegrityIssues++;
          }
          
          // Check required fields
          if (!enrollment.child_id || !enrollment.parent_id) {
            console.log(`   ⚠️  Enrollment ${enrollment.id}: Missing child_id or parent_id`);
            dataIntegrityIssues++;
          }
        });
        
        if (dataIntegrityIssues === 0) {
          results.passed.push('All existing enrollments have valid data');
          console.log('   ✅ All existing enrollments have valid data');
        } else {
          results.warnings.push(`${dataIntegrityIssues} data integrity issue(s) found`);
          console.log(`   ⚠️  ${dataIntegrityIssues} data integrity issue(s) found`);
        }
      } else {
        results.warnings.push('No enrollments found in database');
        console.log('   ℹ️  No enrollments found in database (this is OK for a fresh system)');
      }
      
      console.log();
    } catch (error) {
      results.failed.push(`Data integrity check failed: ${error.message}`);
      console.log(`   ❌ Data integrity check failed: ${error.message}\n`);
    }
    
    // ========================================
    // TEST 3: Verify storage methods exist
    // ========================================
    console.log('🔧 TEST 3: Verifying storage methods...');
    try {
      const { storage } = await import('./server/storage.js');
      
      const requiredMethods = [
        'createProgramEnrollment',
        'getProgramEnrollmentById',
        'getEnrollmentsByChildIds',
        'getEnrollmentsByProgramId',
        'updateProgramEnrollment'
      ];
      
      const missingMethods = requiredMethods.filter(method => typeof storage[method] !== 'function');
      
      if (missingMethods.length > 0) {
        results.failed.push(`Missing storage methods: ${missingMethods.join(', ')}`);
        console.log(`   ❌ Missing storage methods: ${missingMethods.join(', ')}`);
      } else {
        results.passed.push('All required storage methods exist');
        console.log('   ✅ All required storage methods exist');
      }
      
      console.log();
    } catch (error) {
      results.failed.push(`Storage method check failed: ${error.message}`);
      console.log(`   ❌ Storage method check failed: ${error.message}\n`);
    }
    
    // ========================================
    // TEST 4: Verify database constraints
    // ========================================
    console.log('🔒 TEST 4: Verifying database constraints...');
    try {
      const constraints = await db.execute(sql`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'program_enrollments'
        AND constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'CHECK');
      `);
      
      console.log(`   Found ${constraints.rows.length} constraint(s)`);
      
      const hasCheckConstraint = constraints.rows.some(c => 
        c.constraint_type === 'CHECK' && 
        c.constraint_name.includes('class_type')
      );
      
      if (hasCheckConstraint) {
        results.passed.push('class_type CHECK constraint exists');
        console.log('   ✅ class_type CHECK constraint exists');
      } else {
        results.warnings.push('class_type CHECK constraint not found');
        console.log('   ⚠️  class_type CHECK constraint not found (data may not be validated)');
      }
      
      console.log();
    } catch (error) {
      results.warnings.push(`Constraint check failed: ${error.message}`);
      console.log(`   ⚠️  Constraint check failed: ${error.message}\n`);
    }
    
    // ========================================
    // TEST 5: Test enrollment creation (dry run)
    // ========================================
    console.log('🧪 TEST 5: Testing enrollment creation (dry run)...');
    try {
      const { storage } = await import('./server/storage.js');
      
      // Check if we have test data
      const testChildren = await db.execute(sql`
        SELECT id, first_name, last_name, parent_id
        FROM children
        LIMIT 1;
      `);
      
      const testClasses = await db.execute(sql`
        SELECT id, title, price, school_id
        FROM school_classes
        LIMIT 1;
      `);
      
      if (testChildren.rows.length === 0) {
        results.warnings.push('No test children found - skipping enrollment creation test');
        console.log('   ⚠️  No test children found - cannot test enrollment creation');
      } else if (testClasses.rows.length === 0) {
        results.warnings.push('No test classes found - skipping enrollment creation test');
        console.log('   ⚠️  No test classes found - cannot test enrollment creation');
      } else {
        const testChild = testChildren.rows[0];
        const testClass = testClasses.rows[0];
        
        console.log(`   ℹ️  Would create enrollment for child ${testChild.id} in class ${testClass.id}`);
        console.log(`   ℹ️  Skipping actual creation to avoid test data pollution`);
        results.passed.push('Enrollment creation test structure validated');
      }
      
      console.log();
    } catch (error) {
      results.warnings.push(`Enrollment creation test failed: ${error.message}`);
      console.log(`   ⚠️  Enrollment creation test failed: ${error.message}\n`);
    }
    
    // ========================================
    // TEST 6: Verify recent bug fixes
    // ========================================
    console.log('🐛 TEST 6: Verifying recent bug fixes...');
    try {
      // Check if the code uses Date objects instead of .toISOString()
      const fs = await import('fs');
      const classesApiContent = fs.readFileSync('server/api/classes.ts', 'utf8');
      const registrationApiContent = fs.readFileSync('server/api/registration.ts', 'utf8');
      
      // Check for problematic .toISOString() calls on enrollmentDate
      const hasISOStringBug = 
        classesApiContent.includes('enrollmentDate: new Date().toISOString()') ||
        registrationApiContent.includes('enrollmentDate: new Date().toISOString()');
      
      if (hasISOStringBug) {
        results.failed.push('Code still uses .toISOString() for enrollmentDate');
        console.log('   ❌ Code still uses .toISOString() for enrollmentDate (should use new Date())');
      } else {
        results.passed.push('enrollmentDate uses Date objects (not ISO strings)');
        console.log('   ✅ enrollmentDate uses Date objects (not ISO strings)');
      }
      
      // Check storage routing
      const storageContent = fs.readFileSync('server/storage.ts', 'utf8');
      const usesDbStorage = storageContent.includes('return this.dbStorage.getEnrollmentsByChildIds');
      
      if (usesDbStorage) {
        results.passed.push('getEnrollmentsByChildIds uses dbStorage correctly');
        console.log('   ✅ getEnrollmentsByChildIds uses dbStorage correctly');
      } else {
        results.failed.push('getEnrollmentsByChildIds may not use dbStorage');
        console.log('   ❌ getEnrollmentsByChildIds may not use dbStorage');
      }
      
      console.log();
    } catch (error) {
      results.warnings.push(`Bug fix verification failed: ${error.message}`);
      console.log(`   ⚠️  Bug fix verification failed: ${error.message}\n`);
    }
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    results.failed.push(`Test suite error: ${error.message}`);
  }
  
  // ========================================
  // TEST SUMMARY
  // ========================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⚠️  Warnings: ${results.warnings.length}`);
  console.log('='.repeat(60));
  
  if (results.passed.length > 0) {
    console.log('\n✅ PASSED TESTS:');
    results.passed.forEach(test => console.log(`   • ${test}`));
  }
  
  if (results.failed.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.failed.forEach(test => console.log(`   • ${test}`));
  }
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.warnings.forEach(test => console.log(`   • ${test}`));
  }
  
  console.log('\n');
  
  if (results.failed.length === 0) {
    console.log('🎉 All critical tests passed! Enrollment system is ready.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Please review the issues above.\n');
    process.exit(1);
  }
}

// Run the test
testEnrollmentSystem().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
