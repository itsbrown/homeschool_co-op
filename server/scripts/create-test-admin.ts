import { createClient } from '@supabase/supabase-js';
import { getDb } from '../db';
import { users, userRoles } from '@shared/schema';
import { eq } from 'drizzle-orm';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createTestSchoolAdmin() {
  const db = await getDb();
  const testEmail = 'test.admin@asatesting.local';
  const testPassword = 'TestPassword123!';
  const testSchoolId = 1; // American Seekers Academy

  console.log('🔧 Creating test school admin user...');
  console.log('📧 Email:', testEmail);
  console.log('🔑 Password:', testPassword);
  console.log('🏫 School ID:', testSchoolId);

  try {
    // Check if Supabase auth user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users.find(u => u.email === testEmail);

    let supabaseUserId: string;

    if (existingAuthUser) {
      console.log('⚠️ Supabase auth user already exists, using existing ID:', existingAuthUser.id);
      supabaseUserId = existingAuthUser.id;

      // Update the existing user's password and metadata
      await supabaseAdmin.auth.admin.updateUserById(existingAuthUser.id, {
        password: testPassword,
        app_metadata: {
          role: 'schoolAdmin',
          school_id: testSchoolId
        },
        user_metadata: {
          name: 'Test Admin'
        }
      });
      console.log('✅ Updated existing Supabase user credentials');
    } else {
      // Create new Supabase auth user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true,
        app_metadata: {
          role: 'schoolAdmin',
          school_id: testSchoolId
        },
        user_metadata: {
          name: 'Test Admin'
        }
      });

      if (authError) {
        throw new Error(`Supabase auth creation failed: ${authError.message}`);
      }

      supabaseUserId = authData.user.id;
      console.log('✅ Created Supabase auth user:', supabaseUserId);
    }

    // Check if database user exists
    const [existingDbUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, testEmail))
      .limit(1);

    let dbUserId: number;

    if (existingDbUser) {
      console.log('⚠️ Database user already exists, updating ID:', existingDbUser.id);
      dbUserId = existingDbUser.id;

      // Update the database user
      await db
        .update(users)
        .set({
          supabaseId: supabaseUserId,
          name: 'Test Admin',
          role: 'schoolAdmin',
          schoolId: testSchoolId,
          updatedAt: new Date()
        })
        .where(eq(users.id, dbUserId));

      console.log('✅ Updated database user');
    } else {
      // Create database user
      const [newUser] = await db
        .insert(users)
        .values({
          supabaseId: supabaseUserId,
          email: testEmail,
          username: testEmail, // Use email as username
          password: 'hashedPasswordNotUsed', // Placeholder - actual auth is via Supabase
          name: 'Test Admin',
          role: 'schoolAdmin',
          schoolId: testSchoolId,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      dbUserId = newUser.id;
      console.log('✅ Created database user:', dbUserId);
    }

    // Check if user_roles entry exists
    const [existingRole] = await db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, dbUserId))
      .limit(1);

    if (existingRole) {
      console.log('⚠️ User role already exists, updating...');
      await db
        .update(userRoles)
        .set({
          role: 'schoolAdmin',
          schoolId: testSchoolId,
          isPrimary: true,
          updatedAt: new Date()
        })
        .where(eq(userRoles.userId, dbUserId));
      console.log('✅ Updated user role');
    } else {
      // Create user_roles entry
      await db
        .insert(userRoles)
        .values({
          userId: dbUserId,
          role: 'schoolAdmin',
          schoolId: testSchoolId,
          isPrimary: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      console.log('✅ Created user role entry');
    }

    // Set activeRoleId in users table
    await db
      .update(users)
      .set({
        activeRoleId: (await db.select().from(userRoles).where(eq(userRoles.userId, dbUserId)).limit(1))[0].id
      })
      .where(eq(users.id, dbUserId));

    console.log('✅ Set active role ID');

    console.log('\n🎉 Test school admin user created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:    ', testEmail);
    console.log('🔑 Password: ', testPassword);
    console.log('👤 DB User ID:', dbUserId);
    console.log('🆔 Supabase ID:', supabaseUserId);
    console.log('🏫 School ID:', testSchoolId);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌ Failed to create test admin:', error);
    throw error;
  }
}

createTestSchoolAdmin()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
