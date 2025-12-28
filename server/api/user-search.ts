import { Router } from 'express';
import { storage } from '../storage';
import { supabaseAuth } from '../middleware/supabase-auth';
import { z } from 'zod';

const router = Router();

const searchQuerySchema = z.object({
  query: z.string().optional().default(''),
  role: z.string().optional(),
  schoolId: z.union([z.string(), z.number()]).optional(),
  limit: z.union([z.string(), z.number()]).optional().default(20),
  offset: z.union([z.string(), z.number()]).optional().default(0),
});

router.get('/search', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const currentUser = await storage.getUserByEmail(userEmail);
    if (!currentUser) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    if (!['schoolAdmin', 'admin', 'superAdmin'].includes(currentUser.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions - admin access required' });
    }

    const params = searchQuerySchema.parse(req.query);
    const query = params.query.toLowerCase().trim();
    const roleFilter = params.role;
    const limit = Math.min(parseInt(String(params.limit)), 100);
    const offset = parseInt(String(params.offset));

    let effectiveSchoolId: number | null = null;
    
    if (currentUser.role === 'superAdmin' || currentUser.role === 'admin') {
      const requestedSchoolId = params.schoolId ? parseInt(String(params.schoolId)) : null;
      effectiveSchoolId = requestedSchoolId;
    } else if (currentUser.role === 'schoolAdmin') {
      if (!currentUser.schoolId) {
        return res.status(403).json({ success: false, error: 'School admin must have a school assigned' });
      }
      effectiveSchoolId = currentUser.schoolId;
    }

    const allUsers = await storage.getAllUsers();

    let filteredUsers = allUsers.filter((user: any) => {
      if (effectiveSchoolId !== null && user.schoolId !== effectiveSchoolId) {
        return false;
      }

      if (roleFilter && user.role !== roleFilter) return false;

      if (query) {
        const nameMatch = (user.name || '').toLowerCase().includes(query);
        const emailMatch = (user.email || '').toLowerCase().includes(query);
        const firstNameMatch = (user.firstName || '').toLowerCase().includes(query);
        const lastNameMatch = (user.lastName || '').toLowerCase().includes(query);
        
        if (!nameMatch && !emailMatch && !firstNameMatch && !lastNameMatch) {
          return false;
        }
      }

      return true;
    });

    filteredUsers.sort((a: any, b: any) => {
      const aName = (a.name || a.email || '').toLowerCase();
      const bName = (b.name || b.email || '').toLowerCase();
      return aName.localeCompare(bName);
    });

    const total = filteredUsers.length;
    const paginatedUsers = filteredUsers.slice(offset, offset + limit);

    const sanitizedUsers = paginatedUsers.map((user: any) => ({
      id: user.id,
      email: user.email,
      name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      schoolId: user.schoolId,
      avatar: user.avatar,
    }));

    res.json({
      success: true,
      users: sanitizedUsers,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (error: any) {
    console.error('Error searching users:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid query parameters', details: error.errors });
    }
    res.status(500).json({ success: false, error: 'Failed to search users' });
  }
});

router.get('/roles', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const currentUser = await storage.getUserByEmail(userEmail);
    if (!currentUser) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    if (!['schoolAdmin', 'admin', 'superAdmin'].includes(currentUser.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    const roles = [
      { value: 'parent', label: 'Parent' },
      { value: 'educator', label: 'Educator' },
      { value: 'schoolAdmin', label: 'School Admin' },
    ];

    if (currentUser.role === 'superAdmin' || currentUser.role === 'admin') {
      roles.push({ value: 'admin', label: 'Admin' });
      roles.push({ value: 'superAdmin', label: 'Super Admin' });
    }

    res.json({ success: true, roles });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch roles' });
  }
});

export default router;
