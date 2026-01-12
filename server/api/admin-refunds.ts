import express from 'express';
import { storage } from '../storage';

const router = express.Router();

router.get('/', async (req: any, res) => {
  try {
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user || user.role !== 'schoolAdmin') {
      return res.status(403).json({ error: 'Only school administrators can view refunds' });
    }

    if (!user.schoolId) {
      return res.status(400).json({ error: 'No school associated with this admin account' });
    }

    const refunds = await storage.getRefundsBySchoolId(user.schoolId);

    const enrichedRefunds = await Promise.all(
      refunds.map(async (refund: any) => {
        let enrollmentInfo = null;
        let paymentInfo = null;
        let processedByInfo = null;

        if (refund.enrollmentId) {
          try {
            const enrollment = await storage.getProgramEnrollmentById(refund.enrollmentId);
            if (enrollment) {
              enrollmentInfo = {
                id: enrollment.id,
                childName: enrollment.childName,
                className: enrollment.className,
                parentEmail: enrollment.parentEmail,
              };
            }
          } catch (e) {
            console.log(`Could not fetch enrollment ${refund.enrollmentId}`);
          }
        }

        if (refund.paymentId) {
          paymentInfo = {
            id: refund.paymentId,
          };
        }

        if (refund.processedBy) {
          try {
            const processor = await storage.getUser(refund.processedBy);
            if (processor) {
              processedByInfo = {
                id: processor.id,
                name: processor.name || processor.email,
                email: processor.email,
              };
            }
          } catch (e) {
            console.log(`Could not fetch processor ${refund.processedBy}`);
          }
        }

        return {
          ...refund,
          enrollment: enrollmentInfo,
          payment: paymentInfo,
          processedByUser: processedByInfo,
        };
      })
    );

    enrichedRefunds.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentRefunds = enrichedRefunds.filter(r => new Date(r.createdAt) >= thirtyDaysAgo);
    const completedRefunds = enrichedRefunds.filter(r => r.status === 'completed');

    const summary = {
      totalRefunds: enrichedRefunds.length,
      totalAmountCents: enrichedRefunds.reduce((sum, r) => sum + (r.amount || 0), 0),
      completedRefunds: completedRefunds.length,
      pendingRefunds: enrichedRefunds.filter(r => r.status === 'pending').length,
      failedRefunds: enrichedRefunds.filter(r => r.status === 'failed').length,
      last30DaysCount: recentRefunds.length,
      last30DaysAmountCents: recentRefunds.reduce((sum, r) => sum + (r.amount || 0), 0),
      averageRefundCents: completedRefunds.length > 0 
        ? Math.round(completedRefunds.reduce((sum, r) => sum + (r.amount || 0), 0) / completedRefunds.length)
        : 0,
    };

    res.json({
      refunds: enrichedRefunds,
      summary,
    });
  } catch (error) {
    console.error('Error fetching refunds:', error);
    res.status(500).json({ error: 'Failed to fetch refunds' });
  }
});

export default router;
