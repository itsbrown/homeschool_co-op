import express from "express";
import { storage } from "../storage";
import { sendWaitlistJoinedEmail, sendWaitlistPromotedEmail } from "../lib/email-service";
import { createEnrollmentDataSimple } from "@shared/enrollment-factory";

const router = express.Router();

// Get all classes with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = req.query.search as string || '';
    const category = req.query.category as string || '';
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
    const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
    const locationIds = Array.isArray(req.query.locationIds)
      ? (req.query.locationIds as string[]).map(id => parseInt(id)).filter(id => !isNaN(id))
      : [];
    const sortBy = req.query.sortBy as string || '';
    const sortOrder = ((req.query.sortOrder as string) || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
    const categoryName = req.query.categoryName as string || '';
    const statusParam = req.query.status as string || '';

    // Map API-facing statuses to storage-supported statuses where needed.
    let status: "published" | "draft" | "" = "";
    if (statusParam === "published" || statusParam === "draft") status = statusParam;

    const options = {
      page,
      limit,
      search,
      category,
      status: statusParam === 'active' ? "" : status
    };

    // Get classes count for pagination
    const total = await storage.getClassesCount(options);

    // Get classes with pagination
    let classes = await storage.getClasses(options);

    // Filter out admin-only classes, past classes, and classes in hidden categories
    const now = new Date();
    const hiddenCategoryIds = await storage.getHiddenCategoryIds();
    classes = classes.filter(c => {
      // Closed for enrollment → hidden from the parent catalog (still visible to admins)
      if (!c.enrollmentOpen) return false;
      if (c.isAdminOnly) return false;
      if (c.endDate && new Date(c.endDate) < now) return false;
      if (c.categoryId && hiddenCategoryIds.includes(c.categoryId)) return false;
      return true;
    });

    if (statusParam) {
      classes = classes.filter((c: any) => c.status === statusParam || (statusParam === 'active' && c.status === 'published'));
    }
    if (typeof locationId === 'number' && !isNaN(locationId)) {
      classes = classes.filter((c: any) => c.locationId === locationId);
    }
    if (locationIds.length > 0) {
      classes = classes.filter((c: any) => locationIds.includes(c.locationId));
    }
    if (typeof categoryId === 'number' && !isNaN(categoryId)) {
      classes = classes.filter((c: any) => c.categoryId === categoryId);
    }

    if (statusParam) {
      classes = classes.filter((c: any) => c.status === statusParam || (statusParam === 'active' && c.status === 'published'));
    }
    if (typeof locationId === 'number' && !isNaN(locationId)) {
      classes = classes.filter((c: any) => c.locationId === locationId);
    }
    if (locationIds.length > 0) {
      classes = classes.filter((c: any) => locationIds.includes(c.locationId));
    }
    if (typeof categoryId === 'number' && !isNaN(categoryId)) {
      classes = classes.filter((c: any) => c.categoryId === categoryId);
    }

    if (statusParam) {
      classes = classes.filter((c: any) => c.status === statusParam || (statusParam === 'active' && c.status === 'published'));
    }
    if (typeof locationId === 'number' && !isNaN(locationId)) {
      classes = classes.filter((c: any) => c.locationId === locationId);
    }
    if (locationIds.length > 0) {
      classes = classes.filter((c: any) => locationIds.includes(c.locationId));
    }
    if (typeof categoryId === 'number' && !isNaN(categoryId)) {
      classes = classes.filter((c: any) => c.categoryId === categoryId);
    }

    // Additional filtering by categoryName if provided
    if (categoryName && classes.length > 0) {
      classes = classes.filter(c => c.categoryName === categoryName);
    }

    if (sortBy) {
      classes = [...classes].sort((a: any, b: any) => {
        const av = a?.[sortBy];
        const bv = b?.[sortBy];
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const result = typeof av === 'string' && typeof bv === 'string'
          ? av.localeCompare(bv)
          : Number(av) - Number(bv);
        return sortOrder === 'desc' ? -result : result;
      });
    }

    // Calculate enrollment counts for each class
    const classesWithEnrollmentCounts = await Promise.all(
      classes.map(async (cls) => {
        let enrollmentCount = 0;
        try {
          enrollmentCount = await storage.getEnrollmentCountForClass(cls.id);
        } catch {
          enrollmentCount = 0;
        }
        return {
          ...cls,
          enrollmentCount,
          currentEnrollment: enrollmentCount,
          spotsAvailable: Math.max((cls.maxStudents || cls.capacity || 0) - enrollmentCount, 0),
        };
      })
    );

    // Use filtered count for accurate pagination (accounts for hidden past/admin-only classes)
    const filteredTotal = classes.length;
    res.json({
      classes: classesWithEnrollmentCounts,
      pagination: {
        page,
        limit,
        total: filteredTotal,
        totalPages: Math.ceil(filteredTotal / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ message: 'Failed to fetch classes' });
  }
});

