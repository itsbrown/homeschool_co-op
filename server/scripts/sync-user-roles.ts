import { getDb } from '../db';
import { users, userRoles } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Sync legacy users.role to user_roles table for users missing entries
 * This ensures all users have proper multi-role support
 */
async function syncLegacyRoles() {
  console.log('🔄 Syncing legacy roles to user_roles table...');

  try {
    const db = await getDb();

    // Get all users
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        schoolId: users.schoolId,
      })
      .from(users);

    console.log(`📋 Found ${allUsers.length} total users`);

    let syncedCount = 0;
    let skippedCount = 0;

    for (const user of allUsers) {
      // Check if user already has an entry in user_roles
      const existingRoles = await db
        .select()
        .from(userRoles)
        .where(eq(userRoles.userId, user.id));

      if (existingRoles.length > 0) {
        console.log(`⏭️  Skipping ${user.email} - already has ${existingRoles.length} role(s)`);
        skippedCount++;
        continue;
      }

      // Create user_roles entry from legacy role
      const [newRole] = await db
        .insert(userRoles)
        .values({
          userId: user.id,
          role: user.role,
          schoolId: user.schoolId,
          isPrimary: true, // First role is always primary
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Set activeRoleId to the newly created role
      await db
        .update(users)
        .set({
          activeRoleId: newRole.id,
        })
        .where(eq(users.id, user.id));

      console.log(`✅ Synced ${user.email}: ${user.role} at school ${user.schoolId || 'none'} (role ID: ${newRole.id})`);
      syncedCount++;
    }

    console.log('\n📊 Sync Summary:');
    console.log(`✅ Synced: ${syncedCount} users`);
    console.log(`⏭️  Skipped: ${skippedCount} users (already had roles)`);
    console.log(`📋 Total: ${allUsers.length} users`);

  } catch (error) {
    console.error('❌ Failed to sync legacy roles:', error);
    throw error;
  }
}

syncLegacyRoles()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
