import { Router } from 'express';
import { storage } from '../storage';
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireSchoolContext } from '../middleware/require-school-context';
import { z } from 'zod';
import type { CreditType, CreditStatus } from '@shared/schema';

const router = Router();

router.use(supabaseAuth);

const createManualCreditSchema = z.object({
  userId: z.number().int().positive(),
  creditAmountCents: z.number().int().positive(),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  notes: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  autoApprove: z.boolean().default(true),
});

const approveCreditSchema = z.object({
  creditId: z.number().int().positive(),
});

const rejectCreditSchema = z.object({
  creditId: z.number().int().positive(),
  reason: z.string().min(1, "Rejection reason is required"),
});

router.get('/summary', requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    
    const allCredits = await storage.getCredits({ schoolId });
    const pendingCredits = await storage.getPendingCredits(schoolId);
    
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const approvedCredits = allCredits.filter(c => 
      c.status === 'approved' || c.status === 'partially_used'
    );
    
    const totalAvailableCents = approvedCredits.reduce((sum, c) => 
      sum + (c.creditAmountCents - c.usedAmountCents), 0
    );
    
    const expiringSoonCredits = approvedCredits.filter(c => 
      c.expiresAt && new Date(c.expiresAt) <= thirtyDaysFromNow && new Date(c.expiresAt) > now
    );
    
    const expiringSoonCents = expiringSoonCredits.reduce((sum, c) => 
      sum + (c.creditAmountCents - c.usedAmountCents), 0
    );
    
    const creditsByType = allCredits.reduce((acc, c) => {
      acc[c.creditType] = (acc[c.creditType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    res.json({
      totalCreditsIssued: allCredits.length,
      totalAvailableCents,
      pendingApprovalCount: pendingCredits.length,
      expiringSoonCount: expiringSoonCredits.length,
      expiringSoonCents,
      creditsByType,
    });
  } catch (error: any) {
    console.error('Error fetching credit summary:', error);
    res.status(500).json({ error: 'Failed to fetch credit summary' });
  }
});

router.get('/households', requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    
    const allCredits = await storage.getCredits({ schoolId });
    
    const householdBalances = new Map<number, {
      userId: number;
      userName: string;
      userEmail: string;
      totalCreditsCents: number;
      availableCreditsCents: number;
      pendingCreditsCents: number;
      expiringSoonCents: number;
      creditCount: number;
    }>();
    
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    for (const credit of allCredits) {
      let household = householdBalances.get(credit.userId);
      
      if (!household) {
        const user = await storage.getUser(credit.userId);
        household = {
          userId: credit.userId,
          userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
          userEmail: user?.email || 'Unknown',
          totalCreditsCents: 0,
          availableCreditsCents: 0,
          pendingCreditsCents: 0,
          expiringSoonCents: 0,
          creditCount: 0,
        };
        householdBalances.set(credit.userId, household);
      }
      
      household.creditCount++;
      household.totalCreditsCents += credit.creditAmountCents;
      
      if (credit.status === 'pending') {
        household.pendingCreditsCents += credit.creditAmountCents;
      } else if (credit.status === 'approved' || credit.status === 'partially_used') {
        const remaining = credit.creditAmountCents - credit.usedAmountCents;
        household.availableCreditsCents += remaining;
        
        if (credit.expiresAt && new Date(credit.expiresAt) <= thirtyDaysFromNow && new Date(credit.expiresAt) > now) {
          household.expiringSoonCents += remaining;
        }
      }
    }
    
    const households = Array.from(householdBalances.values())
      .sort((a, b) => b.availableCreditsCents - a.availableCreditsCents);
    
    res.json(households);
  } catch (error: any) {
    console.error('Error fetching household balances:', error);
    res.status(500).json({ error: 'Failed to fetch household balances' });
  }
});

router.get('/pending', requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const creditType = req.query.type as CreditType | undefined;
    
    const pendingCredits = await storage.getPendingCredits(schoolId, creditType);
    
    const creditsWithUserInfo = await Promise.all(
      pendingCredits.map(async (credit) => {
        const user = await storage.getUser(credit.userId);
        return {
          ...credit,
          userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
          userEmail: user?.email || 'Unknown',
        };
      })
    );
    
    res.json(creditsWithUserInfo);
  } catch (error: any) {
    console.error('Error fetching pending credits:', error);
    res.status(500).json({ error: 'Failed to fetch pending credits' });
  }
});

router.get('/history', requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const { userId, creditType, status, limit = 50 } = req.query;
    
    const filters: {
      schoolId: number;
      userId?: number;
      creditType?: CreditType;
      status?: CreditStatus;
    } = { schoolId };
    
    if (userId) filters.userId = parseInt(userId as string);
    if (creditType) filters.creditType = creditType as CreditType;
    if (status) filters.status = status as CreditStatus;
    
    const credits = await storage.getCredits(filters);
    
    const creditsWithUserInfo = await Promise.all(
      credits.slice(0, parseInt(limit as string)).map(async (credit) => {
        const user = await storage.getUser(credit.userId);
        const approver = credit.approvedBy ? await storage.getUser(credit.approvedBy) : null;
        return {
          ...credit,
          userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
          userEmail: user?.email || 'Unknown',
          approverName: approver ? `${approver.firstName} ${approver.lastName}` : null,
        };
      })
    );
    
    creditsWithUserInfo.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    res.json(creditsWithUserInfo);
  } catch (error: any) {
    console.error('Error fetching credit history:', error);
    res.status(500).json({ error: 'Failed to fetch credit history' });
  }
});

