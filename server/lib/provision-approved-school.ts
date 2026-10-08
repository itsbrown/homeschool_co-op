import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import type { SchoolApplication } from '@shared/schema';
import { storage } from '../storage';
import { insertSchoolCore } from './school-db';
import { generateUniqueRegistrationCode } from './school-registration-code';
import { sendAccountInviteEmail } from './email-service';
import { writeSchoolPlatform } from './platform-school-billing';

function mapSchoolType(schoolType: string): 'school' | 'co-op' | 'homeschool_group' | 'other' {
  if (schoolType === 'homeschool_coop') return 'co-op';
  if (schoolType === 'public' || schoolType === 'private' || schoolType === 'charter') return 'school';
  return 'other';
}

async function linkSupabaseUser(email: string, password: string, schoolId: number, name: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key.startsWith('placeholder')) return null;
  try {
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: 'schoolAdmin', school_id: schoolId },
      user_metadata: { name },
    });
    if (!error && data.user?.id) return data.user.id;
    if (error && (error.message?.includes('already') || (error as { code?: string }).code === 'email_exists')) {
      return null;
    }
    console.error('School admin Supabase create failed:', error?.message);
    return null;
  } catch (error) {
    console.error('School admin Supabase create threw:', error);
    return null;
  }
}

export type ProvisionResult = {
  schoolId: number;
  userId: number;
  registrationCode: string;
  createdUser: boolean;
  inviteSent: boolean;
};

/**
 * Create the school, registration code, and schoolAdmin role for the applicant.
 * Does not change an existing user's school or role, so an ASA parent who applies
 * keeps their family account and gains schoolAdmin only on the new school.
 */
export async function provisionApprovedSchool(application: SchoolApplication): Promise<ProvisionResult> {
  if (application.schoolId) {
    const existing = await storage.getSchool(application.schoolId);
    return {
      schoolId: application.schoolId,
      userId: existing?.adminId ?? 0,
      registrationCode: existing?.registrationCode ?? '',
      createdUser: false,
      inviteSent: false,
    };
  }

  const email = application.adminEmail.trim();
  let user = await storage.getUserByEmail(email);
  const createdUser = !user;
  const temporaryPassword = randomBytes(9).toString('base64url');

  if (!user) {
    const hashed = await bcrypt.hash(temporaryPassword, 10);
    user = await storage.createUser({
      email,
      username: email,
      password: hashed,
      name: `${application.adminFirstName} ${application.adminLastName}`.trim(),
      firstName: application.adminFirstName,
      lastName: application.adminLastName,
      phone: application.adminPhone,
      role: 'schoolAdmin',
      isActive: true,
      schoolId: null,
    });
  }

  const registrationCode = await generateUniqueRegistrationCode();
  const school = await insertSchoolCore({
    name: application.schoolName,
    type: mapSchoolType(application.schoolType),
    adminId: user.id,
    address: application.address,
    city: application.city,
    state: application.state,
    zipCode: application.zipCode,
    phoneNumber: application.adminPhone,
    email,
    website: application.website || null,
    description: null,
    foundedYear: application.establishedYear,
    enrollmentSize: application.currentStudentCount,
    registrationCode,
    status: 'active',
  });

  try {
    await writeSchoolPlatform(school.id, { plan: 'starter', status: 'active' });
  } catch (error) {
    console.error('Could not set starter plan (migration 267 may be pending):', error);
  }

  const roles = await storage.getUserRolesByUserId(user.id);
  const already = roles.some((row) => row.role === 'schoolAdmin' && row.schoolId === school.id);
  if (!already) {
    await storage.createUserRole({
      userId: user.id,
      role: 'schoolAdmin',
      schoolId: school.id,
      isPrimary: createdUser,
    });
  }

  if (createdUser) {
    const supabaseId = await linkSupabaseUser(
      email,
      temporaryPassword,
      school.id,
      `${application.adminFirstName} ${application.adminLastName}`.trim(),
    );
    await storage.updateUser(user.id, {
      schoolId: school.id,
      role: 'schoolAdmin',
      activeRole: 'schoolAdmin',
      ...(supabaseId ? { supabaseId } : {}),
    });
  }

  let inviteSent = false;
  if (createdUser) {
    inviteSent = await sendAccountInviteEmail({
      email,
      firstName: application.adminFirstName,
      lastName: application.adminLastName,
      role: 'schoolAdmin',
      temporaryPassword,
    });
  }

  return {
    schoolId: school.id,
    userId: user.id,
    registrationCode,
    createdUser,
    inviteSent,
  };
}
