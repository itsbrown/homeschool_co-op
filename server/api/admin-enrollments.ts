import { Router } from 'express';
import { storage } from '../storage';
import { sendWaitlistPromotedEmail } from '../lib/email-service';

const router = Router();

// GET enrollment details by ID
router.get('/:id', async (req, res) => {
  try {
    const enrollmentId = parseInt(req.params.id);
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }
    
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }
    
    res.json(enrollment);
  } catch (error) {
    console.error('Error fetching enrollment:', error);
    res.status(500).json({ message: 'Failed to fetch enrollment' });
  }
});

// DELETE enrollment by ID (soft-delete: sets status to 'cancelled')
// Preserves enrollment record for payment history and audit trail
router.delete('/:id', async (req: any, res) => {
  try {
    const enrollmentId = parseInt(req.params.id);
    const { reason } = req.body || {};
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }
    
    // Get authenticated user email
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }

    // MULTI-ROLE CHECK: Check both user_roles table (new system) and users.role (legacy)
    const userRoles = await storage.getUserRolesByUserId(user.id);
    const hasSchoolAdminRole = userRoles.some(r => r.role === 'schoolAdmin') || user.role === 'schoolAdmin';
    const hasAdminRole = userRoles.some(r => r.role === 'admin' || r.role === 'superAdmin') || user.role === 'admin' || user.role === 'superAdmin';
    if (!hasSchoolAdminRole && !hasAdminRole) {
      return res.status(403).json({ message: 'Only school administrators can unenroll students' });
    }
    
    console.log(`🗑️  Admin ${userEmail} attempting to cancel enrollment ID: ${enrollmentId}`);
    
    // Get enrollment details first for validation and logging
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    // Check if already cancelled
    if (enrollment.status === 'cancelled' || enrollment.status === 'withdrawn') {
      return res.status(400).json({ message: 'Enrollment is already cancelled or withdrawn' });
    }

    // Verify enrollment belongs to admin's school (check user_roles school context for multi-role users)
    const schoolAdminRole = userRoles.find(r => r.role === 'schoolAdmin');
    const effectiveSchoolId = schoolAdminRole?.schoolId || user.schoolId;
    if (!hasAdminRole && enrollment.schoolId !== effectiveSchoolId) {
      return res.status(403).json({ message: 'Cannot unenroll students from other schools' });
    }

    const totalPaid = enrollment.totalPaid || 0;
    
    console.log(`📝 Cancelling enrollment: ${enrollment.className} for ${enrollment.childName} (${enrollment.parentEmail})`);
    if (totalPaid > 0) {
      console.log(`💰 Note: Enrollment has $${(totalPaid / 100).toFixed(2)} in payments - preserved for reallocation`);
    }
    
    // Soft-delete: Update status to cancelled instead of deleting
    await storage.updateProgramEnrollment(enrollmentId, {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledBy: user.id,
      cancellationReason: reason || 'Unenrolled by school administrator',
    });
    
    console.log(`✅ Successfully cancelled enrollment ID ${enrollmentId}`);

    // Auto-promote next waitlisted student if one exists (scoped by school + class)
    let promotedStudent = null;
    try {
      const allEnrollments = await storage.getAllEnrollments();
      const classId = enrollment.marketplaceClassId || enrollment.classId;
      const enrollmentSchoolId = enrollment.schoolId;
      const waitlistedForClass = allEnrollments
        .filter((e: any) => {
          const eClassId = e.marketplaceClassId || e.classId;
          const matchesClass = eClassId === classId;
          const matchesSchool = !enrollmentSchoolId || e.schoolId === enrollmentSchoolId;
          return matchesClass && matchesSchool && e.status === 'waitlist';
        })
        .sort((a: any, b: any) => (a.waitlistPosition || 999) - (b.waitlistPosition || 999));

      if (waitlistedForClass.length > 0) {
        const nextInLine = waitlistedForClass[0];
        await storage.updateProgramEnrollment(nextInLine.id, {
          status: 'pending_payment',
          waitlistPosition: null,
        });
        promotedStudent = nextInLine;
        console.log(`🎉 Auto-promoted enrollment ${nextInLine.id} (${nextInLine.childName}) from waitlist`);

        // Recalculate positions for remaining waitlisted students
        for (let i = 1; i < waitlistedForClass.length; i++) {
          await storage.updateProgramEnrollment(waitlistedForClass[i].id, { waitlistPosition: i });
        }

        // Send promotion email
        const parentName = nextInLine.parentEmail ? 'Parent' : 'Parent';
        const classItem = classId ? await storage.getClassById(classId) : null;
        try {
          const parentUser = nextInLine.parentEmail ? await storage.getUserByEmail(nextInLine.parentEmail) : null;
          const resolvedParentName = parentUser ? `${parentUser.firstName || ''} ${parentUser.lastName || ''}`.trim() || 'Parent' : 'Parent';

          if (nextInLine.parentEmail) {
            await sendWaitlistPromotedEmail({
              parentEmail: nextInLine.parentEmail,
              parentName: resolvedParentName,
              childName: nextInLine.childName || 'Your child',
              className: nextInLine.className || 'Class',
              programStartDate: classItem?.startDate ? new Date(classItem.startDate) : undefined,
              price: nextInLine.totalCost || 0,
            });
            console.log(`📧 Sent waitlist promotion email to ${nextInLine.parentEmail}`);
          }

          // Create in-app notification
          if (parentUser) {
            const notification = await storage.createNotification({
              senderId: user.id,
              schoolId: enrollment.schoolId || 1,
              type: 'both',
              priority: 'high',
              subject: `Spot Available — ${nextInLine.className}`,
              content: `Great news! A spot opened up in ${nextInLine.className} for ${nextInLine.childName}. Please complete payment within 24 hours to secure enrollment.`,
              targetType: 'individual',
              targetData: JSON.stringify({ userIds: [parentUser.id] }),
              targetUserIds: [parentUser.id],
              status: 'sent',
              scheduledFor: null,
              expiresAt: null,
            });

            await storage.createNotificationRecipient({
              notificationId: notification.id,
              recipientId: parentUser.id,
              deliveryType: 'in_app',
              status: 'delivered',
              deliveredAt: new Date(),
            });
            console.log(`🔔 Created in-app notification for parent ${parentUser.id} about waitlist promotion`);
          }
        } catch (notifError) {
          console.error('⚠️ Failed to send waitlist promotion notification (non-blocking):', notifError);
        }
      }
    } catch (waitlistError) {
      console.error('⚠️ Error processing waitlist after cancellation (non-blocking):', waitlistError);
    }
    
    res.json({ 
      message: 'Student unenrolled successfully',
      cancelledEnrollment: {
        id: enrollmentId,
        className: enrollment.className,
        childName: enrollment.childName,
        parentEmail: enrollment.parentEmail,
        status: 'cancelled',
        totalPaid: totalPaid,
        totalPaidFormatted: totalPaid > 0 ? `$${(totalPaid / 100).toFixed(2)}` : '$0.00',
        canReallocatePayments: totalPaid > 0,
      },
      promotedFromWaitlist: promotedStudent ? {
        childName: promotedStudent.childName,
        parentEmail: promotedStudent.parentEmail,
      } : null,
    });
  } catch (error) {
    console.error('Error cancelling enrollment:', error);
    res.status(500).json({ message: 'Failed to unenroll student' });
  }
});

