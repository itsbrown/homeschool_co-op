import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { storage } from '../storage';
import { jwtCheck } from '../middleware/auth0-auth';
import { sendNewStudentNotificationEmail } from '../lib/email-service';
import { isActiveMembership } from '@shared/schema';

const router = Router();

// Get children for the authenticated parent
router.get('/children', jwtCheck, async (req: any, res) => {
  try {
    console.log('👨‍👩‍👧‍👦 Children API called - Headers:', Object.keys(req.headers));

    // Get the authenticated user's email from the auth middleware
    const userEmail = req.auth?.email || req.user?.email;
    
    if (!userEmail) {
      console.log('❌ No authenticated user found');
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_USER_EMAIL',
        debug: 'Please log in to access children data'
      });
    }

    console.log('👨‍👩‍👧‍👦 Parent requesting children for email:', userEmail);

    // Get children by parent email from storage
    console.log('🔍 Attempting to fetch children from storage...');
    
    // Debug: Get all children to see what's in storage
    const allChildren = await storage.getAllChildren();
    console.log('🔍 All children in storage:', allChildren.map(c => ({ 
      id: c.id, 
      firstName: c.firstName, 
      lastName: c.lastName 
    })));
    
    const children = await storage.getChildrenByParentEmail(userEmail);

    console.log(`🔍 Found ${children.length} children for parent ${userEmail}:`, children);

    if (!children || children.length === 0) {
      console.log('ℹ️ No children found for this user.');
      return res.status(200).json([]);
    }

    // Transform children data to ensure consistent format
    const transformedChildren = children.map(child => ({
      id: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
      birthdate: child.birthdate,
      gradeLevel: child.gradeLevel,
      gender: child.gender,
      parentId: child.parentId,
      specialNeeds: child.specialNeeds,
      interests: child.interests,
      school: child.school,
      learningStyle: child.learningStyle,
      allergies: child.allergies,
      medicalInfo: child.medicalInfo,
      profileImage: child.profileImage,
      emergencyContact: child.emergencyContact,
      additionalLanguages: child.additionalLanguages,
      notes: child.notes,
      createdAt: child.createdAt,
      updatedAt: child.updatedAt
    }));

    return res.status(200).json(transformedChildren);
  } catch (error) {
    console.error('❌ Error fetching children:', error);
    return res.status(500).json({ 
      message: 'Internal server error',
      error: 'CHILDREN_FETCH_ERROR',
      debug: 'Failed to fetch children from database'
    });
  }
});

// Get a specific child by ID (parent must own the child)
router.get('/children/:id', jwtCheck, async (req: any, res) => {
  try {
    const childId = parseInt(req.params.id);
    const userEmail = req.auth?.email || req.user?.email;
    
    if (!userEmail) {
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_USER_EMAIL'
      });
    }
    
    if (isNaN(childId)) {
      return res.status(400).json({ 
        message: 'Invalid child ID',
        error: 'INVALID_ID'
      });
    }
    
    // Get the child
    const child = await storage.getChildById(childId);
    
    if (!child) {
      return res.status(404).json({ 
        message: 'Child not found',
        error: 'CHILD_NOT_FOUND'
      });
    }
    
    // 🔒 SECURITY: Verify parent owns this child
    if (child.parentEmail !== userEmail) {
      return res.status(403).json({ 
        message: 'Access denied: You can only view your own children',
        error: 'NOT_YOUR_CHILD'
      });
    }
    
    return res.status(200).json(child);
  } catch (error) {
    console.error('❌ Error fetching child:', error);
    return res.status(500).json({ 
      message: 'Internal server error',
      error: 'CHILD_FETCH_ERROR'
    });
  }
});