router.post('/', async (req: any, res) => {
  try {
    // Prefer user_locations / user_school_permissions (canManageClasses).
    // Legacy users.permissions.canCreateClasses=false remains an explicit deny for teachers.
    if (req.user?.role === 'teacher' && req.user?.permissions?.canCreateClasses === false) {
      return res.status(403).json({ error: 'permission denied' });
    }
    const classItem = await storage.createClass(req.body as any);
    return res.status(200).json({ class: classItem });
  } catch (error) {
    console.error('Error creating class:', error);
    return res.status(500).json({ message: 'Failed to create class' });
  }
});

// Public classes endpoint used by integration tests.
router.get('/public', async (_req, res) => {
  try {
    const classes = await storage.getAllClasses();
    const visible = classes.filter((c: any) => c.status !== 'draft' && !c.isAdminOnly);
    res.json({ classes: visible });
  } catch (error) {
    console.error('Error fetching public classes:', error);
    res.status(500).json({ message: 'Failed to fetch public classes' });
  }
});

router.get('/shared/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '');
    const classes = await storage.getAllClasses();
    const classItem = classes.find((c: any) => c.shareToken === token && c.isPublic);
    if (!classItem) return res.status(404).json({ message: 'Shared class not found' });
    return res.json({ class: classItem });
  } catch (error) {
    console.error('Error fetching shared class:', error);
    return res.status(500).json({ message: 'Failed to fetch shared class' });
  }
});

router.get('/:id/roster', async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const status = req.query.status as string | undefined;
    const includeParentInfo = String(req.query.includeParentInfo || 'false') === 'true';
    const sortBy = req.query.sortBy as string | undefined;
    const enrollments = (await storage.getAllEnrollments()).filter((e: any) =>
      e.classId === classId || e.marketplaceClassId === classId
    );
    let roster = await Promise.all(enrollments.map(async (e: any) => {
      const child = await storage.getChildById(e.childId);
      const parent = child?.parentId ? await storage.getUser(child.parentId) : null;
      return {
        id: child?.id,
        firstName: child?.firstName,
        lastName: child?.lastName,
        dateOfBirth: child?.birthdate,
        enrollmentStatus: e.status,
        hasSevereAllergies: !!(child?.hasSevereAllergies || (Array.isArray(child?.allergies) && child.allergies.some((a: string) => String(a).toLowerCase().includes('severe')))),
        ...(includeParentInfo ? { parentName: parent?.name || '', parentEmail: parent?.email || '' } : {}),
      };
    }));
    if (status) roster = roster.filter((r: any) => r.enrollmentStatus === status);
    if (sortBy === 'lastName') {
      roster = roster.sort((a: any, b: any) =>
        String(a.lastName || '').toLowerCase().localeCompare(String(b.lastName || '').toLowerCase())
      );
    }
    return res.status(200).json({ roster });
  } catch (error) {
    console.error('Error fetching class roster:', error);
    return res.status(500).json({ message: 'Failed to fetch class roster' });
  }
});

router.get('/:id/roster/export', async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const enrollments = (await storage.getAllEnrollments()).filter((e: any) =>
      e.classId === classId || e.marketplaceClassId === classId
    );
    const rows = await Promise.all(enrollments.map(async (e: any) => {
      const child = await storage.getChildById(e.childId);
      return `${child?.firstName || ''},${child?.lastName || ''},${e.status || ''}`;
    }));
    const csv = ['First Name,Last Name,Status', ...rows].join('\n');
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    return res.status(200).send(csv);
  } catch (error) {
    console.error('Error exporting roster:', error);
    return res.status(500).json({ message: 'Failed to export roster' });
  }
});