// POST comp enrollment - apply percentage-based discount and activate enrollment
router.post('/:id/comp', async (req: any, res) => {
  try {
    const enrollmentId = parseInt(req.params.id);
    const { compPercentage, compReason } = req.body;
    
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }
    
    // Validate percentage
    const percentage = parseInt(compPercentage);
    if (isNaN(percentage) || percentage < 1 || percentage > 100) {
      return res.status(400).json({ message: 'Comp percentage must be between 1 and 100' });
    }
    
    // Get authenticated user
    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }

    // MULTI-ROLE CHECK: Check both user_roles table (new system) and users.role (legacy)
    const compUserRoles = await storage.getUserRolesByUserId(user.id);
    const hasCompSchoolAdminRole = compUserRoles.some(r => r.role === 'schoolAdmin') || user.role === 'schoolAdmin';
    const hasCompAdminRole = compUserRoles.some(r => r.role === 'admin' || r.role === 'superAdmin') || user.role === 'admin' || user.role === 'superAdmin';
    if (!hasCompSchoolAdminRole && !hasCompAdminRole) {
      return res.status(403).json({ message: 'Only school administrators can comp enrollments' });
    }
    
    console.log(`🎁 Admin ${userEmail} attempting to comp enrollment ID: ${enrollmentId} at ${percentage}%`);
    
    // Get enrollment details
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    // Verify enrollment belongs to admin's school (check user_roles school context for multi-role users)
    const compSchoolAdminRole = compUserRoles.find(r => r.role === 'schoolAdmin');
    const compEffectiveSchoolId = compSchoolAdminRole?.schoolId || user.schoolId;
    if (!hasCompAdminRole && enrollment.schoolId !== compEffectiveSchoolId) {
      return res.status(403).json({ message: 'Cannot comp enrollments from other schools' });
    }

    // Check enrollment status - allow comping pending_payment or enrolled enrollments with remaining balance
    const allowedStatuses = ['pending_payment', 'enrolled', 'pending_admin_approval'];
    if (!allowedStatuses.includes(enrollment.status || '')) {
      return res.status(400).json({ 
        message: `Can only comp enrollments with pending or enrolled status. Current status: ${enrollment.status}` 
      });
    }

    // For enrolled enrollments, verify there's a remaining balance to comp
    const effectiveRemainingBalance = enrollment.remainingBalance || ((enrollment.totalCost || 0) - (enrollment.totalPaid || 0));
    if (enrollment.status === 'enrolled' && effectiveRemainingBalance <= 0) {
      return res.status(400).json({ 
        message: 'This enrollment has no remaining balance to comp' 
      });
    }

    // Check if already comped
    if (enrollment.compPercentage && enrollment.compPercentage > 0) {
      return res.status(400).json({ 
        message: `Enrollment already has a ${enrollment.compPercentage}% comp applied` 
      });
    }

    // Calculate comp amount (based on total cost)
    const totalCost = enrollment.totalCost || 0;
    const compAmountCents = Math.round((totalCost * percentage) / 100);
    
    // Calculate new remaining balance after comp
    const currentPaid = enrollment.totalPaid || 0;
    const newRemainingBalance = Math.max(0, totalCost - compAmountCents - currentPaid);
    
    // Determine new status and payment status
    const isFullyComped = newRemainingBalance === 0;
    const newStatus = isFullyComped ? 'enrolled' : enrollment.status;
    const newPaymentStatus = isFullyComped ? 'completed' : enrollment.paymentStatus;
    
    console.log(`📝 Comping enrollment: ${enrollment.className} for ${enrollment.childName}`);
    console.log(`   Total cost: $${(totalCost / 100).toFixed(2)}`);
    console.log(`   Comp percentage: ${percentage}%`);
    console.log(`   Comp amount: $${(compAmountCents / 100).toFixed(2)}`);
    console.log(`   New remaining balance: $${(newRemainingBalance / 100).toFixed(2)}`);
    
    // Update enrollment with comp details
    await storage.updateProgramEnrollment(enrollmentId, {
      compPercentage: percentage,
      compAmountCents: compAmountCents,
      compReason: compReason || 'Comped by school administrator',
      compBy: user.id,
      compAt: new Date(),
      remainingBalance: newRemainingBalance,
      status: newStatus,
      paymentStatus: newPaymentStatus,
    });
    
    console.log(`✅ Successfully comped enrollment ID ${enrollmentId}`);
    
    res.json({ 
      success: true,
      message: isFullyComped 
        ? `Enrollment fully comped - student is now enrolled` 
        : `${percentage}% comp applied - remaining balance: $${(newRemainingBalance / 100).toFixed(2)}`,
      compedEnrollment: {
        id: enrollmentId,
        className: enrollment.className,
        childName: enrollment.childName,
        parentEmail: enrollment.parentEmail,
        compPercentage: percentage,
        compAmount: compAmountCents,
        compAmountFormatted: `$${(compAmountCents / 100).toFixed(2)}`,
        remainingBalance: newRemainingBalance,
        remainingBalanceFormatted: `$${(newRemainingBalance / 100).toFixed(2)}`,
        status: newStatus,
        paymentStatus: newPaymentStatus,
        isFullyComped: isFullyComped,
      }
    });
  } catch (error) {
    console.error('Error comping enrollment:', error);
    res.status(500).json({ message: 'Failed to comp enrollment' });
  }
});