// Register a new child
router.post('/children', jwtCheck, async (req: any, res) => {
  try {
    console.log('👶 Child registration API called');

    // Get the authenticated user's email from the auth middleware
    const userEmail = req.auth?.email || req.user?.email;
    
    if (!userEmail) {
      console.log('❌ No authenticated user found');
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_USER_EMAIL'
      });
    }

    console.log('👶 Parent registering child for email:', userEmail);

    const { 
      firstName, 
      lastName, 
      birthdate, 
      gradeLevel, 
      gender,
      interests, 
      learningStyle, 
      specialNeeds, 
      allergies, 
      medicalInfo,
      school,
      profileImage,
      emergencyContact,
      emergencyPhone,
      parentPhone,
      additionalLanguages,
      notes
    } = req.body;

    console.log('👶 Child registration data:', { firstName, lastName, gradeLevel, userEmail });

    // Validate required fields
    if (!firstName || !lastName || !birthdate || !gradeLevel) {
      console.log('❌ Missing required fields for child registration');
      return res.status(400).json({ 
        message: 'Missing required fields',
        required: ['firstName', 'lastName', 'birthdate', 'gradeLevel']
      });
    }

    // Find the parent user to get their ID
    const parent = await storage.getUserByEmail(userEmail);
    if (!parent) {
      console.log('❌ Parent user not found:', userEmail);
      return res.status(404).json({ 
        message: 'Parent user not found',
        error: 'PARENT_NOT_FOUND'
      });
    }

    // Calculate age from birthdate
    const birthDate = new Date(birthdate);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    // Validate and get parent's school and location data
    let validSchoolId = null;
    let parentLocationId = null;
    
    if (parent.schoolId) {
      // Verify the school exists in the database
      try {
        const school = await storage.getSchool(parent.schoolId);
        if (school) {
          validSchoolId = parent.schoolId;
          console.log('✅ Validated school exists:', school.name);
          
          // Get the primary location for the parent's school
          const locations = await storage.getLocationsBySchoolId(parent.schoolId);
          if (locations && locations.length > 0) {
            parentLocationId = locations[0].id;
          }
        } else {
          console.log('⚠️ Parent has invalid schoolId, will create child without school assignment');
        }
      } catch (error) {
        console.log('⚠️ Could not validate parent school, child will be created without school assignment:', error);
      }
    }

    console.log('🏠 Parent location inheritance:', {
      parentSchoolId: validSchoolId,
      parentLocationId,
      parentEmail: userEmail
    });

    // Create the new child object with validated school/location
    const newChild = {
      firstName,
      lastName,
      birthdate,
      gradeLevel,
      gender: gender || null,
      interests: interests || null,
      learningStyle: learningStyle || null,
      specialNeeds: specialNeeds || null,
      allergies: allergies || null,
      medicalInfo: medicalInfo || null,
      school: school || null,
      schoolId: validSchoolId, // Only set if school exists in database
      locationId: parentLocationId, // Only set if school exists and has locations
      profileImage: profileImage || null,
      emergencyContact: emergencyContact || null,
      additionalLanguages: additionalLanguages || null,
      notes: notes || null,
      parentId: parent.id,
      parentEmail: userEmail
    };

    console.log('👶 Creating child in storage:', newChild);

    // Save to storage (this will handle both file and database storage)
    const savedChild = await storage.createChild(newChild);

    console.log('✅ Child registered successfully:', savedChild);

    // Create school_student record if child has a valid schoolId
    if (savedChild.schoolId && validSchoolId) {
      try {
        console.log('📚 Creating school_student record for child:', savedChild.id);
        const schoolStudent = await storage.createSchoolStudent({
          schoolId: validSchoolId,
          childId: savedChild.id,
          grade: gradeLevel,
          status: 'active',
          locationId: parentLocationId || null,
          studentId: null,
          notes: null
        });
        console.log('✅ School student record created:', schoolStudent);
      } catch (schoolStudentError) {
        console.error('⚠️ Failed to create school_student record:', schoolStudentError);
        // Don't fail the entire registration if this fails - child is already created
      }
    }

    // 🔔 Notify school admins about new student registration
    if (validSchoolId) {
      try {
        console.log('🔔 Sending notifications to school admins for school:', validSchoolId);
        
        // Fetch all users and filter for school admins
        const allUsers = await storage.getAllUsers();
        const schoolAdmins = allUsers.filter(user => 
          user.schoolId === validSchoolId && 
          (user.role === 'schoolAdmin' || user.role === 'superAdmin')
        );
        console.log(`📋 Found ${schoolAdmins.length} school admin(s) to notify`);
        
        // Get school details for better notifications
        const school = await storage.getSchool(validSchoolId);
        const schoolName = school?.name || 'Your School';
        
        // Only send notifications if we have admins
        if (schoolAdmins.length > 0) {
          // Send email notifications to each admin
          for (const admin of schoolAdmins) {
            try {
              const emailSent = await sendNewStudentNotificationEmail({
                adminEmail: admin.email,
                adminName: admin.name || `${admin.firstName} ${admin.lastName}`,
                schoolName: schoolName,
                studentFirstName: firstName,
                studentLastName: lastName,
                studentGradeLevel: gradeLevel,
                parentEmail: userEmail,
                parentPhone: parentPhone || parent.phone,
                registrationDate: new Date()
              });
              
              if (emailSent) {
                console.log(`✅ Sent email notification to admin: ${admin.email}`);
              } else {
                console.log(`⚠️ Email notification failed for admin: ${admin.email}`);
              }
            } catch (notificationError) {
              const error = notificationError as Error;
              console.error(`❌ Failed to notify admin ${admin.email}:`, error.message);
              // Continue notifying other admins even if one fails
            }
          }
        }
        
        console.log('✅ Admin notification process completed');
      } catch (notificationError) {
        const error = notificationError as Error;
        console.error('⚠️ Error during admin notification process:', error.message);
        // Don't fail registration if notifications fail
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Child registered successfully',
      child: savedChild
    });

  } catch (error) {
    console.error('❌ Error registering child:', error);
    return res.status(500).json({ 
      message: 'Internal server error',
      error: 'CHILD_REGISTRATION_ERROR',
      debug: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get enrollments for the authenticated parent's children
router.get('/enrollments', jwtCheck, async (req: any, res) => {
  try {
    console.log('📚 Parent enrollments API called');

    // Get the authenticated user's email from the auth middleware
    const userEmail = req.auth?.email || req.user?.email;
    
    if (!userEmail) {
      console.log('❌ No authenticated user found');
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_USER_EMAIL'
      });
    }

    console.log('📚 Parent requesting enrollments for email:', userEmail);

    // Get all enrollments from storage
    const allEnrollments = await storage.getAllEnrollments();
    
    // Filter enrollments for this parent's email
    const parentEnrollments = allEnrollments.filter((enrollment: any) => 
      enrollment.parentEmail === userEmail
    );

    console.log(`📚 Found ${parentEnrollments.length} enrollments for parent ${userEmail}`);

    return res.status(200).json(parentEnrollments);
  } catch (error) {
    console.error('❌ Error fetching enrollments:', error);
    return res.status(500).json({ 
      message: 'Internal server error',
      error: 'ENROLLMENTS_FETCH_ERROR'
    });
  }
});

// Get membership enrollments for the authenticated parent
router.get('/memberships', jwtCheck, async (req: any, res) => {
  try {
    console.log('🎫 Parent memberships API called');

    const userEmail = req.auth?.email || req.user?.email;
    
    if (!userEmail) {
      console.log('❌ No authenticated user found');
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_USER_EMAIL'
      });
    }

    console.log('🎫 Parent requesting memberships for email:', userEmail);

    // Get the parent user from database
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      console.log('❌ User not found in database');
      return res.status(404).json({ 
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Get all membership enrollments for this parent
    const memberships = await storage.getMembershipEnrollmentsByParentId(user.id);
    console.log(`🎫 Found ${memberships.length} membership enrollments for parent ${userEmail}`);

    // Enrich with school information
    const enrichedMemberships = await Promise.all(
      memberships.map(async (membership) => {
        const school = await storage.getSchool(membership.schoolId);
        return {
          ...membership,
          schoolName: school?.name || 'Unknown School',
          schoolLogo: school?.logo || null,
          membershipFeeAmount: school?.membershipFeeAmount || 0,
          membershipDescription: school?.membershipDescription || null
        };
      })
    );

    return res.status(200).json(enrichedMemberships);
  } catch (error) {
    console.error('❌ Error fetching memberships:', error);
    return res.status(500).json({ 
      message: 'Internal server error',
      error: 'MEMBERSHIPS_FETCH_ERROR'
    });
  }
});

// Get membership details after successful Stripe payment
router.get('/memberships/confirm', jwtCheck, async (req: any, res) => {
  try {
    console.log('✅ Confirming membership payment');

    const userEmail = req.auth?.email || req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_USER_EMAIL'
      });
    }

    const sessionId = req.query.session_id as string;
    if (!sessionId) {
      return res.status(400).json({ 
        message: 'Session ID is required',
        error: 'MISSING_SESSION_ID'
      });
    }

    // Get the parent user from database
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Import Stripe client and retrieve session
    const { getStripeClient } = await import('../config/stripe');
    const stripe = await getStripeClient();
    
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'line_items']
    });
    
    // Check payment status - accept 'paid' or 'no_payment_required' (for $0 subscriptions)
    if (!session || (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required')) {
      console.log('❌ Payment status:', session?.payment_status);
      return res.status(400).json({ 
        message: 'Payment not completed',
        error: 'PAYMENT_NOT_COMPLETED',
        paymentStatus: session?.payment_status
      });
    }

    // For subscription mode, also verify subscription status
    if (session.mode === 'subscription' && session.subscription) {
      const subscription = typeof session.subscription === 'string' 
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;
      
      // Only accept active or trialing subscriptions
      if (!['active', 'trialing'].includes(subscription.status)) {
        console.log('⚠️ Subscription status not active:', subscription.status);
        return res.status(400).json({ 
          message: 'Subscription not active',
          error: 'SUBSCRIPTION_NOT_ACTIVE',
          subscriptionStatus: subscription.status
        });
      }
    }

    // Get membership enrollment ID from session metadata
    const membershipEnrollmentId = session.metadata?.membershipEnrollmentId;
    if (!membershipEnrollmentId) {
      return res.status(400).json({ 
        message: 'Membership enrollment not found in session',
        error: 'NO_ENROLLMENT_ID'
      });
    }

    // Get membership enrollment
    const membership = await storage.getMembershipEnrollmentById(parseInt(membershipEnrollmentId));
    if (!membership) {
      return res.status(404).json({ 
        message: 'Membership enrollment not found',
        error: 'MEMBERSHIP_NOT_FOUND'
      });
    }

    // Get school info
    const school = await storage.getSchool(membership.schoolId);

    // Get amount paid from session
    const amountPaid = session.amount_total || membership.amount;

    // Return membership details for the success page
    return res.status(200).json({
      membershipEnrollmentId: membership.id,
      schoolName: school?.name || session.metadata?.schoolName || 'Your School',
      membershipYear: membership.membershipYear || new Date().getFullYear(),
      amount: amountPaid,
      amountPaid: amountPaid,
      tier: membership.membershipTier || session.metadata?.tier,
      status: membership.status,
      expirationDate: membership.expirationDate,
      paymentStatus: session.payment_status,
      subscriptionActive: true
    });
  } catch (error: any) {
    console.error('❌ Error confirming membership:', error);
    return res.status(500).json({ 
      message: 'Failed to confirm membership',
      error: error.message || 'CONFIRM_ERROR'
    });
  }
});

