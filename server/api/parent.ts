import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { storage } from '../storage';
import { jwtCheck } from '../middleware/auth0-auth';
import { createChildLinkedToParent } from '../lib/parent-child-registration';
import { getChildrenForAuthenticatedParent, resolveParentDbUser } from '../lib/parent-auth-scope';
import { ensurePendingMembershipEnrollmentForCheckout } from '../lib/ensure-pending-membership-enrollment';
import {
  isMembershipFullyPaidForCheckout,
  parentHasMemberIdForCheckout,
  resolveMembershipOwedForCheckout,
} from '../utils/cart-pricing';
import { enrollmentMatchesParent, emailsMatch } from '@shared/parent-identity';
import { runMembershipReconcileForParentUser } from '../lib/reconcile-membership-ledger';
import { resolveChildRegisteredLocation, resolveRegisteredLocation } from '../lib/parent-registered-location';

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
    
    // Avoid hard dependency on getAllChildren in tests where DB may be unavailable.
    try {
      const allChildren = await storage.getAllChildren();
      console.log('🔍 All children in storage:', allChildren.map(c => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName
      })));
    } catch {
      // Optional debug only.
    }
    
    const children = await getChildrenForAuthenticatedParent(storage, {
      email: userEmail,
      supabaseId: req.auth?.supabaseId,
    });

    console.log(`🔍 Found ${children.length} children for parent ${userEmail}:`, children);

    if (!children || children.length === 0) {
      console.log('ℹ️ No children found for this user.');
      return res.status(200).json([]);
    }

    const dbUser = await resolveParentDbUser(storage, {
      email: userEmail,
      supabaseId: req.auth?.supabaseId,
    });

    const childIds = children.map((c) => c.id);
    let enrollments: any[] = [];
    try {
      enrollments =
        childIds.length > 0 ? await storage.getEnrollmentsByChildIds(childIds) : [];
    } catch {
      enrollments = [];
    }

    // Transform children data to ensure consistent format
    const transformedChildren = await Promise.all(
      children.map(async (child) => {
        const { locationId, locationName } = await resolveChildRegisteredLocation(
          storage,
          dbUser,
          child,
        );
        const { buildPlacedClassesForChild } = await import(
          '../lib/build-placed-classes'
        );
        const placedClasses = await buildPlacedClassesForChild(child.id, enrollments);
        return {
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
          locationId,
          locationName,
          placedClasses,
          createdAt: child.createdAt,
          updatedAt: child.updatedAt,
        };
      }),
    );

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
    
    const dbUser = await resolveParentDbUser(storage, {
      email: userEmail,
      supabaseId: req.auth?.supabaseId,
    });
    const ownsByLink = dbUser != null && child.parentId === dbUser.id;
    const ownsByEmail = emailsMatch(child.parentEmail, userEmail);
    if (!ownsByLink && !ownsByEmail) {
      return res.status(403).json({ 
        message: 'Access denied: You can only view your own children',
        error: 'NOT_YOUR_CHILD'
      });
    }

    const { locationId, locationName } = await resolveChildRegisteredLocation(
      storage,
      dbUser,
      child,
    );

    return res.status(200).json({
      ...child,
      locationId,
      locationName,
    });
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

    const parent = await resolveParentDbUser(storage, {
      email: userEmail,
      supabaseId: req.auth?.supabaseId,
    });
    if (!parent) {
      console.log('❌ Parent user not found:', userEmail);
      return res.status(404).json({ 
        message: 'Parent user not found',
        error: 'PARENT_NOT_FOUND'
      });
    }

    console.log('👶 Creating child in storage via shared helper:', { firstName, lastName });

    let preferredLocationId: number | null = parent.locationId ?? null;
    if (preferredLocationId == null) {
      const parentLocs = await storage.getUserLocationsByUserId(parent.id);
      const active = parentLocs.find((ul) => ul.isActive !== false);
      preferredLocationId = active?.locationId ?? null;
    }

    const savedChild = await createChildLinkedToParent(storage, {
      parent,
      parentEmail: userEmail,
      preferredLocationId,
      fields: {
        firstName,
        lastName,
        birthdate,
        gradeLevel,
        gender: gender ?? null,
        interests: interests ?? null,
        learningStyle: learningStyle ?? null,
        specialNeeds: specialNeeds ?? null,
        allergies: allergies ?? null,
        medicalInfo: medicalInfo ?? null,
        school: school ?? null,
        profileImage: profileImage ?? null,
        emergencyContact: emergencyContact ?? null,
        additionalLanguages: additionalLanguages ?? null,
        notes: notes ?? null,
      },
      sendAdminNotifications: true,
      parentPhoneOverride: parentPhone ?? undefined,
    });

    console.log('✅ Child registered successfully:', savedChild);

    return res.status(201).json(savedChild);

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
    
    const dbUser = await resolveParentDbUser(storage, {
      email: userEmail,
      supabaseId: req.auth?.supabaseId,
    });

    const parentEnrollments = allEnrollments.filter((enrollment: any) =>
      enrollmentMatchesParent(enrollment, dbUser?.id, userEmail)
    );

    const { enrollmentShouldExcludeFromCart } = await import(
      "@shared/enrollment-cart-eligibility"
    );
    const scheduledPayments = await storage.getScheduledPaymentsByParentEmail(
      userEmail,
    );

    const { locationId: registeredLocationId, locationName: registeredLocationName } =
      dbUser != null
        ? await resolveRegisteredLocation(storage, dbUser.locationId)
        : { locationId: null, locationName: null };

    const enriched = parentEnrollments.map((enrollment: any) => {
      const checkoutExcluded = enrollmentShouldExcludeFromCart(
        enrollment,
        scheduledPayments,
      );
      return {
        ...enrollment,
        managedByPaymentPlan: checkoutExcluded,
        checkoutExcluded,
        registeredLocationId,
        registeredLocationName,
        locationName: registeredLocationName,
      };
    });

    console.log(
      `📚 Found ${enriched.length} enrollments for parent ${userEmail} ` +
        `(${enriched.filter((e: any) => e.checkoutExcluded).length} on payment plan, excluded from cart)`,
    );

    return res.status(200).json(enriched);
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
    const user = await resolveParentDbUser(storage, {
      email: userEmail,
      supabaseId: req.auth?.supabaseId,
    });
    if (!user) {
      console.log('❌ User not found in database');
      return res.status(404).json({ 
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Get all membership enrollments for this parent
    if (user.schoolId) {
      const school = await storage.getSchool(user.schoolId);
      const fee = school?.membershipFeeAmount ?? 0;
      if (fee > 0) {
        const currentYear = new Date().getFullYear();
        const existing = await storage.getMembershipEnrollmentsByParentId(user.id);
        const alreadyPaid = existing.some((m) =>
          isMembershipFullyPaidForCheckout(m, user.schoolId!, currentYear),
        );
        if (!alreadyPaid) {
          try {
            await ensurePendingMembershipEnrollmentForCheckout(
              user.id,
              user.schoolId,
              fee,
              currentYear,
            );
          } catch (ensureErr) {
            console.error('⚠️ ensurePendingMembershipEnrollmentForCheckout failed:', ensureErr);
          }
        }
      }
    }

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
    const user = await resolveParentDbUser(storage, {
      email: userEmail,
      supabaseId: req.auth?.supabaseId,
    });
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
    const user = await resolveParentDbUser(storage, {
      email: userEmail,
      supabaseId: req.auth?.supabaseId,
    });
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

// Get parent's member ID
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

    const user = await resolveParentDbUser(storage, {
      email: userEmail,
      supabaseId: req.auth?.supabaseId,
    });
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    await runMembershipReconcileForParentUser(user.id, user.schoolId ?? null);

    const userAfterReconcile = (await storage.getUser(user.id)) ?? user;
    const hasMemberId = parentHasMemberIdForCheckout(userAfterReconcile.memberId);
    const currentYear = new Date().getFullYear();
    let schoolId: number | null = userAfterReconcile.schoolId ?? null;
    let schoolName: string | null = null;
    let membershipFeeAmount = 0;
    let membershipRequired = false;
    let membershipOwedCents = 0;
    let membershipStatus: string | null = null;

    if (schoolId) {
      const school = await storage.getSchool(schoolId);
      schoolName = school?.name ?? null;
      membershipFeeAmount = school?.membershipFeeAmount ?? 0;
      membershipRequired = school?.membershipRequired ?? false;

      const memberships = await storage.getMembershipEnrollmentsByParentId(userAfterReconcile.id);
      const latestForSchool = memberships
        .filter(
          (m) =>
            Number(m.schoolId) === Number(schoolId) &&
            (m.membershipYear === currentYear || m.membershipYear === currentYear + 1),
        )
        .sort((a, b) => (b.membershipYear ?? 0) - (a.membershipYear ?? 0))[0];
      membershipStatus = latestForSchool?.status ?? null;

      const resolved = await resolveMembershipOwedForCheckout(userAfterReconcile.id, schoolId);
      if (resolved) {
        membershipOwedCents = resolved.owedCents;
        membershipFeeAmount = resolved.membershipFeeAmount;
        membershipRequired = resolved.membershipRequired;
        schoolName = resolved.schoolName;
      }
    }

    return res.status(200).json({
      memberId: userAfterReconcile.memberId || null,
      hasMemberId,
      hasMembership: hasMemberId,
      membershipStatus,
      schoolId,
      schoolName,
      membershipFeeAmount,
      membershipRequired,
      membershipOwedCents,
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

    const user = await resolveParentDbUser(storage, {
      email: userEmail,
      supabaseId: req.auth?.supabaseId,
    });
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

    const hasMemberId = parentHasMemberIdForCheckout(updatedUser.memberId);
    return res.status(200).json({
      success: true,
      memberId: updatedUser.memberId || null,
      hasMemberId,
      hasMembership: hasMemberId,
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

    const user = await resolveParentDbUser(storage, {
      email: userEmail,
      supabaseId: req.auth?.supabaseId,
    });
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

    const user = await resolveParentDbUser(storage, {
      email: userEmail,
      supabaseId: req.auth?.supabaseId,
    });
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

// Get published, enrollment-open classes for the authenticated parent's school.
// The parent "Programs & Classes" page is the single consumer of this endpoint;
// it expects { items, total, page, limit, totalPages }. The server is the
// source of truth for visibility — it filters out unpublished, expired,
// admin-only, hidden-category, and enrollment-closed classes.
router.get('/classes', jwtCheck, async (req: any, res) => {
  try {
    const userEmail = req.auth?.email || req.user?.email;
    if (!userEmail) {
      return res.status(401).json({ message: 'Authentication required', error: 'NO_USER_EMAIL' });
    }

    const user = await resolveParentDbUser(storage, {
      email: userEmail,
      supabaseId: req.auth?.supabaseId,
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found', error: 'USER_NOT_FOUND' });
    }

    // Derive schoolId from enrollments if user.schoolId is null
    let effectiveSchoolId = user.schoolId;
    if (!effectiveSchoolId) {
      const enrollments = await storage.getProgramEnrollmentsByParent(user.id);
      if (enrollments.length > 0) {
        effectiveSchoolId = enrollments[0].schoolId;
        console.log(`📄 Derived schoolId ${effectiveSchoolId} from parent's enrollments`);
      }
    }

    if (!effectiveSchoolId) {
      return res.status(404).json({ message: 'School not found for this parent', error: 'NO_SCHOOL_ID' });
    }

    const allClasses = await storage.getClassesBySchoolId(String(effectiveSchoolId));
    const hiddenCategoryIds = await storage.getHiddenCategoryIds();

    const classesWithEnrichment = await Promise.all(allClasses.map(async (classItem: any) => {
      const classEnrollmentCount = await storage.getEnrollmentCountForClass(classItem.id);

      let variants = undefined;
      if (classItem.schedule && typeof classItem.schedule === 'string') {
        try {
          const scheduleData = JSON.parse(classItem.schedule);
          if (scheduleData && scheduleData.variants && Array.isArray(scheduleData.variants)) {
            variants = scheduleData.variants;
          }
        } catch (e) {}
      } else if (classItem.schedule && typeof classItem.schedule === 'object') {
        if ((classItem.schedule as any).variants && Array.isArray((classItem.schedule as any).variants)) {
          variants = (classItem.schedule as any).variants;
        }
      }

      let locationName = null;
      if (classItem.locationId) {
        try {
          const location = await storage.getLocationById(classItem.locationId);
          if (location) locationName = location.name;
        } catch (e) {}
      }

      let derivedInstructorName = null;
      if (classItem.instructorId) {
        try {
          const instructor = await storage.getUser(classItem.instructorId);
          if (instructor) {
            derivedInstructorName = instructor.name
              || (instructor.firstName && instructor.lastName ? `${instructor.firstName} ${instructor.lastName}` : null)
              || instructor.email
              || null;
          }
        } catch (e) {}
      }

      return {
        ...classItem,
        enrollmentCount: classEnrollmentCount,
        capacity: classItem.capacity || 20,
        enrolled: classEnrollmentCount,
        variants: variants || undefined,
        location: locationName || classItem.location || null,
        categoryName: classItem.categoryName || classItem.category || null,
        categoryId: classItem.categoryId || null,
        categoryIsPublic: classItem.categoryId
          ? !hiddenCategoryIds.includes(classItem.categoryId)
          : true,
        instructorName: derivedInstructorName || classItem.instructorName || null,
      };
    }));

    // Visibility rules — kept identical to the public catalog (server/api/classes.ts).
    // enrollmentOpen is the single visibility gate; we deliberately do NOT require
    // status === 'published' (school-admin classes use statuses like 'upcoming'),
    // matching the catalog so the parent page and catalog never diverge.
    const now = new Date();
    const filtered = classesWithEnrichment.filter((cls: any) => {
      if (!cls.enrollmentOpen) return false;
      if (cls.isAdminOnly) return false;
      if (cls.endDate && new Date(cls.endDate) < now) return false;
      if (cls.categoryId && !cls.categoryIsPublic) return false;
      return true;
    });

    return res.json({
      items: filtered,
      total: filtered.length,
      page: 1,
      limit: filtered.length,
      totalPages: 1
    });
  } catch (error) {
    console.error('❌ Error fetching parent classes:', error);
    return res.status(500).json({ message: 'Error fetching classes' });
  }
});

export default router;