// GET enrollments by parent email (for investigation)
router.get('/parent/:email', async (req, res) => {
  try {
    const parentEmail = decodeURIComponent(req.params.email);
    
    console.log(`🔍 Admin searching enrollments for: ${parentEmail}`);
    
    const allEnrollments = await storage.getAllEnrollments();
    const parentEnrollments = allEnrollments.filter((e: any) => 
      e.parentEmail === parentEmail
    );
    
    console.log(`📊 Found ${parentEnrollments.length} enrollments for ${parentEmail}`);
    
    res.json(parentEnrollments);
  } catch (error) {
    console.error('Error fetching enrollments by parent:', error);
    res.status(500).json({ message: 'Failed to fetch enrollments' });
  }
});

// GET waitlist for a specific class
router.get('/waitlist/:classId', async (req: any, res) => {
  try {
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) {
      return res.status(400).json({ message: 'Invalid class ID' });
    }

    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }

    const userRoles = await storage.getUserRolesByUserId(user.id);
    const hasSchoolAdminRole = userRoles.some(r => r.role === 'schoolAdmin') || user.role === 'schoolAdmin';
    const hasAdminRole = userRoles.some(r => r.role === 'admin' || r.role === 'superAdmin') || user.role === 'admin' || user.role === 'superAdmin';
    if (!hasSchoolAdminRole && !hasAdminRole) {
      return res.status(403).json({ message: 'Only school administrators can view waitlists' });
    }

    const adminSchoolIds = hasAdminRole ? null : userRoles.filter(r => r.role === 'schoolAdmin' && r.schoolId).map(r => r.schoolId);

    const allEnrollments = await storage.getAllEnrollments();
    const waitlistedEnrollments = allEnrollments
      .filter((e: any) => {
        const matchesClass = e.marketplaceClassId === classId || e.classId === classId;
        const matchesSchool = hasAdminRole || !adminSchoolIds || adminSchoolIds.includes(e.schoolId);
        return matchesClass && matchesSchool && e.status === 'waitlist';
      })
      .sort((a: any, b: any) => (a.waitlistPosition || 0) - (b.waitlistPosition || 0));

    res.json(waitlistedEnrollments);
  } catch (error) {
    console.error('Error fetching waitlist:', error);
    res.status(500).json({ message: 'Failed to fetch waitlist' });
  }
});