// Create Stripe checkout session for parent's membership payment
router.post('/memberships/checkout', jwtCheck, async (req: any, res) => {
  try {
    console.log('💳 Parent membership checkout API called');

    const userEmail = req.auth?.email || req.user?.email;
    
    if (!userEmail) {
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_USER_EMAIL'
      });
    }

    const { membershipEnrollmentId, tier } = req.body;

    if (!membershipEnrollmentId) {
      return res.status(400).json({ 
        message: 'Membership enrollment ID is required',
        error: 'MISSING_MEMBERSHIP_ID'
      });
    }

    // Get the parent user from database
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Get the membership enrollment
    const membership = await storage.getMembershipEnrollmentById(membershipEnrollmentId);
    if (!membership) {
      return res.status(404).json({ 
        message: 'Membership enrollment not found',
        error: 'MEMBERSHIP_NOT_FOUND'
      });
    }

    // Security check: Verify the parent owns this membership
    if (membership.parentUserId !== user.id) {
      console.log(`❌ Security violation: User ${user.id} attempted to pay for membership owned by user ${membership.parentUserId}`);
      return res.status(403).json({ 
        message: 'Access denied: You can only pay for your own memberships',
        error: 'NOT_YOUR_MEMBERSHIP'
      });
    }

    // Check if membership is already paid (enrolled means active/paid)
    if (membership.status === 'enrolled') {
      return res.status(400).json({ 
        message: 'This membership is already active',
        error: 'ALREADY_ACTIVE'
      });
    }

    // Get school configuration
    const school = await storage.getSchool(membership.schoolId);
    if (!school) {
      return res.status(404).json({ 
        message: 'School not found',
        error: 'SCHOOL_NOT_FOUND'
      });
    }

    // Get membership fee amount (in cents)
    const membershipFeeAmount = school.membershipFeeAmount || 0;
    if (membershipFeeAmount <= 0) {
      return res.status(400).json({ 
        message: 'School does not have a membership fee configured',
        error: 'NO_FEE_CONFIGURED'
      });
    }

    // Import Stripe client
    const { getStripeClient } = await import('../config/stripe');
    const stripe = await getStripeClient();

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      console.log(`Creating new Stripe customer for parent ${user.email}`);
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user.id.toString(),
          schoolId: membership.schoolId.toString(),
          membershipEnrollmentId: membershipEnrollmentId.toString()
        }
      });
      customerId = customer.id;

      // Update user with customer ID
      await storage.updateUser(user.id, { stripeCustomerId: customerId });
      console.log(`✅ Created Stripe customer ${customerId} for parent ${user.email}`);
    }

    // Determine tier pricing
    const selectedTier = tier || membership.membershipTier || 'basic';
    const priceInCents = membershipFeeAmount;

    // Create Stripe Checkout Session with subscription
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${school.name} - Annual Membership (${selectedTier})`,
              description: school.membershipDescription || 'Annual family membership',
              metadata: {
                schoolId: membership.schoolId.toString(),
                tier: selectedTier
              }
            },
            unit_amount: priceInCents,
            recurring: {
              interval: 'year',
              interval_count: 1
            }
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          membershipEnrollmentId: membershipEnrollmentId.toString(),
          schoolId: membership.schoolId.toString(),
          parentUserId: user.id.toString(),
          tier: selectedTier
        }
      },
      success_url: `${req.protocol}://${req.get('host')}/membership-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/parent`,
      metadata: {
        membershipEnrollmentId: membershipEnrollmentId.toString(),
        schoolId: membership.schoolId.toString(),
        parentUserId: user.id.toString(),
        tier: selectedTier
      }
    });

    console.log(`✅ Created Stripe Checkout Session ${session.id} for parent membership ${membershipEnrollmentId}`);
    res.status(200).json({ 
      sessionUrl: session.url,
      sessionId: session.id
    });
  } catch (error: any) {
    console.error('❌ Error creating membership checkout session:', error);
    res.status(500).json({ 
      message: 'Failed to create checkout session',
      error: error.message || 'CHECKOUT_ERROR'
    });
  }
});

