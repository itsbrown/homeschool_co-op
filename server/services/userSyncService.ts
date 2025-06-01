
import { supabase } from '../lib/supabase';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

export class UserSyncService {
  /**
   * Sync a Supabase user with our database
   */
  static async syncUser(supabaseUser: any, additionalData?: Partial<typeof users.$inferInsert>) {
    try {
      // Check if user exists in our database
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.supabaseId, supabaseUser.id))
        .limit(1);

      if (existingUser) {
        // Update existing user
        await db
          .update(users)
          .set({
            email: supabaseUser.email,
            lastLogin: new Date(),
            updatedAt: new Date(),
            ...additionalData
          })
          .where(eq(users.supabaseId, supabaseUser.id));
        
        return existingUser;
      } else {
        // Create new user
        const [newUser] = await db
          .insert(users)
          .values({
            supabaseId: supabaseUser.id,
            email: supabaseUser.email!,
            username: supabaseUser.email!.split('@')[0],
            name: supabaseUser.user_metadata?.name || supabaseUser.email!.split('@')[0],
            password: '', // Not used with Supabase auth
            role: 'student', // Default role
            lastLogin: new Date(),
            ...additionalData
          })
          .returning();

        return newUser;
      }
    } catch (error) {
      console.error('Error syncing user:', error);
      throw error;
    }
  }

  /**
   * Update user role
   */
  static async updateUserRole(supabaseId: string, role: string, schoolId?: number) {
    await db
      .update(users)
      .set({ 
        role,
        schoolId,
        updatedAt: new Date()
      })
      .where(eq(users.supabaseId, supabaseId));
  }

  /**
   * Get user by Supabase ID
   */
  static async getUserBySupabaseId(supabaseId: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.supabaseId, supabaseId))
      .limit(1);
    
    return user;
  }
}
