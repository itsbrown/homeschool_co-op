import { supabase, supabaseAdmin, DatabaseUser, RoleInvitation } from './db/supabase';
import { IStorage } from './storage';

export class SupabaseStorage implements IStorage {
  // User management methods
  async getUser(id: number): Promise<any | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error fetching user:', error);
      return undefined;
    }
    
    return data;
  }

  async getUserByUsername(username: string): Promise<any | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (error) {
      console.error('Error fetching user by username:', error);
      return undefined;
    }
    
    return data;
  }

  async getUserByEmail(email: string): Promise<DatabaseUser | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error) {
      console.error('Error fetching user by email:', error);
      return undefined;
    }
    
    return data;
  }

  async createUser(userData: any): Promise<any> {
    const { data, error } = await supabase
      .from('users')
      .insert(userData)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating user:', error);
      throw error;
    }
    
    return data;
  }

  async updateUser(id: string, userData: Partial<DatabaseUser>): Promise<DatabaseUser> {
    const { data, error } = await supabase
      .from('users')
      .update(userData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating user:', error);
      throw error;
    }
    
    return data;
  }

  // Role invitation methods
  async createRoleInvitation(invitation: {
    email: string;
    role: string;
    token: string;
    invited_by: string;
    expires_at: string;
  }): Promise<RoleInvitation> {
    const { data, error } = await supabase
      .from('role_invitations')
      .insert(invitation)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating role invitation:', error);
      throw error;
    }
    
    return data;
  }

  async getRoleInvitations(): Promise<RoleInvitation[]> {
    const { data, error } = await supabase
      .from('role_invitations')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching role invitations:', error);
      return [];
    }
    
    return data || [];
  }

  async getActiveRoleInvitation(token: string): Promise<RoleInvitation | null> {
    const { data, error } = await supabase
      .from('role_invitations')
      .select('*')
      .eq('token', token)
      .eq('is_active', true)
      .is('used_at', null)
      .single();
    
    if (error) {
      console.error('Error fetching active role invitation:', error);
      return null;
    }
    
    return data;
  }

  async acceptRoleInvitation(token: string): Promise<void> {
    const { error } = await supabase
      .from('role_invitations')
      .update({ 
        used_at: new Date().toISOString(),
        is_active: false
      })
      .eq('token', token);
    
    if (error) {
      console.error('Error accepting role invitation:', error);
      throw error;
    }
  }

  async revokeRoleInvitation(id: number): Promise<void> {
    const { error } = await supabase
      .from('role_invitations')
      .update({ is_active: false })
      .eq('id', id);
    
    if (error) {
      console.error('Error revoking role invitation:', error);
      throw error;
    }
  }

  // Get all users for admin purposes
  async getAllUsers(): Promise<any[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching all users:', error);
      return [];
    }
    
    return data || [];
  }

  // Stub implementations for other storage methods - implement as needed
  async getAllCurricula(): Promise<any[]> { return []; }
  async getAllKnowledgeBases(): Promise<any[]> { return []; }
  async getAllActivities(): Promise<any[]> { return []; }
  async getCurriculumById(id: number): Promise<any | undefined> { return undefined; }
  async getKnowledgeBaseById(id: number): Promise<any | undefined> { return undefined; }
  async getActivityById(id: number): Promise<any | undefined> { return undefined; }
  async createCurriculum(curriculum: any): Promise<any> { throw new Error('Not implemented'); }
  async createKnowledgeBase(knowledgeBase: any): Promise<any> { throw new Error('Not implemented'); }
  async createActivity(activity: any): Promise<any> { throw new Error('Not implemented'); }
  async updateCurriculum(id: number, curriculum: any): Promise<any> { throw new Error('Not implemented'); }
  async updateKnowledgeBase(id: number, knowledgeBase: any): Promise<any> { throw new Error('Not implemented'); }
  async updateActivity(id: number, activity: any): Promise<any> { throw new Error('Not implemented'); }
  async deleteCurriculum(id: number): Promise<void> { throw new Error('Not implemented'); }
  async deleteKnowledgeBase(id: number): Promise<void> { throw new Error('Not implemented'); }
  async deleteActivity(id: number): Promise<void> { throw new Error('Not implemented'); }
}

export const supabaseStorage = new SupabaseStorage();