// Get parent's member ID and membership status
router.get('/member-id', jwtCheck, async (req: any, res) => {
  try {
    console.log('🎫 Get member ID API called');

    const userEmail = req.auth?.email || req.user?.email;
    
    if (!userEmail) {
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_USER_EMAIL'
      });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Check actual membership enrollment status for accurate badge display
    const currentYear = new Date().getFullYear();
    const memberships = await storage.getMembershipEnrollmentsByParentId(user.id);
    
    // Find the most recent membership for current or next year
    const relevantMembership = memberships?.find((m: any) => 
      (m.membershipYear === currentYear || m.membershipYear === currentYear + 1)
    );
    
    // Use shared isActiveMembership helper for consistent status checking
    const isActiveMember = relevantMembership ? isActiveMembership(relevantMembership.status) : false;
    
    // hasMemberId: Whether user has a member ID (for copy/edit controls - any member with ID)
    // hasMembership: Whether membership is actively paid (for "Active Member" badge)
    return res.status(200).json({
      memberId: user.memberId || null,
      hasMemberId: !!user.memberId && user.memberId.trim() !== '',
      hasMembership: isActiveMember,
      membershipStatus: relevantMembership?.status || null
    });
  } catch (error: any) {
    console.error('❌ Error getting member ID:', error);
    return res.status(500).json({ 
      message: 'Failed to get member ID',
      error: error.message || 'GET_MEMBER_ID_ERROR'
    });
  }
});