// POST promote a waitlisted student — sends email + in-app notification
router.post('/:id/promote', async (req: any, res) => {
  try {
    const enrollmentId = parseInt(req.params.id);
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }

    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }

    const userRoles = await storage.getUserRolesByUserId(user.id);
    const hasSchoolAdminRole = userRoles.some(r => r.role === 'schoolAdmin') || user.role === 'schoolAdmin';
    const hasAdminRole = userRoles.some(r => r.role === 'admin' || r.role === 'superAdmin') || user.role === 'admin' || user.role === 'superAdmin';
    if (!hasSchoolAdminRole && !hasAdminRole) {
      return res.status(403).json({ message: 'Only school administrators can promote waitlisted students' });
    }

    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    if (enrollment.status !== 'waitlist') {
      return res.status(400).json({ message: 'Enrollment is not on the waitlist' });
    }

    // Verify school-scoped access for school admins
    if (!hasAdminRole && hasSchoolAdminRole) {
      const adminSchoolIds = userRoles.filter(r => r.role === 'schoolAdmin' && r.schoolId).map(r => r.schoolId);
      if (enrollment.schoolId && !adminSchoolIds.includes(enrollment.schoolId)) {
        return res.status(403).json({ message: 'You can only manage waitlists for your school' });
      }
    }

    await storage.updateProgramEnrollment(enrollmentId, {
      status: 'pending_payment',
      waitlistPosition: null,
    });

    console.log(`✅ Promoted enrollment ${enrollmentId} from waitlist to pending_payment`);

    // Recalculate waitlist positions for remaining students (scoped by class + school)
    try {
      const allEnrollments = await storage.getAllEnrollments();
      const classId = enrollment.marketplaceClassId || enrollment.classId;
      const remainingWaitlisted = allEnrollments
        .filter((e: any) => {
          const eClassId = e.marketplaceClassId || e.classId;
          return eClassId === classId && e.schoolId === enrollment.schoolId && e.status === 'waitlist' && e.id !== enrollmentId;
        })
        .sort((a: any, b: any) => (a.waitlistPosition || 0) - (b.waitlistPosition || 0));

      for (let i = 0; i < remainingWaitlisted.length; i++) {
        await storage.updateProgramEnrollment(remainingWaitlisted[i].id, { waitlistPosition: i + 1 });
      }
      console.log(`🔄 Recalculated waitlist positions for ${remainingWaitlisted.length} remaining students`);
    } catch (reorderError) {
      console.error('⚠️ Error recalculating waitlist positions:', reorderError);
    }

    // Send email notification
    try {
      const classItem = enrollment.marketplaceClassId ? await storage.getClassById(enrollment.marketplaceClassId) : null;
      const parentUser = enrollment.parentEmail ? await storage.getUserByEmail(enrollment.parentEmail) : null;
      const parentName = parentUser ? `${parentUser.firstName || ''} ${parentUser.lastName || ''}`.trim() || 'Parent' : 'Parent';

      if (enrollment.parentEmail) {
        await sendWaitlistPromotedEmail({
          parentEmail: enrollment.parentEmail,
          parentName,
          childName: enrollment.childName || 'Your child',
          className: enrollment.className || 'Class',
          programStartDate: classItem?.startDate ? new Date(classItem.startDate) : undefined,
          price: enrollment.totalCost || 0,
        });
        console.log(`📧 Sent waitlist promotion email to ${enrollment.parentEmail}`);
      }
    } catch (emailError) {
      console.error('⚠️ Failed to send promotion email (non-blocking):', emailError);
    }

    // Create in-app notification
    try {
      const parentUser = enrollment.parentEmail ? await storage.getUserByEmail(enrollment.parentEmail) : null;
      if (parentUser) {
        const notification = await storage.createNotification({
          senderId: user.id,
          schoolId: enrollment.schoolId || 1,
          type: 'both',
          priority: 'high',
          subject: `Spot Available — ${enrollment.className}`,
          content: `Great news! A spot opened up in ${enrollment.className} for ${enrollment.childName}. Please complete payment within 24 hours to secure enrollment.`,
          targetType: 'individual',
          targetData: JSON.stringify({ userIds: [parentUser.id] }),
          targetUserIds: [parentUser.id],
          status: 'sent',
          scheduledFor: null,
          expiresAt: null,
        });

        await storage.createNotificationRecipient({
          notificationId: notification.id,
          recipientId: parentUser.id,
          deliveryType: 'in_app',
          status: 'delivered',
          deliveredAt: new Date(),
        });
        console.log(`🔔 Created in-app notification for parent ${parentUser.id}`);
      }
    } catch (notifError) {
      console.error('⚠️ Failed to create notification (non-blocking):', notifError);
    }

    res.json({
      message: `${enrollment.childName} has been promoted from the waitlist for ${enrollment.className}. The parent has been notified to complete payment.`,
      enrollment: { ...enrollment, status: 'pending_payment', waitlistPosition: null },
    });
  } catch (error) {
    console.error('Error promoting from waitlist:', error);
    res.status(500).json({ message: 'Failed to promote from waitlist' });
  }
});

