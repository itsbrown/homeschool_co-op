
import { supabase } from '../lib/supabase';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

export class UserSyncService {
  /**
   * Sync an Auth0 user with our database
   */
  static async syncAuth0User(auth0User: any, additionalData?: Partial<typeof users.$inferInsert>) {
    try {
      console.log('🔄 Syncing Auth0 user:', auth0User.email);
      
      // Check if user exists in our database by email
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, auth0User.email))
        .limit(1);

      if (existingUser) {
        // Update existing user with Auth0 data
        const [updatedUser] = await db
          .update(users)
          .set({
            name: auth0User.name || auth0User.nickname || existingUser.name,
            lastLogin: new Date(),
            updatedAt: new Date(),
            auth0Id: auth0User.sub,
            avatar: auth0User.picture,
            isActive: true,
            ...additionalData
          })
          .where(eq(users.email, auth0User.email))
          .returning();
        
        console.log('✅ Updated existing user:', updatedUser.email);
        return updatedUser;
      } else {
        // Create new user from Auth0 data
        const defaultRole = this.determineDefaultRole(auth0User.email);
        
        const [newUser] = await db
          .insert(users)
          .values({
            auth0Id: auth0User.sub,
            email: auth0User.email,
            username: auth0User.nickname || auth0User.email.split('@')[0],
            name: auth0User.name || auth0User.nickname || auth0User.email.split('@')[0],
            password: '', // Not used with Auth0
            role: defaultRole,
            avatar: auth0User.picture,
            lastLogin: new Date(),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...additionalData
          })
          .returning();

        console.log('✅ Created new user:', newUser.email, 'with role:', newUser.role);
        return newUser;
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
    const [updatedUser] = await db
      .update(users)
      .set({ 
        role,
        schoolId,
        updatedAt: new Date()
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
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.auth0Id, auth0Id))
      .limit(1);
    
    return user;
  }

  /**
   * Get user by email
   */
  static async getUserByEmail(email: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    
    return user;
  }

  /**
   * Get all users with pagination
   */
  static async getUsers(offset = 0, limit = 50) {
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
        createdAt: users.createdAt
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
    const [deactivatedUser] = await db
      .update(users)
      .set({ 
        isActive: false,
        updatedAt: new Date()
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
      'superAdmin': ['admin', 'schoolAdmin', 'educator', 'teacher', 'parent', 'student', 'learner'],
      'admin': ['schoolAdmin', 'educator', 'teacher', 'parent', 'student', 'learner'],
      'schoolAdmin': ['educator', 'teacher', 'parent', 'student', 'learner'],
      'educator': ['parent', 'student', 'learner'],
      'teacher': ['parent', 'student', 'learner'],
      'parent': ['student', 'learner'],
      'student': [],
      'learner': []
    };

    // Check direct role match
    if (requiredRoles.includes(userRole)) {
      return true;
    }

    // Check hierarchical permissions
    const userPermissions = roleHierarchy[userRole as keyof typeof roleHierarchy] || [];
    return requiredRoles.some(role => userPermissions.includes(role));
  }
}