// Save/update parent's member ID (used when parent enters an existing member ID)
router.put('/member-id', jwtCheck, async (req: any, res) => {
  try {
    console.log('🎫 Update member ID API called');

    const userEmail = req.auth?.email || req.user?.email;
    
    if (!userEmail) {
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_USER_EMAIL'
      });
    }

    const { memberId } = req.body;

    // Validate memberId format if provided
    if (memberId !== null && memberId !== '') {
      const { isValidMemberIdFormat } = await import('../utils/membership');
      if (!isValidMemberIdFormat(memberId)) {
        return res.status(400).json({ 
          message: 'Invalid member ID format. Expected format: ASA-YEAR-XXXXXX (e.g., ASA-2025-X7K9M2)',
          error: 'INVALID_FORMAT'
        });
      }
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Update user's member ID
    const updatedUser = await storage.updateUser(user.id, { 
      memberId: memberId || null 
    });

    console.log(`✅ Updated member ID for user ${user.id}: ${memberId || 'cleared'}`);

    return res.status(200).json({
      success: true,
      memberId: updatedUser.memberId || null,
      hasMembership: !!updatedUser.memberId && updatedUser.memberId.trim() !== ''
    });
  } catch (error: any) {
    console.error('❌ Error updating member ID:', error);
    return res.status(500).json({ 
      message: 'Failed to update member ID',
      error: error.message || 'UPDATE_MEMBER_ID_ERROR'
    });
  }
});

