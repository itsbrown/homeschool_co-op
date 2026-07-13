import { getDb } from '../db';
import { users } from '../../shared/schema';
import { eq, or, sql } from 'drizzle-orm';

type DbUser = typeof users.$inferSelect;

export class UserSyncService {
  /**
   * Sync a Supabase/Auth0 user with our database.
   *
   * Lookup order (important for E2E seeds + users_email_lower_idx):
   * 1. supabaseId / auth0Id (UUID from token)
   * 2. case-insensitive email (matches UNIQUE INDEX on LOWER(email))
   *
   * Case-sensitive email equality alone causes insert races: seed creates
   * `Admin@x.com`, token has `admin@x.com`, lookup misses, INSERT hits
   * users_email_lower_idx.
   */
  static async syncAuth0User(auth0User: any, additionalData?: Partial<typeof users.$inferInsert>) {
    try {
      console.log('🔄 Syncing Auth0 user:', auth0User.email);

      const db = await getDb();
      const supabaseUuid: string | undefined =
        (typeof auth0User.id === 'string' && auth0User.id) ||
        (typeof auth0User.sub === 'string' && auth0User.sub) ||
        undefined;
      const email: string | undefined =
        typeof auth0User.email === 'string' ? auth0User.email : undefined;

      let existingUser: DbUser | undefined;

      if (supabaseUuid) {
        const [byId] = await db
          .select()
          .from(users)
          .where(
            or(eq(users.supabaseId, supabaseUuid), eq(users.auth0Id, supabaseUuid)),
          )
          .limit(1);
        existingUser = byId;
      }

      if (!existingUser && email) {
        const [byEmail] = await db
          .select()
          .from(users)
          .where(sql`LOWER(${users.email}) = LOWER(${email})`)
          .limit(1);
        existingUser = byEmail;
      }

      const filteredData: Record<string, unknown> = {};
      if (additionalData) {
        Object.keys(additionalData).forEach((key) => {
          if (key !== 'firstName' && key !== 'lastName') {
            filteredData[key] = additionalData[key as keyof typeof additionalData];
          }
        });
      }

      if (existingUser) {
        const updateData: any = {
          name: auth0User.name || auth0User.nickname || existingUser.name,
          lastLogin: new Date(),
          updatedAt: new Date(),
          isActive: true,
          ...filteredData,
        };

        if (supabaseUuid) {
          updateData.auth0Id = supabaseUuid;
          updateData.supabaseId = supabaseUuid;
        }
        if (auth0User.picture) {
          updateData.avatar = auth0User.picture;
        }

        // Never overwrite existing schoolId with null/undefined
        if (existingUser.schoolId && !updateData.schoolId) {
          updateData.schoolId = existingUser.schoolId;
          console.log(
            '🏫 Preserving existing schoolId:',
            existingUser.schoolId,
            'for user:',
            existingUser.email,
          );
        }

        const [updatedUser] = await db
          .update(users)
          .set(updateData)
          .where(eq(users.id, existingUser.id))
          .returning();

        console.log('✅ Updated existing user:', updatedUser.email);
        return updatedUser;
      }

      if (!email) {
        throw new Error('Cannot sync auth user without email or id');
      }

      const defaultRole = this.determineDefaultRole(email);

      try {
        const [newUser] = await db
          .insert(users)
          .values({
            auth0Id: supabaseUuid || null,
            supabaseId: supabaseUuid || null,
            email,
            username: auth0User.nickname || email.split('@')[0],
            name: auth0User.name || auth0User.nickname || email.split('@')[0],
            password: '', // Not used with Auth0/Supabase
            role: defaultRole,
            avatar: auth0User.picture,
            lastLogin: new Date(),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...filteredData,
          })
          .returning();

        console.log('✅ Created new user:', newUser.email, 'with role:', newUser.role);
        return newUser;
      } catch (insertError: any) {
        // Race / case-insensitive unique: another row won — re-lookup and update
        const isUnique =
          insertError?.code === '23505' ||
          String(insertError?.constraint_name || insertError?.message || '').includes(
            'users_email_lower',
          );
        if (!isUnique) throw insertError;

        console.warn(
          '⚠️ Insert hit email unique index; re-looking up existing user for',
          email,
        );
        const [raced] = await db
          .select()
          .from(users)
          .where(sql`LOWER(${users.email}) = LOWER(${email})`)
          .limit(1);
        if (!raced) throw insertError;

        const [updatedUser] = await db
          .update(users)
          .set({
            lastLogin: new Date(),
            updatedAt: new Date(),
            isActive: true,
            ...(supabaseUuid
              ? { auth0Id: supabaseUuid, supabaseId: supabaseUuid }
              : {}),
            ...filteredData,
          })
          .where(eq(users.id, raced.id))
          .returning();
        return updatedUser;
      }
    } catch (error) {
      console.error('❌ Error syncing Auth0 user:', error);
      throw error;
    }
  }

