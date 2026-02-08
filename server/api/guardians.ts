import { Router } from 'express';
import { storage } from '../storage';
import type { ChildGuardian, InsertChildGuardian } from '@shared/schema';

const router = Router();

router.get('/:childId/guardians', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId);
    if (isNaN(childId)) {
      return res.status(400).json({ message: 'Invalid child ID' });
    }

    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }

    const child = await storage.getChildById(childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }

    const userRoles = await storage.getUserRolesByUserId(user.id);
    const hasSchoolAdminRole = userRoles.some(r => r.role === 'schoolAdmin') || user.role === 'schoolAdmin';
    const hasAdminRole = userRoles.some(r => r.role === 'admin' || r.role === 'superAdmin') || user.role === 'admin' || user.role === 'superAdmin';

    const isPrimaryParent = child.parentId === user.id;

    const existingGuardians = await storage.getGuardiansByChildId(childId);
    const isExistingGuardian = existingGuardians.some(g => g.guardianUserId === user.id);

    if (!isPrimaryParent && !isExistingGuardian && !hasSchoolAdminRole && !hasAdminRole) {
      return res.status(403).json({ message: 'Permission denied' });
    }

    const enrichedGuardians = await Promise.all(
      existingGuardians.map(async (guardian) => {
        const guardianUser = await storage.getUser(guardian.guardianUserId);
        return {
          ...guardian,
          guardianName: guardianUser?.name || null,
          guardianEmail: guardianUser?.email || null,
        };
      })
    );

    res.json(enrichedGuardians);
  } catch (error) {
    console.error('Error fetching guardians:', error);
    res.status(500).json({ message: 'Failed to fetch guardians' });
  }
});

router.post('/:childId/guardians', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId);
    if (isNaN(childId)) {
      return res.status(400).json({ message: 'Invalid child ID' });
    }

    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }

    const child = await storage.getChildById(childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }

    const userRoles = await storage.getUserRolesByUserId(user.id);
    const hasSchoolAdminRole = userRoles.some(r => r.role === 'schoolAdmin') || user.role === 'schoolAdmin';
    const hasAdminRole = userRoles.some(r => r.role === 'admin' || r.role === 'superAdmin') || user.role === 'admin' || user.role === 'superAdmin';

    const isPrimaryParent = child.parentId === user.id;

    if (!isPrimaryParent && !hasSchoolAdminRole && !hasAdminRole) {
      return res.status(403).json({ message: 'Only the primary parent or school admin can add guardians' });
    }

    const { email, relationship, notes } = req.body;
    if (!email || !relationship) {
      return res.status(400).json({ message: 'Email and relationship are required' });
    }

    const guardianUser = await storage.getUserByEmail(email);
    if (!guardianUser) {
      return res.status(404).json({ message: 'No user found with that email' });
    }

    if (guardianUser.id === child.parentId) {
      return res.status(400).json({ message: 'Cannot add the primary parent as a guardian' });
    }

    const existingGuardians = await storage.getGuardiansByChildId(childId);
    const isDuplicate = existingGuardians.some(g => g.guardianUserId === guardianUser.id);
    if (isDuplicate) {
      return res.status(400).json({ message: 'This user is already a guardian for this child' });
    }

    const newGuardian = await storage.addChildGuardian({
      childId,
      guardianUserId: guardianUser.id,
      relationship,
      notes: notes || null,
      addedBy: user.id,
      isPrimary: false,
    });

    res.status(201).json(newGuardian);
  } catch (error) {
    console.error('Error adding guardian:', error);
    res.status(500).json({ message: 'Failed to add guardian' });
  }
});

router.delete('/:childId/guardians/:guardianId', async (req: any, res) => {
  try {
    const childId = parseInt(req.params.childId);
    const guardianId = parseInt(req.params.guardianId);
    if (isNaN(childId) || isNaN(guardianId)) {
      return res.status(400).json({ message: 'Invalid child ID or guardian ID' });
    }

    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }

    const child = await storage.getChildById(childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }

    const userRoles = await storage.getUserRolesByUserId(user.id);
    const hasSchoolAdminRole = userRoles.some(r => r.role === 'schoolAdmin') || user.role === 'schoolAdmin';
    const hasAdminRole = userRoles.some(r => r.role === 'admin' || r.role === 'superAdmin') || user.role === 'admin' || user.role === 'superAdmin';

    const isPrimaryParent = child.parentId === user.id;

    if (!isPrimaryParent && !hasSchoolAdminRole && !hasAdminRole) {
      return res.status(403).json({ message: 'Only the primary parent or school admin can remove guardians' });
    }

    const guardianRecord = await storage.getChildGuardianById(guardianId);
    if (!guardianRecord) {
      return res.status(404).json({ message: 'Guardian record not found' });
    }

    if (guardianRecord.childId !== childId) {
      return res.status(400).json({ message: 'Guardian record does not belong to this child' });
    }

    await storage.removeChildGuardian(guardianId);

    res.json({ message: 'Guardian removed successfully' });
  } catch (error) {
    console.error('Error removing guardian:', error);
    res.status(500).json({ message: 'Failed to remove guardian' });
  }
});

export default router;