// Get school documents published for parents
router.get('/school-documents', jwtCheck, async (req: any, res) => {
  try {
    console.log('📄 Get parent school documents API called');

    const userEmail = req.auth?.email || req.user?.email;
    
    if (!userEmail) {
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_USER_EMAIL'
      });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Get the parent's school ID
    if (!user.schoolId) {
      return res.status(200).json({ 
        success: true,
        documents: []
      });
    }

    // Get published documents for the parent's school
    const documents = await storage.getPublishedSchoolDocuments(user.schoolId);

    console.log(`📄 Found ${documents.length} school documents for parent ${userEmail}`);

    return res.status(200).json({
      success: true,
      documents
    });
  } catch (error: any) {
    console.error('❌ Error getting school documents:', error);
    return res.status(500).json({ 
      message: 'Failed to get school documents',
      error: error.message || 'GET_SCHOOL_DOCUMENTS_ERROR'
    });
  }
});

// Get parent's available credits balance
router.get('/credits', jwtCheck, async (req: any, res) => {
  try {
    console.log('💰 Get parent credits API called');

    const userEmail = req.auth?.email || req.user?.email;
    
    if (!userEmail) {
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_USER_EMAIL'
      });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Get available credits for this user from unified credit system
    const availableCredits = await storage.getAvailableCredits(user.id);
    
    // Detailed logging for debugging
    console.log(`💰 [DEBUG] Raw credits from getAvailableCredits for user ${user.id}:`, 
      availableCredits.map(c => ({
        id: c.id,
        type: c.creditType,
        amount: c.creditAmountCents,
        used: c.usedAmountCents,
        remaining: c.creditAmountCents - c.usedAmountCents,
        status: c.status
      }))
    );
    
    // Calculate total available balance (approved credits minus used amounts)
    const totalAvailableCents = availableCredits.reduce((sum, credit) => {
      const remaining = (credit.creditAmountCents || 0) - (credit.usedAmountCents || 0);
      return sum + Math.max(0, remaining);
    }, 0);

    // Group credits by type for display
    const creditsByType: Record<string, { count: number; totalCents: number }> = {};
    for (const credit of availableCredits) {
      const remaining = (credit.creditAmountCents || 0) - (credit.usedAmountCents || 0);
      if (remaining > 0) {
        if (!creditsByType[credit.creditType]) {
          creditsByType[credit.creditType] = { count: 0, totalCents: 0 };
        }
        creditsByType[credit.creditType].count++;
        creditsByType[credit.creditType].totalCents += remaining;
      }
    }

    console.log(`💰 Found ${availableCredits.length} credits totaling $${(totalAvailableCents / 100).toFixed(2)} for ${userEmail}`);

    return res.status(200).json({
      success: true,
      totalAvailableCents,
      totalAvailableFormatted: `$${(totalAvailableCents / 100).toFixed(2)}`,
      creditsByType,
      credits: availableCredits.map(c => ({
        id: c.id,
        creditType: c.creditType,
        title: c.title,
        creditAmountCents: c.creditAmountCents,
        usedAmountCents: c.usedAmountCents,
        remainingCents: (c.creditAmountCents || 0) - (c.usedAmountCents || 0),
        status: c.status,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt
      }))
    });
  } catch (error: any) {
    console.error('❌ Error getting credits:', error);
    return res.status(500).json({ 
      message: 'Failed to get credits',
      error: error.message || 'GET_CREDITS_ERROR'
    });
  }
});

// Get payment receipts for the parent
router.get('/payment-receipts', jwtCheck, async (req: any, res) => {
  try {
    console.log('🧾 Get parent payment receipts API called');

    const userEmail = req.auth?.email || req.user?.email;
    
    if (!userEmail) {
      return res.status(401).json({ 
        message: 'Authentication required',
        error: 'NO_USER_EMAIL'
      });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Get payment receipts for this parent
    const receipts = await storage.getPaymentReceiptsByParentId(user.id);

    // Enrich with school name
    const enrichedReceipts = await Promise.all(
      receipts.map(async (receipt) => {
        const school = await storage.getSchool(receipt.schoolId);
        return {
          ...receipt,
          schoolName: school?.name || 'Unknown School'
        };
      })
    );

    console.log(`🧾 Found ${receipts.length} payment receipts for parent ${userEmail}`);

    return res.status(200).json({
      success: true,
      receipts: enrichedReceipts
    });
  } catch (error: any) {
    console.error('❌ Error getting payment receipts:', error);
    return res.status(500).json({ 
      message: 'Failed to get payment receipts',
      error: error.message || 'GET_PAYMENT_RECEIPTS_ERROR'
    });
  }
});

export default router;