  /**
   * Determine default role based on email domain or specific rules
   */
  static determineDefaultRole(email: string): string {
    // Specific email overrides
    if (email === 'contact.americanseekersacademy@gmail.com') {
      return 'schoolAdmin';
    }

    // Multi-role users (can switch roles)
    const multiRoleUsers = ['coreycreates@gmail.com'];
    if (multiRoleUsers.includes(email)) {
      return 'parent'; // Default role for multi-role users
    }

    // Domain-based rules
    if (email.includes('admin') || email.includes('staff')) {
      return 'admin';
    }

    if (email.endsWith('@americanseekersacademy.com')) {
      return 'educator';
    }

    // Default role
    return 'parent';
  }

  /**
   * Update user role
   */
  static async updateUserRole(auth0Id: string, role: string, schoolId?: number) {
    const db = await getDb();
    const [updatedUser] = await db
      .update(users)
      .set({
        role,
        schoolId,
        updatedAt: new Date(),
      })
      .where(eq(users.auth0Id, auth0Id))
      .returning();

    console.log('🔄 Updated user role:', updatedUser.email, 'to', role);
    return updatedUser;
  }

  /**
   * Get user by Auth0 ID
   */
  static async getUserByAuth0Id(auth0Id: string) {
    const db = await getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.auth0Id, auth0Id))
      .limit(1);

    return user;
  }

  /**
   * Get user by email (case-insensitive — matches users_email_lower_idx)
   */
  static async getUserByEmail(email: string) {
    const db = await getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(sql`LOWER(${users.email}) = LOWER(${email})`)
      .limit(1);

    return user;
  }

  /**
   * Get all users with pagination
   */
  static async getUsers(offset = 0, limit = 50) {
    const db = await getDb();
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        username: users.username,
        role: users.role,
        avatar: users.avatar,
        isActive: users.isActive,
        lastLogin: users.lastLogin,
        createdAt: users.createdAt,
      })
      .from(users)
      .offset(offset)
      .limit(limit);

    return allUsers;
  }

  /**
   * Deactivate user (soft delete)
   */
  static async deactivateUser(auth0Id: string) {
    const db = await getDb();
    const [deactivatedUser] = await db
      .update(users)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(users.auth0Id, auth0Id))
      .returning();

    return deactivatedUser;
  }

  /**
   * Check if user has specific permission
   */
  static hasPermission(userRole: string, requiredRoles: string[]): boolean {
    // Role hierarchy
    const roleHierarchy = {
      superAdmin: ['admin', 'schoolAdmin', 'educator', 'teacher', 'parent', 'student', 'learner'],
      admin: ['schoolAdmin', 'educator', 'teacher', 'parent', 'student', 'learner'],
      schoolAdmin: ['educator', 'teacher', 'parent', 'student', 'learner'],
      educator: ['parent', 'student', 'learner'],
      teacher: ['parent', 'student', 'learner'],
      parent: ['student', 'learner'],
      student: [],
      learner: [],
    };

    // Check direct role match
    if (requiredRoles.includes(userRole)) {
      return true;
    }

    // Check hierarchical permissions
    const userPermissions = roleHierarchy[userRole as keyof typeof roleHierarchy] || [];
    return requiredRoles.some((role) => userPermissions.includes(role as any));
  }
}