// Get class by ID
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid class ID' });
    }

    const classItem = await storage.getClassById(id);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Calculate enrollment count dynamically
    let enrollmentCount = 0;
    try {
      const allEnrollments = await (storage.getAllEnrollments?.() || Promise.resolve([]));
      enrollmentCount = allEnrollments.filter((e: any) =>
        (e.classId === classItem.id || e.marketplaceClassId === classItem.id) &&
        e.status !== 'cancelled'
      ).length;
    } catch {
      enrollmentCount = 0;
    }

    res.json({
      class: {
        ...classItem,
        enrollmentCount,
        currentEnrollment: enrollmentCount,
        spotsAvailable: Math.max(((classItem as any).maxStudents || (classItem as any).capacity || 0) - enrollmentCount, 0),
      }
    });
  } catch (error) {
    console.error('Error fetching class:', error);
    res.status(500).json({ message: 'Failed to fetch class' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid class ID' });
    const updated = await storage.updateClass(id, req.body || {});
    if (!updated) return res.status(404).json({ message: 'Class not found' });
    return res.json({ class: updated });
  } catch (error) {
    console.error('Error updating class:', error);
    return res.status(500).json({ message: 'Failed to update class' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid class ID' });

    const enrollmentsByClass = await storage.getEnrollmentsByClassId(id);
    const allEnrollments = await (storage.getAllEnrollments?.() || Promise.resolve([]));
    const merged = [...enrollmentsByClass, ...allEnrollments.filter((e: any) => e.classId === id || e.marketplaceClassId === id)];
    const seenIds = new Set<number>();
    const activeEnrollments = merged.filter((e: any) => {
      const dedupeKey = Number(e.id || 0);
      if (dedupeKey && seenIds.has(dedupeKey)) return false;
      if (dedupeKey) seenIds.add(dedupeKey);
      return e.status !== 'cancelled' && e.status !== 'completed';
    });
    if (activeEnrollments.length > 0) {
      return res.status(400).json({ error: 'Cannot delete class with active enrollments' });
    }

    await storage.deleteClass(id);
    return res.json({ message: 'Class deleted successfully' });
  } catch (error) {
    console.error('Error deleting class:', error);
    return res.status(500).json({ message: 'Failed to delete class' });
  }
});

router.post('/:id/share', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid class ID' });
    const classItem: any = await storage.getClassById(id);
    if (!classItem) return res.status(404).json({ message: 'Class not found' });

    const role = req.user?.role || req.session?.userRole;
    const canSharePrivate = role === 'admin' || role === 'superAdmin' || role === 'schoolAdmin';
    if (!classItem.isPublic && !canSharePrivate) {
      return res.status(403).json({ message: 'Insufficient permissions to share private class' });
    }

    const shareToken = classItem.shareToken || `${id}-${Math.random().toString(36).slice(2, 10)}`;
    await storage.updateClass(id, { ...(classItem.shareToken ? {} : { shareToken }) } as any);
    return res.json({ shareUrl: `/api/classes/shared/${shareToken}`, shareToken });
  } catch (error) {
    console.error('Error sharing class:', error);
    return res.status(500).json({ message: 'Failed to share class' });
  }
});

