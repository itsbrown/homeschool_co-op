import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { schoolStaff, users } from '@shared/schema';

export interface StaffMember {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  role: string; // position from school_staff
  department: string | null;
  status: string; // 'Active' or 'Inactive' based on isActive
  joinDate: string;
  avatar?: string;
  phone?: string;
  subjects?: string[];
  locationId?: number | null;
  classIds?: string[];
  userId: number;
}

export async function getAllStaffForSchool(schoolId: number): Promise<StaffMember[]> {
  try {
    const db = await getDb();
    const staffRecords = await db
      .select({
        staffId: schoolStaff.id,
        userId: schoolStaff.userId,
        position: schoolStaff.position,
        department: schoolStaff.department,
        startDate: schoolStaff.startDate,
        locationId: schoolStaff.locationId,
        isActive: schoolStaff.isActive,
        permissions: schoolStaff.permissions,
        userEmail: users.email,
        userName: users.name,
      })
      .from(schoolStaff)
      .innerJoin(users, eq(schoolStaff.userId, users.id))
      .where(eq(schoolStaff.schoolId, schoolId));

    return staffRecords.map(record => {
      const permissions = record.permissions as any || {};
      const nameParts = record.userName.split(' ');
      
      return {
        id: record.staffId,
        email: record.userEmail,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        name: record.userName,
        role: record.position,
        department: record.department || '',
        status: record.isActive ? 'Active' : 'Inactive',
        joinDate: record.startDate.toISOString().split('T')[0],
        avatar: permissions.avatar || '',
        phone: permissions.phone || '',
        subjects: permissions.subjects || [],
        locationId: record.locationId,
        classIds: permissions.classIds || [],
        userId: record.userId
      };
    });
  } catch (error) {
    console.error('Error fetching staff from database:', error);
    throw error;
  }
}

export async function getStaffById(staffId: number): Promise<StaffMember | null> {
  try {
    const db = await getDb();
    const [record] = await db
      .select({
        staffId: schoolStaff.id,
        userId: schoolStaff.userId,
        position: schoolStaff.position,
        department: schoolStaff.department,
        startDate: schoolStaff.startDate,
        locationId: schoolStaff.locationId,
        isActive: schoolStaff.isActive,
        permissions: schoolStaff.permissions,
        userEmail: users.email,
        userName: users.name,
      })
      .from(schoolStaff)
      .innerJoin(users, eq(schoolStaff.userId, users.id))
      .where(eq(schoolStaff.id, staffId));

    if (!record) return null;

    const permissions = record.permissions as any || {};
    const nameParts = record.userName.split(' ');
    
    return {
      id: record.staffId,
      email: record.userEmail,
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      name: record.userName,
      role: record.position,
      department: record.department || '',
      status: record.isActive ? 'Active' : 'Inactive',
      joinDate: record.startDate.toISOString().split('T')[0],
      avatar: permissions.avatar || '',
      phone: permissions.phone || '',
      subjects: permissions.subjects || [],
      locationId: record.locationId,
      classIds: permissions.classIds || [],
      userId: record.userId
    };
  } catch (error) {
    console.error('Error fetching staff by ID from database:', error);
    throw error;
  }
}

export async function deleteStaff(staffId: number): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(schoolStaff).where(eq(schoolStaff.id, staffId));
  } catch (error) {
    console.error('Error deleting staff from database:', error);
    throw error;
  }
}

export async function updateStaffClassIds(staffId: number, classIds: string[]): Promise<void> {
  try {
    const db = await getDb();
    const [staff] = await db.select().from(schoolStaff).where(eq(schoolStaff.id, staffId));
    
    if (staff) {
      const permissions = (staff.permissions as any) || {};
      permissions.classIds = classIds;
      
      await db
        .update(schoolStaff)
        .set({ permissions, updatedAt: new Date() })
        .where(eq(schoolStaff.id, staffId));
    }
  } catch (error) {
    console.error('Error updating staff class IDs:', error);
    throw error;
  }
}