router.get('/user/:userId', requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const userId = parseInt(req.params.userId);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const user = await storage.getUser(userId);
    if (!user || user.schoolId !== schoolId) {
      return res.status(404).json({ error: 'User not found in this school' });
    }
    
    const credits = await storage.getCredits({ userId, schoolId });
    const availableCredits = await storage.getAvailableCredits(userId);
    const totalAvailable = await storage.getTotalAvailableCredits(userId);
    
    res.json({
      user: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
      },
      credits,
      availableCredits,
      totalAvailableCents: totalAvailable,
    });
  } catch (error: any) {
    console.error('Error fetching user credits:', error);
    res.status(500).json({ error: 'Failed to fetch user credits' });
  }
});

router.post('/manual', requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const adminUserId = req.user.id;
    
    const validation = createManualCreditSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors 
      });
    }
    
    const { userId, creditAmountCents, title, description, notes, expiresAt, autoApprove } = validation.data;
    
    const targetUser = await storage.getUser(userId);
    if (!targetUser || targetUser.schoolId !== schoolId) {
      return res.status(404).json({ error: 'User not found in this school' });
    }
    
    const creditData = {
      userId,
      schoolId,
      creditType: 'manual' as CreditType,
      sourceType: 'admin_grant',
      creditAmountCents,
      status: autoApprove ? ('approved' as CreditStatus) : ('pending' as CreditStatus),
      title,
      description: description || null,
      notes: notes || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      approvedBy: autoApprove ? adminUserId : null,
      approvedAt: autoApprove ? new Date() : null,
    };
    
    const credit = await storage.createCredit(creditData);
    
    console.log(`✅ Manual credit created: ${creditAmountCents} cents for user ${userId} by admin ${adminUserId}`);
    
    res.status(201).json(credit);
  } catch (error: any) {
    console.error('Error creating manual credit:', error);
    res.status(500).json({ error: 'Failed to create credit' });
  }
});

router.post('/approve', requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const adminUserId = req.user.id;
    
    const validation = approveCreditSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors 
      });
    }
    
    const { creditId } = validation.data;
    
    const credit = await storage.getCreditById(creditId);
    if (!credit || credit.schoolId !== schoolId) {
      return res.status(404).json({ error: 'Credit not found' });
    }
    
    if (credit.status !== 'pending') {
      return res.status(400).json({ error: 'Credit is not pending approval' });
    }
    
    const approvedCredit = await storage.approveCredit(creditId, adminUserId);
    
    console.log(`✅ Credit ${creditId} approved by admin ${adminUserId}`);
    
    res.json(approvedCredit);
  } catch (error: any) {
    console.error('Error approving credit:', error);
    res.status(500).json({ error: 'Failed to approve credit' });
  }
});

router.post('/reject', requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const adminUserId = req.user.id;
    
    const validation = rejectCreditSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors 
      });
    }
    
    const { creditId, reason } = validation.data;
    
    const credit = await storage.getCreditById(creditId);
    if (!credit || credit.schoolId !== schoolId) {
      return res.status(404).json({ error: 'Credit not found' });
    }
    
    if (credit.status !== 'pending') {
      return res.status(400).json({ error: 'Credit is not pending approval' });
    }
    
    const rejectedCredit = await storage.rejectCredit(creditId, adminUserId, reason);
    
    console.log(`❌ Credit ${creditId} rejected by admin ${adminUserId}: ${reason}`);
    
    res.json(rejectedCredit);
  } catch (error: any) {
    console.error('Error rejecting credit:', error);
    res.status(500).json({ error: 'Failed to reject credit' });
  }
});

router.get('/parents', requireSchoolContext, async (req: any, res) => {
  try {
    const schoolId = req.schoolId;
    const search = (req.query.search as string) || '';
    
    const parents = await storage.getParentsBySchoolId(schoolId);
    
    let filteredParents = parents;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredParents = parents.filter(p => 
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchLower) ||
        p.email.toLowerCase().includes(searchLower)
      );
    }
    
    const parentsWithCredits = await Promise.all(
      filteredParents.slice(0, 50).map(async (parent) => {
        const totalAvailable = await storage.getTotalAvailableCredits(parent.id);
        return {
          id: parent.id,
          name: `${parent.firstName} ${parent.lastName}`,
          email: parent.email,
          availableCreditsCents: totalAvailable,
        };
      })
    );
    
    res.json(parentsWithCredits);
  } catch (error: any) {
    console.error('Error fetching parents for credits:', error);
    res.status(500).json({ error: 'Failed to fetch parents' });
  }
});

export default router;