// Get classes by category name (product category)
router.get('/category/:categoryName', async (req, res) => {
  try {
    const categoryName = req.params.categoryName;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    // Get all classes first
    const allClasses = await storage.getClasses({
      page: 1,
      limit: 1000, // Large limit to get all classes
      search: '',
      category: '',
      status: 'published'
    });

    // Filter by category name, exclude admin-only and past classes
    const now = new Date();
    const filteredClasses = allClasses.filter(c => {
      if (c.isAdminOnly) return false;
      if (c.endDate && new Date(c.endDate) < now) return false;
      return c.categoryName === categoryName;
    });

    // Apply pagination manually
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedClasses = filteredClasses.slice(startIndex, endIndex);

    // Calculate enrollment counts for each class
    const classesWithEnrollmentCounts = await Promise.all(
      paginatedClasses.map(async (cls) => {
        const enrollmentCount = await storage.getEnrollmentCountForClass(cls.id);
        return {
          ...cls,
          enrollmentCount
        };
      })
    );

    res.json({
      classes: classesWithEnrollmentCounts,
      pagination: {
        page,
        limit,
        total: filteredClasses.length,
        totalPages: Math.ceil(filteredClasses.length / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching classes by category:', error);
    res.status(500).json({ message: 'Failed to fetch classes' });
  }
});

// Get unique category names (public categories only)
router.get('/categories/names', async (req, res) => {
  try {
    // Get all classes and hidden category IDs in parallel
    const [allClasses, hiddenCategoryIds] = await Promise.all([
      storage.getClasses({
        page: 1,
        limit: 1000,
        search: '',
        category: '',
        status: 'published'
      }),
      storage.getHiddenCategoryIds()
    ]);

    // Extract unique category names from active, public classes only
    const now = new Date();
    const categoryNamesMap: {[key: string]: boolean} = {};

    allClasses.forEach(c => {
      if (c.categoryName && !(c.endDate && new Date(c.endDate) < now)) {
        // Skip classes in hidden categories
        if (c.categoryId && hiddenCategoryIds.includes(c.categoryId)) return;
        categoryNamesMap[c.categoryName] = true;
      }
    });

    const categoryNames = Object.keys(categoryNamesMap);
    res.json(categoryNames);
  } catch (error) {
    console.error('Error fetching category names:', error);
    res.status(500).json({ message: 'Failed to fetch category names' });
  }
});

// Add to cart (creates pending enrollment - will be confirmed during checkout payment)
router.post('/:id/enroll', async (req, res) => {
  try {
    console.log(`📝 ADD TO CART REQUEST: Class ${req.params.id}, Body:`, req.body);

    const classId = parseInt(req.params.id);
    const { childId, variantId } = req.body;

    console.log(`📝 PARSED: classId=${classId}, childId=${childId}, variantId=${variantId}`);

    if (isNaN(classId) || !childId) {
      console.log(`📝 VALIDATION FAILED: Invalid classId or childId`);
      return res.status(400).json({ message: 'Invalid class ID or child ID' });
    }

    // Get the class to verify it exists
    const classItem = await storage.getClassById(classId);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Get the child to verify it exists
    const child = await storage.getChildById(childId);
    if (!child) {
      return res.status(404).json({ message: 'Child not found' });
    }

    // CRITICAL: Check if child is already enrolled or has a pending enrollment for this class
    const existingEnrollments = await storage.getAllEnrollments?.() || [];
    const activeEnrollment = existingEnrollments.find(e => 
      e.marketplaceClassId === classId && 
      e.childId === childId && 
      e.status !== 'cancelled' &&
      e.status !== 'completed'
    );

    if (activeEnrollment) {
      console.log(`⚠️ Child ${childId} already has an active enrollment for class ${classId}:`, activeEnrollment);
      // Return the existing enrollment instead of creating a duplicate
      return res.json({ 
        message: 'Already in cart or enrolled',
        enrollment: activeEnrollment,
        isWaitlisted: activeEnrollment.status === 'waitlist',
        waitlistPosition: activeEnrollment.waitlistPosition,
        isDuplicate: true
      });
    }

    // Check class capacity and enrollment count
    const capacity = classItem.capacity || 0;
    const currentEnrollmentCount = classItem.enrollmentCount || 0;
    const isAtCapacity = capacity > 0 && currentEnrollmentCount >= capacity;

    // Calculate waitlist position if at capacity
    let waitlistPosition = null;
    let enrollmentStatus = 'pending_payment'; // DEFAULT: pending until payment confirmed
    
    if (isAtCapacity) {
      // Get current waitlist count for this class
      const waitlistCount = classItem.totalWaitlisted || 0;
      waitlistPosition = waitlistCount + 1; // Next position in waitlist
      enrollmentStatus = 'waitlist'; // Waitlist doesn't require payment first
      
      console.log(`⚠️ Class is at capacity (${currentEnrollmentCount}/${capacity}). Adding to waitlist at position ${waitlistPosition}`);
    } else {
      console.log(`✅ Class has ${capacity - currentEnrollmentCount} spots available`);
    }

    // VARIANT PRICE CALCULATION: Use selected variant price or fall back to class price
    let classPrice = classItem.price || 90000; // Default $900 in cents
    let selectedVariantName: string | null = null;
    
    // Parse variants from schedule field and find the selected variant
    if (variantId && classItem.schedule) {
      try {
        const schedule = typeof classItem.schedule === 'string' 
          ? JSON.parse(classItem.schedule) 
          : classItem.schedule;
        
        if (schedule && Array.isArray(schedule.variants)) {
          const selectedVariant = schedule.variants.find((v: any) => v.id === variantId);
          if (selectedVariant && selectedVariant.price) {
            classPrice = selectedVariant.price;
            selectedVariantName = selectedVariant.name || null;
            console.log(`💰 Using variant price: ${classPrice} cents for variant "${selectedVariantName}" (${variantId})`);
          }
        }
      } catch (error) {
        console.error(`⚠️ Error parsing variants from schedule:`, error);
        // Fall back to class price
      }
    }

    let finalPrice = classPrice;
    let prorateFields: any = {};
    if (classItem.prorateEnabled && classItem.startDate && classItem.endDate) {
      const { calculateProratedPrice } = await import('../lib/prorate-calculator.js');
      const prorateResult = calculateProratedPrice(classPrice, classItem.startDate, classItem.endDate);
      if (prorateResult.proratePercentage < 100) {
        finalPrice = prorateResult.proratedPriceCents;
        prorateFields = {
          proratedFromCents: classPrice,
          proratePercentage: prorateResult.proratePercentage,
          prorateDate: new Date().toISOString(),
          prorateReason: prorateResult.reason,
        };
        console.log(`📊 Pro-rated: ${classPrice} → ${finalPrice} cents (${prorateResult.proratePercentage}%)`);
      }
    }

    const enrollmentData = createEnrollmentDataSimple({
      schoolId: classItem.schoolId || 1,
      classType: 'marketplace',
      classId: null,
      marketplaceClassId: classId,
      childId: childId,
      childName: `${child.firstName} ${child.lastName}`,
      className: classItem.title,
      variantId: variantId || null,
      parentId: child.parentId,
      parentEmail: child.parentEmail || '',
      totalCost: finalPrice,
      totalPaid: 0,
      remainingBalance: finalPrice,
      depositRequired: 0,
      paymentStatus: 'pending',
      paymentPlan: null,
      paymentFrequency: 'one_time',
      programStartDate: classItem.startDate || null,
      programEndDate: classItem.endDate || null,
      status: enrollmentStatus as any, // 'pending_payment' or 'waitlist'
      waitlistPosition: waitlistPosition,
      stripeSubscriptionId: null,
      stripeCustomerId: null
    });
    
    if (Object.keys(prorateFields).length > 0) {
      Object.assign(enrollmentData, prorateFields);
    }

    console.log(`💰 Enrollment created with variant: ${variantId || 'none'}, variantName: "${selectedVariantName || 'none'}", price: ${finalPrice} cents${prorateFields.proratedFromCents ? ` (prorated from ${prorateFields.proratedFromCents})` : ''}`);

    console.log(`📝 PENDING ENROLLMENT CREATED (will be confirmed after payment):`, enrollmentData);

    const savedEnrollment = await storage.createProgramEnrollment(enrollmentData);
    console.log(`📝 ENROLLMENT SAVED with ID ${savedEnrollment.id}, status: ${enrollmentStatus}`);

    // Send appropriate message based on enrollment status
    const message = enrollmentStatus === 'waitlist'
      ? `Added to waitlist at position #${waitlistPosition}. You'll be notified when a spot opens up.`
      : 'Added to cart - proceed to checkout to complete enrollment';
    
    console.log(`✅ ${enrollmentStatus === 'waitlist' ? 'Waitlisted' : 'Added to cart'} ${child.firstName} ${child.lastName} in class: ${classItem.title}`);

    if (enrollmentStatus === 'waitlist') {
      try {
        const parent = child.parentId ? await storage.getUser(child.parentId) : null;
        const parentEmailAddr = parent?.email || child.parentEmail || '';
        const parentName = parent ? `${parent.firstName || ''} ${parent.lastName || ''}`.trim() || 'Parent' : 'Parent';
        
        if (parentEmailAddr) {
          await sendWaitlistJoinedEmail({
            parentEmail: parentEmailAddr,
            parentName,
            childName: `${child.firstName} ${child.lastName}`,
            className: classItem.title,
            waitlistPosition: waitlistPosition || 0,
            programStartDate: classItem.startDate ? new Date(classItem.startDate) : undefined
          });
          console.log(`📧 Sent waitlist joined email to ${parentEmailAddr}`);
        }
      } catch (emailError) {
        console.error('⚠️ Failed to send waitlist email (non-blocking):', emailError);
      }
    }

    res.json({ 
      message,
      enrollment: savedEnrollment,
      isWaitlisted: enrollmentStatus === 'waitlist',
      waitlistPosition: waitlistPosition,
      isDuplicate: false
    });

  } catch (error) {
    console.error('❌ ERROR adding to cart:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('❌ Error details:', {
      message: error instanceof Error ? error.message : String(error),
      classId: req.params.id,
      body: req.body
    });
    res.status(500).json({ 
      message: 'Failed to add to cart',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Helper function to promote next waitlisted student
async function promoteNextWaitlistedStudent(classId: number) {
  try {
    // Get all enrollments for this class
    const allEnrollments = await storage.getAllEnrollments?.() || [];
    
    // Filter waitlisted enrollments for this class
    const waitlistedEnrollments = allEnrollments
      .filter((e: any) => e.classId === classId && e.status === 'waitlist')
      .sort((a: any, b: any) => (a.waitlistPosition || 0) - (b.waitlistPosition || 0));
    
    if (waitlistedEnrollments.length === 0) {
      console.log('📋 No waitlisted students to promote');
      return null;
    }
    
    // Get the first student in waitlist (lowest position number)
    const nextStudent = waitlistedEnrollments[0];
    
    console.log(`🎯 Promoting student from waitlist: ${nextStudent.childName} (position ${nextStudent.waitlistPosition})`);
    
    // Update the enrollment status to enrolled
    await storage.updateProgramEnrollment(nextStudent.id, {
      status: 'enrolled',
      waitlistPosition: null
    });
    
    // Update waitlist positions for remaining students
    for (let i = 1; i < waitlistedEnrollments.length; i++) {
      const student = waitlistedEnrollments[i];
      await storage.updateProgramEnrollment(student.id, {
        waitlistPosition: i // New position (1-indexed)
      });
    }
    
    console.log(`✅ Promoted ${nextStudent.childName} from waitlist to enrolled`);
    
    // Send email notification to parent
    try {
      const classData = await storage.getClassById(classId);
      // Try to get parent email - you may need to adapt this based on your data structure
      // For now, we'll log that we need parent contact info
      // In a real scenario, you'd need to fetch this from the enrollment or child record
      console.log(`📧 Email notification needed for promotion: ${nextStudent.childName} to ${classData?.title}`);
      
      // If we have parent email in the enrollment data, send the email
      if (nextStudent.parentEmail && classData) {
        // Extract parent name from email or use default
        const parentName = nextStudent.parentEmail.split('@')[0] || 'Parent';
        await sendWaitlistPromotedEmail({
          parentEmail: nextStudent.parentEmail,
          parentName: parentName,
          childName: nextStudent.childName,
          className: classData.title,
          programStartDate: classData.startDate ? new Date(classData.startDate) : undefined,
          price: classData.price || 0
        });
        console.log(`📧 Sent waitlist promotion email to ${nextStudent.parentEmail}`);
      }
    } catch (emailError) {
      console.error('Error sending promotion email:', emailError);
      // Don't fail the promotion if email fails
    }
    
    return nextStudent;
  } catch (error) {
    console.error('Error promoting waitlisted student:', error);
    return null;
  }
}

// Unenroll a child from a class
router.delete('/:id/enroll/:enrollmentId', async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const enrollmentId = parseInt(req.params.enrollmentId);

    console.log(`📝 UNENROLLMENT REQUEST: Class ${classId}, Enrollment ${enrollmentId}`);

    if (isNaN(classId) || isNaN(enrollmentId)) {
      return res.status(400).json({ message: 'Invalid class ID or enrollment ID' });
    }

    // Get the enrollment to verify it exists and check status
    const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    // Only allow unenrollment if not completed or cancelled
    if (enrollment.status === 'completed' || enrollment.status === 'cancelled') {
      return res.status(400).json({ 
        message: 'Cannot unenroll from a class that is completed or cancelled' 
      });
    }

    // Delete the enrollment
    await storage.deleteProgramEnrollment(enrollmentId);

    console.log(`✅ Successfully unenrolled child from class: ${enrollment.className}`);

    // If this was an enrolled student (not waitlisted), try to promote next waitlisted student
    if (enrollment.status === 'enrolled') {
      const promoted = await promoteNextWaitlistedStudent(classId);
      
      if (promoted) {
        console.log(`🎉 Auto-promoted ${promoted.childName} from waitlist`);
      }
    }

    res.json({ 
      message: 'Unenrollment successful',
      enrollmentId: enrollmentId
    });

  } catch (error) {
    console.error('Error unenrolling child from class:', error);
    res.status(500).json({ message: 'Failed to unenroll child from class' });
  }
});

// Get published classes
router.get("/published", async (req, res) => {
  try {
    const { schoolId } = req.query;
    const allClasses = await storage.getAllClasses();
    const now = new Date();
    let classes = allClasses.filter((c: any) => {
      if (!(c.published || c.status === 'active')) return false;
      if (c.endDate && new Date(c.endDate) < now) return false;
      return true;
    });

    // Filter by school if schoolId is provided
    if (schoolId) {
      classes = classes.filter((cls: any) => cls.schoolId === parseInt(schoolId as string));
    }

    res.json(classes);
  } catch (error: any) {
    console.error("Error fetching published classes:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;