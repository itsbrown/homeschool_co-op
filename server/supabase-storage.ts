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

  async getActiveRoleInvitation(tokenOrEmail: string): Promise<RoleInvitation | undefined> {
    // Try to find by token first (most common case for validation)
    let { data, error } = await supabase
      .from('role_invitations')
      .select('*')
      .eq('token', tokenOrEmail)
      .eq('is_active', true)
      .is('used_at', null)
      .maybeSingle();
    
    // If not found by token, try by email (for check-invitation endpoint)
    if (!data && !error) {
      const emailResult = await supabase
        .from('role_invitations')
        .select('*')
        .eq('email', tokenOrEmail)
        .eq('is_active', true)
        .is('used_at', null)
        .maybeSingle();
      
      data = emailResult.data;
      error = emailResult.error;
    }
    
    if (error) {
      console.error('Error fetching active role invitation:', error);
      return undefined;
    }
    
    return data || undefined;
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
    const { data, error} = await supabase
      .from('schools.schools')
      .select('*')
      .eq('created_by', adminId);
    
    if (error) {
      console.error('Error fetching schools by admin id:', error);
      return [];
    }
    
    return data || [];
  }

  // School Application management methods
  async getSchoolApplicationById(id: number): Promise<any | undefined> {
    const { data, error } = await supabase
      .from('school_applications')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error fetching school application:', error);
      return undefined;
    }
    
    return data;
  }

  async getSchoolApplicationByEmail(email: string): Promise<any | undefined> {
    const { data, error } = await supabase
      .from('school_applications')
      .select('*')
      .eq('admin_email', email)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      console.error('Error fetching school application by email:', error);
      return undefined;
    }
    
    return data;
  }

  async getAllSchoolApplications(): Promise<any[]> {
    const { data, error } = await supabase
      .from('school_applications')
      .select('*')
      .order('submitted_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching school applications:', error);
      return [];
    }
    
    return data || [];
  }

  async getSchoolApplicationsByStatus(status: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('school_applications')
      .select('*')
      .eq('status', status)
      .order('submitted_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching school applications by status:', error);
      return [];
    }
    
    return data || [];
  }

  async createSchoolApplication(applicationData: any): Promise<any> {
    const { data, error } = await supabase
      .from('school_applications')
      .insert(applicationData)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating school application:', error);
      throw error;
    }
    
    return data;
  }

  async updateSchoolApplicationStatus(id: number, status: string, reviewedBy?: string, reviewNotes?: string): Promise<any | undefined> {
    const updateData: any = {
      status,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    if (reviewedBy) updateData.reviewed_by = reviewedBy;
    if (reviewNotes) updateData.review_notes = reviewNotes;
    
    const { data, error } = await supabase
      .from('school_applications')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating school application status:', error);
      return undefined;
    }
    
    return data;
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
    console.log('🔍 Supabase getChildrenByParentEmail called for:', parentEmail);
    
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('parent_email', parentEmail);
    
    if (error) {
      console.error('❌ Supabase error fetching children by parent email:', error);
      return [];
    }
    
    console.log('📊 Raw Supabase children data:', data);
    
    if (!data || data.length === 0) {
      console.log('📊 No children found in Supabase for parent:', parentEmail);
      return [];
    }
    
    // Map field names from database to expected format
    const mappedChildren = data.map(child => ({
      id: child.id,
      firstName: child.first_name,
      lastName: child.last_name,
      birthdate: child.birthdate,
      gradeLevel: child.grade_level,
      gender: child.gender,
      parentEmail: child.parent_email,
      parentPhone: child.parent_phone,
      interests: child.interests,
      learningStyle: child.learning_style,
      specialNeeds: child.special_needs,
      allergies: child.allergies,
      medicalInfo: child.medical_info,
      school: child.school,
      profileImage: child.profile_image,
      emergencyContact: child.emergency_contact,
      emergencyPhone: child.emergency_phone,
      createdAt: child.created_at,
      updatedAt: child.updated_at
    }));
    
    console.log('📊 Mapped children data:', mappedChildren);
    return mappedChildren;
  }

  async createChild(childData: any): Promise<any> {
    console.log('📝 Supabase createChild called with data:', childData);
    
    // Map field names to match database schema
    const mappedData = {
      first_name: childData.firstName,
      last_name: childData.lastName,
      birthdate: childData.birthdate,
      grade_level: childData.gradeLevel,
      gender: childData.gender,
      parent_email: childData.parentEmail,
      parent_phone: childData.parentPhone,
      interests: childData.interests,
      learning_style: childData.learningStyle,
      special_needs: childData.specialNeeds,
      allergies: childData.allergies,
      medical_info: childData.medicalInfo,
      school: childData.school,
      profile_image: childData.profileImage,
      emergency_contact: childData.emergencyContact,
      emergency_phone: childData.emergencyPhone,
      created_at: childData.createdAt || new Date().toISOString(),
      updated_at: childData.updatedAt || new Date().toISOString()
    };
    
    console.log('📝 Mapped data for Supabase:', mappedData);
    
    const { data, error } = await supabase
      .from('children')
      .insert(mappedData)
      .select()
      .single();
    
    if (error) {
      console.error('❌ Supabase error creating child:', error);
      throw new Error(`Failed to create child: ${error.message}`);
    }
    
    console.log('✅ Child created in Supabase:', data);
    
    // Map back to expected format
    return {
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      birthdate: data.birthdate,
      gradeLevel: data.grade_level,
      gender: data.gender,
      parentEmail: data.parent_email,
      parentPhone: data.parent_phone,
      interests: data.interests,
      learningStyle: data.learning_style,
      specialNeeds: data.special_needs,
      allergies: data.allergies,
      medicalInfo: data.medical_info,
      school: data.school,
      profileImage: data.profile_image,
      emergencyContact: data.emergency_contact,
      emergencyPhone: data.emergency_phone,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  // Stub implementations for other storage methods - implement as needed
  async getAllCurricula(): Promise<any[]> { return []; }
  async getAllKnowledgeBases(): Promise<any[]> { return []; }
  async getAllActivities(): Promise<any[]> { return []; }
  async getAllPayments(): Promise<any[]> { return []; }
  async getAllEnrollments(): Promise<any[]> { return []; }
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
  async getEnrollmentsByChildId(childId: number): Promise<any[]> { return []; }
  async getEnrollmentsByProgramId(programId: number): Promise<any[]> { return []; }
  async createEnrollment(enrollment: any): Promise<any> { throw new Error('Not implemented'); }
  async updateEnrollment(enrollment: any): Promise<any> {
    // Since we're using file-based storage fallback, this should not be called
    // But provide a proper implementation for consistency
    console.log('SupabaseStorage updateEnrollment called - falling back to file storage');
    throw new Error('updateEnrollment not implemented in SupabaseStorage - using file storage fallback');
  }
  async deleteEnrollment(id: number): Promise<void> { throw new Error('Not implemented'); }
  async getClasses(): Promise<any[]> { return []; }
  async getClassById(id: number): Promise<any | undefined> { return undefined; }
  async getClassesByInstructorId(instructorId: number): Promise<any[]> { return []; }
  async getClassesBySchoolId(schoolId: number): Promise<any[]> { return []; }
  async createClass(classData: any): Promise<any> { throw new Error('Not implemented'); }
  async updateClass(id: number, classData: any): Promise<any> { throw new Error('Not implemented'); }
  async deleteClass(id: number): Promise<void> { throw new Error('Not implemented'); }
  // Program methods - temporary implementations to fix 500 errors
  async getPublishedPrograms(category?: string, gradeLevel?: string): Promise<any[]> {
    console.log('Supabase getPublishedPrograms called with:', { category, gradeLevel });
    // Return empty array for now to prevent 500 errors
    return [];
  }
  
  async getProgramById(id: number): Promise<any | undefined> {
    console.log('Supabase getProgramById called with id:', id);
    return undefined;
  }
  
  async getProgramsBySchoolId(schoolId: number): Promise<any[]> {
    console.log('Supabase getProgramsBySchoolId called with schoolId:', schoolId);
    return [];
  }
  
  async createProgram(program: any): Promise<any> {
    throw new Error('Program creation not implemented in Supabase storage');
  }
  
  async updateProgram(id: number, program: any): Promise<any> {
    throw new Error('Program update not implemented in Supabase storage');
  }
  
  async deleteProgram(id: number): Promise<void> {
    throw new Error('Program deletion not implemented in Supabase storage');
  }

  // Role invitation helper methods
  async getRoleInvitationsByEmail(email: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('role_invitations')
      .select('*')
      .eq('email', email);
    
    if (error) {
      console.error('Error fetching role invitations by email:', error);
      return [];
    }
    
    return data || [];
  }
  
  async getRoleInvitationById(id: number): Promise<any | undefined> {
    const { data, error } = await supabase
      .from('role_invitations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    
    if (error) {
      console.error('Error fetching role invitation by id:', error);
      return undefined;
    }
    
    return data || undefined;
  }
  
  async updateRoleInvitation(id: number, invitation: any): Promise<any> {
    // Map camelCase to snake_case for Supabase
    const updateData: any = {};
    if (invitation.expiresAt !== undefined) updateData.expires_at = invitation.expiresAt instanceof Date ? invitation.expiresAt.toISOString() : invitation.expiresAt;
    if (invitation.isActive !== undefined) updateData.is_active = invitation.isActive;
    if (invitation.usedAt !== undefined) updateData.used_at = invitation.usedAt;
    if (invitation.lastSentAt !== undefined) updateData.last_sent_at = invitation.lastSentAt;
    
    console.log('📝 Updating role invitation:', id, 'with:', updateData);
    
    const { data, error } = await supabase
      .from('role_invitations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating role invitation:', error);
      throw error;
    }
    
    console.log('✅ Role invitation updated:', data);
    
    // Map snake_case back to camelCase for callers
    return {
      id: data.id,
      email: data.email,
      role: data.role,
      token: data.token,
      invitedBy: data.invited_by,
      schoolId: data.school_id,
      isActive: data.is_active,
      usedAt: data.used_at,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
      lastSentAt: data.last_sent_at
    };
  }
  
  async deleteRoleInvitation(id: number): Promise<void> {
    const { error } = await supabase
      .from('role_invitations')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting role invitation:', error);
      throw error;
    }
  }
}

export const supabaseStorage = new SupabaseStorage();