// POST notify a waitlisted parent manually
router.post('/:id/notify-waitlist', async (req: any, res) => {
  try {
    const enrollmentId = parseInt(req.params.id);
    if (isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid enrollment ID' });
    }

    const userEmail = req.user?.email || req.auth?.email;
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(403).json({ message: 'User not found' });
    }

    const userRoles = await storage.getUserRolesByUserId(user.id);
    const hasSchoolAdminRole = userRoles.some(r => r.role === 'schoolAdmin') || user.role === 'schoolAdmin';
    const hasAdminRole = userRoles.some(r => r.role === 'admin' || r.role === 'superAdmin') || user.role === 'admin' || user.role === 'superAdmin';
    if (!hasSchoolAdminRole && !hasAdminRole) {
      return res.status(403).json({ message: 'Only school administrators can send waitlist notifications' });
    }

    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    if (enrollment.status !== 'waitlist') {
      return res.status(400).json({ message: 'Enrollment is not on the waitlist' });
    }

    // Verify school-scoped access for school admins
    if (!hasAdminRole && hasSchoolAdminRole) {
      const adminSchoolIds = userRoles.filter(r => r.role === 'schoolAdmin' && r.schoolId).map(r => r.schoolId);
      if (enrollment.schoolId && !adminSchoolIds.includes(enrollment.schoolId)) {
        return res.status(403).json({ message: 'You can only notify waitlisted students for your school' });
      }
    }

    // Send in-app notification
    const parentUser = enrollment.parentEmail ? await storage.getUserByEmail(enrollment.parentEmail) : null;
    if (parentUser) {
      const notification = await storage.createNotification({
        senderId: user.id,
        schoolId: enrollment.schoolId || 1,
        type: 'in_app',
        priority: 'normal',
        subject: `Waitlist Update — ${enrollment.className}`,
        content: `${enrollment.childName} is #${enrollment.waitlistPosition || '?'} on the waitlist for ${enrollment.className}. We'll notify you when a spot opens up.`,
        targetType: 'individual',
        targetData: JSON.stringify({ userIds: [parentUser.id] }),
        targetUserIds: [parentUser.id],
        status: 'sent',
        scheduledFor: null,
        expiresAt: null,
      });

      await storage.createNotificationRecipient({
        notificationId: notification.id,
        recipientId: parentUser.id,
        deliveryType: 'in_app',
        status: 'delivered',
        deliveredAt: new Date(),
      });
    }

    res.json({ message: `Notification sent to ${enrollment.parentEmail} about waitlist position for ${enrollment.className}.` });
  } catch (error) {
    console.error('Error sending waitlist notification:', error);
    res.status(500).json({ message: 'Failed to send waitlist notification' });
  }
});

export default router;
