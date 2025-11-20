import { getDb } from '../db';
import { users, userRoles } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Diagnostic script to check user and role data
 */
async function diagnoseUserRoles() {
  console.log('🔍 Diagnosing user roles...\n');

  try {
    const db = await getDb();

    // Check coreycreates@gmail.com
    const targetEmail = 'coreycreates@gmail.com';
    
    console.log(`📋 Checking user: ${targetEmail}`);
    
    const user = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        schoolId: users.schoolId,
        activeRole: users.activeRole,
        activeRoleId: users.activeRoleId,
      })
      .from(users)
      .where(eq(users.email, targetEmail));

    if (!user || user.length === 0) {
      console.log('❌ User not found!');
      return;
    }

    console.log(`\n✅ User found:`);
    console.log(`   ID: ${user[0].id}`);
    console.log(`   Email: ${user[0].email}`);
    console.log(`   Legacy role: ${user[0].role}`);
    console.log(`   School ID: ${user[0].schoolId}`);
    console.log(`   Active role: ${user[0].activeRole || 'null'}`);
    console.log(`   Active role ID: ${user[0].activeRoleId || 'null'}`);

    // Check user_roles
    const roles = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, user[0].id));

    console.log(`\n📚 User roles in user_roles table:`);
    if (roles.length === 0) {
      console.log('   ❌ No roles found!');
    } else {
      roles.forEach((role, index) => {
        console.log(`   ${index + 1}. Role ID: ${role.id}, Role: ${role.role}, School ID: ${role.schoolId}, Primary: ${role.isPrimary}`);
      });
    }

    // Check admin user
    const adminEmail = 'contact.americanseekersacademy@gmail.com';
    console.log(`\n📋 Checking admin: ${adminEmail}`);
    
    const admin = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        schoolId: users.schoolId,
      })
      .from(users)
      .where(eq(users.email, adminEmail));

    if (!admin || admin.length === 0) {
      console.log('❌ Admin not found!');
      return;
    }

    console.log(`\n✅ Admin found:`);
    console.log(`   ID: ${admin[0].id}`);
    console.log(`   Email: ${admin[0].email}`);
    console.log(`   Role: ${admin[0].role}`);
    console.log(`   School ID: ${admin[0].schoolId}`);

    // Check what the admin would see
    console.log(`\n🔍 What the admin would see when querying for ${targetEmail}:`);
    console.log(`   Admin's school ID: ${admin[0].schoolId}`);
    console.log(`   Target user's school ID: ${user[0].schoolId}`);
    console.log(`   Match: ${admin[0].schoolId === user[0].schoolId ? '✅ YES' : '❌ NO'}`);

    if (admin[0].schoolId !== user[0].schoolId) {
      console.log(`\n⚠️  PROBLEM: Admin's school doesn't match target user's school!`);
      console.log(`   The admin won't see this user in the users list.`);
    } else {
      console.log(`\n✅ Schools match - checking role filtering...`);
      
      const visibleRoles = roles.filter(role => role.schoolId === admin[0].schoolId);
      console.log(`   Roles visible to admin: ${visibleRoles.length}`);
      
      if (visibleRoles.length === 0) {
        console.log(`\n⚠️  PROBLEM: User has roles, but none at the admin's school!`);
        console.log(`   User's roles:`);
        roles.forEach(role => {
          console.log(`      - ${role.role} at school ${role.schoolId}`);
        });
        console.log(`   Admin's school: ${admin[0].schoolId}`);
      } else {
        console.log(`   ✅ Admin can see ${visibleRoles.length} role(s):`);
        visibleRoles.forEach(role => {
          console.log(`      - ${role.role} (ID: ${role.id})`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Failed to diagnose:', error);
    throw error;
  }
}

diagnoseUserRoles()
  .then(() => {
    console.log('\n✅ Diagnosis complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
