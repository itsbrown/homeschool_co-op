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

  // School management methods
  async getSchoolById(id: number): Promise<any | undefined> {
    const { data, error } = await supabase
      .from('schools.schools')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error fetching school by id:', error);
      return undefined;
    }
    
    return data;
  }

  async updateSchool(id: number, schoolData: any): Promise<any | undefined> {
    const { data, error } = await supabase
      .from('schools.schools')
      .update({
        ...schoolData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating school:', error);
      return undefined;
    }
    
    return data;
  }

  async getSchoolsByAdminId(adminId: number): Promise<any[]> {
    const { data, error } = await supabase
      .from('schools.schools')
      .select('*')
      .eq('created_by', adminId);
    
    if (error) {
      console.error('Error fetching schools by admin id:', error);
      return [];
    }
    
    return data || [];
  }

  // Child management methods
  async getChildById(id: number): Promise<any | undefined> {
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error fetching child:', error);
      return undefined;
    }
    
    return data;
  }

  async getChildrenByParentId(parentId: number): Promise<any[]> {
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('parent_id', parentId);
    
    if (error) {
      console.error('Error fetching children by parent id:', error);
      return [];
    }
    
    return data || [];
  }

  async getChildrenByParentEmail(parentEmail: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('parent_email', parentEmail);
    
    if (error) {
      console.error('Error fetching children by parent email:', error);
      return [];
    }
    
    return data || [];
  }

  async createChild(childData: any): Promise<any> {
    const { data, error } = await supabase
      .from('children')
      .insert(childData)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating child:', error);
      throw error;
    }
    
    return data;
  }

  // Stub implementations for other storage methods - implement as needed
  async getAllCurricula(): Promise<any[]> { return []; }
  async getAllKnowledgeBases(): Promise<any[]> { return []; }
  async getAllActivities(): Promise<any[]> { return []; }
  async getAllPayments(): Promise<any[]> { return []; }
  async getAllEnrollments(): Promise<any[]> { return []; }
  async getAllUsers(): Promise<any[]> { return []; }
  async getCurriculumById(id: number): Promise<any | undefined> { return undefined; }
  async getKnowledgeBaseById(id: number, userId: number): Promise<any | undefined> { return undefined; }
  async getActivityById(id: number, userId: number): Promise<any | undefined> { return undefined; }
  async createCurriculum(curriculum: any): Promise<any> { throw new Error('Not implemented'); }
  async createKnowledgeBase(knowledgeBase: any): Promise<any> { throw new Error('Not implemented'); }
  async createActivity(activity: any): Promise<any> { throw new Error('Not implemented'); }
  async updateCurriculum(id: number, curriculum: any): Promise<any> { throw new Error('Not implemented'); }
  async updateKnowledgeBase(id: number, knowledgeBase: any): Promise<any> { throw new Error('Not implemented'); }
  async updateActivity(id: number, activity: any): Promise<any> { throw new Error('Not implemented'); }
  async deleteCurriculum(id: number): Promise<void> { throw new Error('Not implemented'); }
  async deleteKnowledgeBase(id: number): Promise<void> { throw new Error('Not implemented'); }
  async deleteActivity(id: number): Promise<void> { throw new Error('Not implemented'); }
  
  // Add other missing methods as stubs
  async getCurricula(): Promise<any[]> { return []; }
  async getCurriculaByAuthor(authorId: number): Promise<any[]> { return []; }
  async getLesson(id: number): Promise<any | undefined> { return undefined; }
  async getLessonsByCurriculum(curriculumId: number): Promise<any[]> { return []; }
  async getLessonsByAuthor(authorId: number): Promise<any[]> { return []; }
  async createLesson(lesson: any): Promise<any> { throw new Error('Not implemented'); }
  async updateLesson(id: number, lesson: any): Promise<any> { throw new Error('Not implemented'); }
  async getEvent(id: number): Promise<any | undefined> { return undefined; }
  async getEventsByOrganizer(organizerId: number): Promise<any[]> { return []; }
  async getUpcomingEvents(userId: number): Promise<any[]> { return []; }
  async getAllEvents(userId: number): Promise<any[]> { return []; }
  async createEvent(event: any): Promise<any> { throw new Error('Not implemented'); }
  async getMarketplaceItem(id: number): Promise<any | undefined> { return undefined; }
  async getMarketplaceItemsBySeller(sellerId: number): Promise<any[]> { return []; }
  async getTopSellingItems(limit: number): Promise<any[]> { return []; }
  async createMarketplaceItem(item: any): Promise<any> { throw new Error('Not implemented'); }
  async updateMarketplaceItemStats(id: number, sales: number, revenue: number): Promise<any> { throw new Error('Not implemented'); }
  async getKnowledgeBase(id: number): Promise<any | undefined> { return undefined; }
  async getActivitiesByAuthor(authorId: number): Promise<any[]> { return []; }
  async updateActivityDownloadCount(id: number): Promise<any> { throw new Error('Not implemented'); }
  async updateActivityPdfUrl(id: number, pdfUrl: string): Promise<any> { throw new Error('Not implemented'); }
  async getKnowledgeBasesByAuthor(authorId: number): Promise<any[]> { return []; }
  async getKnowledgeBasesBySubject(subject: string): Promise<any[]> { return []; }
  async getPublicKnowledgeBases(limit?: number): Promise<any[]> { return []; }
  async incrementDownloadCount(id: number): Promise<any> { throw new Error('Not implemented'); }
  async addPurchaser(id: number, userId: number): Promise<any> { throw new Error('Not implemented'); }
  async updateChild(id: number, childData: any): Promise<any> { throw new Error('Not implemented'); }
  async deleteChild(id: number): Promise<void> { throw new Error('Not implemented'); }
  async getEmergencyContactsByChildId(childId: number): Promise<any[]> { return []; }
  async createEmergencyContact(contact: any): Promise<any> { throw new Error('Not implemented'); }
  async updateEmergencyContact(id: number, contact: any): Promise<any> { throw new Error('Not implemented'); }
  async deleteEmergencyContact(id: number): Promise<void> { throw new Error('Not implemented'); }
  async getPrograms(): Promise<any[]> { return []; }
  async getProgramById(id: number): Promise<any | undefined> { return undefined; }
  async getProgramsBySchoolId(schoolId: number): Promise<any[]> { return []; }
  async createProgram(program: any): Promise<any> { throw new Error('Not implemented'); }
  async updateProgram(id: number, program: any): Promise<any> { throw new Error('Not implemented'); }
  async deleteProgram(id: number): Promise<void> { throw new Error('Not implemented'); }
  async getEnrollmentsByChildId(childId: number): Promise<any[]> { return []; }
  async getEnrollmentsByProgramId(programId: number): Promise<any[]> { return []; }
  async createEnrollment(enrollment: any): Promise<any> { throw new Error('Not implemented'); }
  async updateEnrollment(id: number, enrollment: any): Promise<any> { throw new Error('Not implemented'); }
  async deleteEnrollment(id: number): Promise<void> { throw new Error('Not implemented'); }
  async getClasses(): Promise<any[]> { return []; }
  async getClassById(id: number): Promise<any | undefined> { return undefined; }
  async getClassesByInstructorId(instructorId: number): Promise<any[]> { return []; }
  async getClassesBySchoolId(schoolId: number): Promise<any[]> { return []; }
  async createClass(classData: any): Promise<any> { throw new Error('Not implemented'); }
  async updateClass(id: number, classData: any): Promise<any> { throw new Error('Not implemented'); }
  async deleteClass(id: number): Promise<void> { throw new Error('Not implemented'); }
  async createRoleInvitation(invitation: any): Promise<any> { throw new Error('Not implemented'); }
  async getRoleInvitationsByEmail(email: string): Promise<any[]> { return []; }
  async getRoleInvitationById(id: number): Promise<any | undefined> { return undefined; }
  async updateRoleInvitation(id: number, invitation: any): Promise<any> { throw new Error('Not implemented'); }
  async deleteRoleInvitation(id: number): Promise<void> { throw new Error('Not implemented'); }
}

export const supabaseStorage = new SupabaseStorage();