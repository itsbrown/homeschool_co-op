import { Router } from 'express';
import { storage } from '../storage';
import { sendPaymentReceipt } from '../lib/email-service';
import { StripePaymentPlanService } from '../services/stripe-payment-plans';
import { supabaseAuth } from '../middleware/supabase-auth';
import { requireSchoolContext } from '../middleware/require-school-context';
import { getStripeClient, getStripePublishableKey } from '../config/stripe';
import { calculateMembershipDiscount } from '../utils/membership';
import { calculateCartPricing, CartItem } from '../utils/cart-pricing';
import { CurrencyUtils } from '@shared/currency-utils';

const router = Router();

// Get Stripe publishable key from Replit connection API
router.get('/config', async (req, res) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (error: any) {
    console.error('Failed to get Stripe publishable key:', error);
    res.status(500).json({ 
      error: 'Failed to get Stripe configuration',
      message: error.message 
    });
  }
});

// Create payment intent for cart checkout
router.post('/create-payment-intent', supabaseAuth, async (req: any, res) => {
  try {
    console.log('💳 Creating payment intent for cart checkout');
    
    // Get the authenticated user's email from Supabase auth
    const userEmail = req.user.email;
    
    console.log('💳 Creating payment intent for authenticated user:', userEmail);

    const { items, subtotal, discounts, total, parentEmail, paymentPlan = 'full', paymentFrequency = 'one_time', membership, promoCode, creditsToApply = 0 } = req.body;
    
    // Log received promo code for debugging
    console.log('🎟️ Received promoCode from client:', promoCode);
    console.log('💰 Received creditsToApply from client:', creditsToApply);

    // Validate required fields - either items OR membership must be present
    const hasItems = items && Array.isArray(items) && items.length > 0;
    const hasMembership = membership && membership.amount > 0;
    
    if (!hasItems && !hasMembership) {
      return res.status(400).json({
        message: 'Cart must contain items or membership fee',
        error: 'EMPTY_CART'
      });
    }

    if (total < 0) {
      return res.status(400).json({
        message: 'Invalid total amount',
        error: 'INVALID_TOTAL'
      });
    }
    
    // Validate payment frequency
    const validFrequencies = ['weekly', 'biweekly', 'monthly', 'one_time'];
    if (!validFrequencies.includes(paymentFrequency)) {
      return res.status(400).json({
        message: 'Invalid payment frequency',
        error: 'INVALID_FREQUENCY'
      });
    }

    // Server-calculated totals - AUTHORITATIVE values to be used for payment
    // These will be populated from database lookups, not client-sent values
    let authoritativeItemTotal = 0;
    let authoritativeMembershipAmount = 0;
    
    // Store cart pricing result at handler level so it can be accessed for discount snapshot building
    let cartPricingResult: Awaited<ReturnType<typeof calculateCartPricing>> | undefined;
    
    // MEMBERSHIP VALIDATION: Look up authoritative membership fee from parent's school
    // This runs ALWAYS (even for membership-only checkouts) to ensure server-side validation
    // Do NOT trust client-sent membership - derive from authenticated user's school
    // ALSO calculate applicable discounts to allow discounted payments
    const parentForMembership = await storage.getUserByEmail(userEmail);
    let authoritativeMembershipFull = 0; // Full price before discounts
    let authoritativeMembershipDiscounted = 0; // Price after discounts (may equal full)
    
    // Calculate membership amounts whenever:
    // 1. Membership is required by school (even if client didn't include it)
    // 2. Client is claiming to pay membership (even if optional)
    const clientClaimsMembership = (membership?.amount || 0) > 0;
    
    if (parentForMembership?.schoolId) {
      const schoolForMembership = await storage.getSchool(parentForMembership.schoolId);
      const membershipRequired = schoolForMembership?.membershipRequired || false;
      
      // Calculate amounts if membership is required OR if client wants to purchase
      if (membershipRequired || clientClaimsMembership) {
        // Check if parent already has active membership for this year at THIS school
        const existingMemberships = await storage.getMembershipEnrollmentsByParentId(parentForMembership.id);
        const currentYear = new Date().getFullYear();
        
        // Filter for memberships at the same school with valid paid status
        // Allow current year OR next year to handle academic year memberships (e.g., 2025-2026 school year stored as "2026")
        // CRITICAL: Recognize multiple valid "paid" statuses - 'enrolled', 'active', 'paid'
        const VALID_PAID_MEMBERSHIP_STATUSES = ['enrolled', 'active', 'paid'];
        const activeMembershipForThisSchool = existingMemberships?.find((m: any) => 
          (m.membershipYear === currentYear || m.membershipYear === currentYear + 1) && 
          VALID_PAID_MEMBERSHIP_STATUSES.includes(m.status) &&
          m.schoolId === parentForMembership.schoolId
        );
        const hasActiveMembership = !!activeMembershipForThisSchool;
        
        console.log('🎫 Active membership check:', {
          parentId: parentForMembership.id,
          schoolId: parentForMembership.schoolId,
          currentYear,
          allowedYears: [currentYear, currentYear + 1],
          validPaidStatuses: VALID_PAID_MEMBERSHIP_STATUSES,
          totalMemberships: existingMemberships?.length || 0,
          membershipsData: existingMemberships?.map((m: any) => ({
            id: m.id,
            schoolId: m.schoolId,
            membershipYear: m.membershipYear,
            status: m.status,
            statusRecognized: VALID_PAID_MEMBERSHIP_STATUSES.includes(m.status)
          })),
          hasActiveMembership,
          activeMembershipFound: activeMembershipForThisSchool ? {
            id: activeMembershipForThisSchool.id,
            year: activeMembershipForThisSchool.membershipYear,
            status: activeMembershipForThisSchool.status
          } : null,
          userEmail
        });
        
        // Only calculate fee if not already paid
        if (!hasActiveMembership) {
          // Check if fee is configured
          if (!schoolForMembership?.membershipFeeAmount || schoolForMembership.membershipFeeAmount <= 0) {
            // Only error if required - optional memberships without fee config are just skipped
            if (membershipRequired) {
              console.error('🚨 PAYMENT VALIDATION FAILED: Membership required but fee not configured', {
                schoolId: parentForMembership.schoolId,
                membershipRequired: true,
                membershipFeeAmount: schoolForMembership?.membershipFeeAmount,
                userEmail
              });
              return res.status(400).json({
                message: 'Membership fee configuration error. Please contact the school administrator.',
                error: 'MEMBERSHIP_FEE_NOT_CONFIGURED'
              });
            } else if (clientClaimsMembership) {
              // Client claims membership but school has no fee configured
              console.error('🚨 PAYMENT VALIDATION FAILED: Client claims membership but school has no fee', {
                schoolId: parentForMembership.schoolId,
                clientClaimedAmount: membership?.amount,
                userEmail
              });
              return res.status(400).json({
                message: 'This school does not have a membership fee configured.',
                error: 'NO_MEMBERSHIP_FEE'
              });
            }
          } else {
            authoritativeMembershipFull = schoolForMembership.membershipFeeAmount;
            
            // Calculate applicable discounts server-side
            const discountResult = await calculateMembershipDiscount(
              parentForMembership.schoolId,
              parentForMembership.id,
              schoolForMembership.membershipFeeAmount
            );
            authoritativeMembershipDiscounted = discountResult.finalAmount;
            
            console.log('🎫 Membership discount calculation:', {
              fullAmount: authoritativeMembershipFull,
              discountedAmount: authoritativeMembershipDiscounted,
              discountApplied: discountResult.appliedDiscounts.length > 0,
              membershipRequired,
              clientClaimsMembership,
              userEmail
            });
          }
        } else if (clientClaimsMembership) {
          // Client claims membership but already has active one - this is invalid
          console.warn('⚠️ Client claims membership but already has active membership', {
            userEmail,
            clientClaimedAmount: membership?.amount
          });
          // Don't error - just ignore the claim and set authoritative to 0
          authoritativeMembershipFull = 0;
          authoritativeMembershipDiscounted = 0;
        }
      }
    }
    
    // Determine which authoritative amount to use based on what client is paying
    // Client can pay EITHER full price OR discounted price (both are valid)
    // Special case: discounted to $0 is also valid when authoritativeMembershipDiscounted === 0
    const clientMembershipClaim = membership?.amount ?? -1; // Use -1 to distinguish "no membership sent" from "amount=0 sent"
    const clientSentMembershipPayload = membership !== null && membership !== undefined;
    
    if (clientMembershipClaim > 0) {
      // Client is claiming to pay membership - validate it matches either valid amount
      if (clientMembershipClaim === authoritativeMembershipFull) {
        authoritativeMembershipAmount = authoritativeMembershipFull;
      } else if (clientMembershipClaim === authoritativeMembershipDiscounted) {
        authoritativeMembershipAmount = authoritativeMembershipDiscounted;
      } else {
        // Client amount doesn't match either valid option - return 409 with authoritative values
        console.error('🚨 PAYMENT VALIDATION FAILED: Membership amount mismatch', {
          clientMembershipClaim,
          authoritativeMembershipFull,
          authoritativeMembershipDiscounted,
          userEmail
        });
        // Get school name for membership payload construction
        const schoolForError = await storage.getSchool(parentForMembership?.schoolId || 0);
        return res.status(409).json({
          message: 'Membership fee amount does not match expected amount. Cart will be refreshed automatically.',
          error: 'MEMBERSHIP_AMOUNT_MISMATCH',
          authoritative: {
            itemsTotal: 0, // Items haven't been validated yet
            membershipAmount: authoritativeMembershipDiscounted,
            membershipAlreadyPaid: false, // If we're in mismatch, it means membership is required and not paid
            membershipRequired: true,
            membershipSchoolId: parentForMembership?.schoolId || null,
            membershipSchoolName: schoolForError?.name || 'School',
            membershipYear: new Date().getFullYear(),
            membershipFull: authoritativeMembershipFull,
            grandTotal: authoritativeMembershipDiscounted,
            discounts: null,
            schoolSettings: null
          }
        });
      }
    } else if (clientMembershipClaim === 0 && clientSentMembershipPayload && authoritativeMembershipDiscounted === 0) {
      // Client sent membership with amount=0, and server confirms discounted amount is $0
      // This is a valid fully-discounted membership - accept it
      console.log('✅ Accepting $0 discounted membership:', {
        clientMembershipClaim,
        authoritativeMembershipDiscounted,
        authoritativeMembershipFull,
        userEmail
      });
      authoritativeMembershipAmount = 0;
    } else if (authoritativeMembershipFull > 0 && authoritativeMembershipDiscounted > 0) {
      // Membership is required with a cost but client didn't include it or sent wrong amount
      // Set to discounted amount (what they should pay)
      authoritativeMembershipAmount = authoritativeMembershipDiscounted;
    } else if (authoritativeMembershipFull > 0 && authoritativeMembershipDiscounted === 0 && !clientSentMembershipPayload) {
      // Membership required but discounted to $0, client didn't send payload
      // Accept this as valid since user owes nothing
      console.log('✅ Membership fully discounted, no payload needed:', {
        authoritativeMembershipFull,
        authoritativeMembershipDiscounted,
        userEmail
      });
      authoritativeMembershipAmount = 0;
    }
    
    console.log('🎫 Authoritative membership amount calculated:', {
      authoritativeMembershipAmount,
      authoritativeMembershipFull,
      authoritativeMembershipDiscounted,
      clientSentMembership: clientMembershipClaim,
      userEmail
    });
    
    // Fetch children for validation and later use (only if there are items)
    let children: any[] = [];
    if (hasItems) {
      children = await storage.getChildrenByParentEmail(userEmail);
      const childIds = children.map(child => child.id);
      
      const invalidItems = items.filter((item: any) => !childIds.includes(item.childId));
      if (invalidItems.length > 0) {
        return res.status(403).json({
          message: 'Unauthorized: Cannot enroll children not owned by this parent',
          error: 'UNAUTHORIZED_CHILDREN'
        });
      }
      
      // SERVER-SIDE TOTAL VALIDATION: Look up ACTUAL prices from database
      // Do NOT trust client-sent totalCost - they can be manipulated
      let serverCalculatedItemTotal = 0;
      const pricingMismatches: Array<{ classId: number; variantId: string | null; clientPrice: number; serverPrice: number }> = [];
      
      for (const item of items) {
        const classData = await storage.getClassById(item.classId);
        if (!classData) {
          console.error('🚨 Class not found in database:', item.classId);
          return res.status(400).json({
            message: 'One or more classes in your cart are no longer available.',
            error: 'CLASS_NOT_FOUND'
          });
        }
        
        // Get authoritative price from database
        // Check if class uses variant pricing (has variants in schedule)
        let authoritativePrice = 0;
        let isVariantPricedClass = false;
        let variantFound = false;
        
        if (classData.schedule) {
          try {
            const schedule = typeof classData.schedule === 'string' 
              ? JSON.parse(classData.schedule) 
              : classData.schedule;
            
            if (schedule.variants && Array.isArray(schedule.variants) && schedule.variants.length > 0) {
              isVariantPricedClass = true;
              
              if (item.variantId) {
                // Client provided a variantId - validate it
                const variant = schedule.variants.find((v: any) => v.id === item.variantId);
                if (variant && typeof variant.price === 'number') {
                  authoritativePrice = variant.price;
                  variantFound = true;
                }
              } else {
                // LEGACY SUPPORT: Enrollment has no variantId but class has variants
                // First, try to find default-variant
                const defaultVariant = schedule.variants.find((v: any) => v.id === 'default-variant');
                if (defaultVariant && typeof defaultVariant.price === 'number') {
                  authoritativePrice = defaultVariant.price;
                  variantFound = true;
                  console.log('🔄 Legacy enrollment: defaulting to default-variant price', {
                    classId: item.classId,
                    variantPrice: defaultVariant.price,
                    variantName: defaultVariant.name
                  });
                } else if (schedule.variants[0] && typeof schedule.variants[0].price === 'number') {
                  // Fall back to first variant if no default-variant exists
                  authoritativePrice = schedule.variants[0].price;
                  variantFound = true;
                  console.log('🔄 Legacy enrollment: defaulting to first variant price', {
                    classId: item.classId,
                    variantId: schedule.variants[0].id,
                    variantPrice: schedule.variants[0].price,
                    variantName: schedule.variants[0].name
                  });
                }
              }
            }
          } catch (e) {
            console.warn('⚠️ Failed to parse class schedule:', {
              classId: item.classId,
              error: e
            });
          }
        }
        
        // For variant-priced classes, REQUIRE a valid variant match - don't fall back to base price
        if (isVariantPricedClass && !variantFound) {
          console.error('🚨 PAYMENT VALIDATION FAILED: Invalid or missing variant for variant-priced class', {
            classId: item.classId,
            clientVariantId: item.variantId,
            className: classData.title,
            userEmail
          });
          return res.status(400).json({
            message: 'Invalid class variant selected. Please refresh your cart and select a valid time slot.',
            error: 'INVALID_VARIANT'
          });
        }
        
        // Only use base class price if it's NOT a variant-priced class
        if (!isVariantPricedClass) {
          authoritativePrice = classData.price || 0;
        }
        
        // CRITICAL: Reject if authoritative price is 0 or undefined for any class
        // This prevents zero-priced enrollments from slipping through
        if (authoritativePrice <= 0) {
          console.error('🚨 PAYMENT VALIDATION FAILED: Class has no valid price in database', {
            classId: item.classId,
            isVariantPricedClass,
            variantId: item.variantId,
            className: classData.title,
            basePriceInDb: classData.price,
            userEmail
          });
          return res.status(400).json({
            message: 'Unable to process payment. Class pricing is not configured correctly. Please contact support.',
            error: 'INVALID_CLASS_PRICE'
          });
        }
        
        const clientSentPrice = item.totalCost || item.price || 0;
        
        // Log mismatches for investigation
        const priceDifference = Math.abs(clientSentPrice - authoritativePrice);
        const priceDiscrepancyPercent = authoritativePrice > 0 
          ? (priceDifference / authoritativePrice) * 100 
          : (clientSentPrice > 0 ? 100 : 0);
        
        if (priceDiscrepancyPercent > 5) {
          pricingMismatches.push({
            classId: item.classId,
            variantId: item.variantId || null,
            clientPrice: clientSentPrice,
            serverPrice: authoritativePrice
          });
        }
        
        // Use the DATABASE price, not client-sent price
        serverCalculatedItemTotal += authoritativePrice;
      }
      
      // Log pricing mismatches for investigation
      if (pricingMismatches.length > 0) {
        console.warn('⚠️ PRICING AUDIT: Client prices differ from database', {
          mismatches: pricingMismatches,
          userEmail,
          note: 'Using database prices for validation - client prices logged for audit'
        });
      }
      
      // ================================================================
      // SERVER-SIDE DISCOUNT CALCULATION - Use cart-pricing utility
      // This calculates ALL applicable discounts (promo codes, auto-apply, 
      // sibling discounts, free-after-threshold) on the server side
      // ================================================================
      const cartItems: CartItem[] = items.map((item: any) => ({
        id: item.id || `${item.classId}-${item.childId}`,
        classId: item.classId,
        childId: item.childId,
        childName: item.childName || '',
        variantId: item.variantId
      }));
      
      // Extract promo code - prefer explicitly passed promoCode, fallback to discounts structure
      const appliedPromoCode = promoCode || discounts?.appliedDiscounts?.find((d: any) => d.sourceType === 'promo')?.code || null;
      console.log('🎟️ Final appliedPromoCode for cart pricing:', appliedPromoCode);
      
      // Store cart pricing at handler level for later discount snapshot building
      cartPricingResult = await calculateCartPricing(
        cartItems,
        parentForMembership?.id || 0,
        parentForMembership?.schoolId || 0,
        appliedPromoCode
      );
      
      console.log('🧮 Server-side cart pricing with discounts:', {
        subtotal: cartPricingResult.subtotal,
        discounts: cartPricingResult.discounts,
        total: cartPricingResult.total,
        appliedPromoCode,
        userEmail
      });
      
      // The server-calculated total for items (with all discounts applied)
      const serverCalculatedItemTotal_WithDiscounts = cartPricingResult.total;
      
      console.log('💰 Server-calculated item total with discounts:', {
        rawSubtotal: cartPricingResult.subtotal,
        discountedTotal: serverCalculatedItemTotal_WithDiscounts,
        totalDiscountAmount: cartPricingResult.discounts.totalDiscountAmount,
        appliedDiscountsCount: cartPricingResult.discounts.appliedDiscounts.length,
        membershipAmount: authoritativeMembershipAmount,
        appliedDiscounts: cartPricingResult.discounts.appliedDiscounts.map((d: any) => ({
          name: d.name,
          type: d.type,
          amount: d.discountAmount
        }))
      });
      
      // CRITICAL: Store server-calculated values for use in payment creation
      // These are the AUTHORITATIVE amounts that must be used, not client-sent values
      // Validation deferred to UNIFIED STRICT VALIDATION block below
      authoritativeItemTotal = serverCalculatedItemTotal_WithDiscounts;
      // authoritativeMembershipAmount is already set earlier (outside hasItems block)
    } else {
      // MEMBERSHIP-ONLY CHECKOUT: authoritativeItemTotal stays 0
      // authoritativeMembershipAmount was already set at lines 74-113
    }
    
    // ================================================================
    // UNIFIED STRICT VALIDATION - Runs for ALL checkout paths
    // This ensures no checkout path can bypass validation
    // ================================================================
    const finalClientTotal = total + (membership?.amount || 0);
    const finalServerTotal = authoritativeItemTotal + authoritativeMembershipAmount;
    const finalDiscrepancy = finalClientTotal - finalServerTotal;
    
    console.log('🔒 UNIFIED STRICT VALIDATION:', {
      finalClientTotal,
      finalServerTotal,
      authoritativeItemTotal,
      authoritativeMembershipAmount,
      finalDiscrepancy,
      hasItems,
      userEmail
    });
    
    // CASE 1: Server total is 0 but client claims non-zero
    // This is suspicious - client is trying to charge for something server doesn't recognize
    if (finalServerTotal === 0 && finalClientTotal !== 0) {
      console.error('🚨 PAYMENT VALIDATION FAILED: Client claims non-zero but server calculates $0', {
        finalClientTotal,
        finalServerTotal,
        clientSentTotal: total,
        clientSentMembership: membership?.amount || 0,
        userEmail,
        securityNote: 'Server calculated $0 - rejecting non-zero client total'
      });
      return res.status(400).json({
        message: 'Payment total does not match expected amount. Please refresh your cart and try again.',
        error: 'ZERO_SERVER_TOTAL_MISMATCH'
      });
    }
    
    // CASE 2: Server total is non-zero - check for overpayment
    // Use strict 1% tolerance for overpayment (fraud prevention)
    if (finalServerTotal > 0 && finalDiscrepancy > 0) {
      const overpaymentPercentage = finalDiscrepancy / finalServerTotal * 100;
      if (overpaymentPercentage > 1) {
        // Extract child IDs from cart items for debugging
        const cartChildIds = hasItems ? [...new Set(items.map((item: any) => item.childId))] : [];
        const cartChildNames = hasItems ? [...new Set(items.map((item: any) => item.childName))] : [];
        
        console.error('🚨 PAYMENT VALIDATION FAILED: Client total exceeds server calculation', {
          // Basic totals
          finalClientTotal,
          finalServerTotal,
          overpayment: finalDiscrepancy,
          overpaymentPercentage: `${overpaymentPercentage.toFixed(2)}%`,
          
          // Breakdown
          authoritativeItemTotal,
          authoritativeMembershipAmount,
          clientSentItemTotal: total,
          clientSentMembership: membership?.amount || 0,
          
          // Client-sent discounts
          clientDiscounts: {
            siblingDiscount: discounts?.siblingDiscount || 0,
            freeAfterThree: discounts?.freeAfterThree || 0,
            totalDiscountAmount: discounts?.totalDiscountAmount || 0,
            appliedDiscounts: discounts?.appliedDiscounts?.map((d: any) => ({
              name: d.name,
              type: d.type,
              amount: d.discountAmount
            })) || []
          },
          
          // Server-calculated discounts
          serverDiscounts: cartPricingResult ? {
            siblingDiscount: cartPricingResult.discounts.siblingDiscount,
            freeAfterThree: cartPricingResult.discounts.freeAfterThree,
            totalDiscountAmount: cartPricingResult.discounts.totalDiscountAmount,
            appliedDiscounts: cartPricingResult.discounts.appliedDiscounts.map((d: any) => ({
              name: d.name,
              type: d.type,
              amount: d.discountAmount,
              sourceType: d.sourceType
            })),
            discountedChildIds: cartPricingResult.discounts.discountedChildIds,
            freeItemIds: cartPricingResult.discounts.freeItemIds
          } : null,
          
          // School settings used for calculation
          serverSchoolSettings: cartPricingResult?.schoolSettings || null,
          
          // Cart items info
          cartItemCount: hasItems ? items.length : 0,
          cartChildIds,
          cartChildNames,
          uniqueChildrenCount: cartChildIds.length,
          
          // Promo code info
          clientPromoCode: promoCode || null,
          
          userEmail,
          userId: parentForMembership?.id,
          schoolId: parentForMembership?.schoolId,
          securityNote: 'FRAUD PREVENTION - client attempting to overpay'
        });
        return res.status(400).json({
          message: 'Payment total does not match expected amount. Please refresh your cart and try again.',
          error: 'TOTAL_MISMATCH_OVERPAYMENT'
        });
      }
    }
    
    // CASE 3: Server total is non-zero - check for underpayment
    // Allow 5% tolerance for discount calculation differences between frontend/backend
    // The server-calculated amount is ALWAYS used for the actual Stripe charge
    if (finalServerTotal > 0 && finalDiscrepancy < 0) {
      const underpaymentPercentage = Math.abs(finalDiscrepancy) / finalServerTotal * 100;
      
      // Log details for debugging when there's any discrepancy
      if (underpaymentPercentage > 0.1) {
        console.warn('⚠️ PAYMENT DISCREPANCY DETECTED:', {
          finalClientTotal,
          finalServerTotal,
          discrepancyCents: Math.abs(finalDiscrepancy),
          discrepancyPercent: `${underpaymentPercentage.toFixed(2)}%`,
          breakdown: {
            clientItemTotal: total,
            clientMembership: membership?.amount || 0,
            serverItemTotal: authoritativeItemTotal,
            serverMembership: authoritativeMembershipAmount
          },
          discountsApplied: cartPricingResult?.discounts?.appliedDiscounts?.map((d: any) => ({
            name: d.name,
            type: d.type,
            amount: d.discountAmount
          })) || [],
          userEmail,
          note: 'Server-calculated amount will be used for payment (authoritative)'
        });
      }
      
      // Only reject extreme underpayment (> 5%) which likely indicates a bug or stale data
      // Moderate discrepancies (0.1-5%) are logged but allowed since server price is authoritative
      if (underpaymentPercentage > 5) {
        console.error('🚨 PAYMENT VALIDATION FAILED: Significant underpayment detected', {
          finalClientTotal,
          finalServerTotal,
          underpayment: Math.abs(finalDiscrepancy),
          underpaymentPercentage: `${underpaymentPercentage.toFixed(2)}%`,
          authoritativeItemTotal,
          authoritativeMembershipAmount,
          clientSentTotal: total,
          clientSentMembership: membership?.amount || 0,
          clientSentPromoCode: promoCode || null,
          serverAppliedDiscounts: cartPricingResult?.discounts?.appliedDiscounts?.map((d: any) => ({
            name: d.name,
            type: d.type,
            amount: d.discountAmount,
            sourceType: d.sourceType
          })) || [],
          serverTotalDiscountAmount: cartPricingResult?.discounts?.totalDiscountAmount || 0,
          userEmail,
          securityNote: 'Underpayment > 5% - likely stale cart data or promo code mismatch. User should refresh.'
        });
        // Return 409 Conflict with authoritative values so client can auto-retry
        // Include membershipAlreadyPaid flag to help frontend distinguish paid vs $0 discount
        // Also include full membership metadata so client can construct proper payload on retry
        const membershipAlreadyPaid = authoritativeMembershipFull > 0 && authoritativeMembershipAmount === 0;
        const schoolForConflict = await storage.getSchool(parentForMembership?.schoolId || 0);
        return res.status(409).json({
          message: 'Your cart prices may have changed. Cart will be refreshed automatically.',
          error: 'UNIFIED_TOTAL_MISMATCH',
          authoritative: {
            itemsTotal: authoritativeItemTotal,
            membershipAmount: authoritativeMembershipAmount,
            membershipAlreadyPaid: membershipAlreadyPaid,
            membershipRequired: authoritativeMembershipFull > 0 && !membershipAlreadyPaid,
            membershipSchoolId: parentForMembership?.schoolId || null,
            membershipSchoolName: schoolForConflict?.name || 'School',
            membershipYear: new Date().getFullYear(),
            grandTotal: finalServerTotal,
            discounts: cartPricingResult?.discounts || null,
            schoolSettings: cartPricingResult?.schoolSettings || null
          }
        });
      }
    }
    
    console.log('✅ UNIFIED STRICT VALIDATION PASSED:', {
      finalClientTotal,
      finalServerTotal,
      match: finalClientTotal === finalServerTotal ? 'EXACT' : 'MINOR_ROUNDING',
      hasItems
    });

    // Create detailed description for payment
    const uniqueChildren = hasItems ? [...new Set(items.map((item: any) => item.childName))] : [];
    const classNames = hasItems ? items.map((item: any) => item.className) : [];
    
    console.log('💳 Processing payment plan enrollment with database storage:', paymentPlan);
    
    // Get parent user to get schoolId and parentId
    const parent = await storage.getUserByEmail(userEmail);
    if (!parent) {
      return res.status(404).json({
        message: 'Parent user not found',
        error: 'USER_NOT_FOUND'
      });
    }
    
    // Check for existing Stripe subscription for this user
    let existingSubscription: any = null;
    let hasActiveSubscription = false;
    const stripe = await getStripeClient();
    
    try {
      console.log('🔍 Checking for existing Stripe subscription for:', userEmail);
      
      // Search for customer in Stripe by email
      const customers = await stripe.customers.search({
        query: `email:'${userEmail}'`
      });
      
      if (customers.data.length > 0) {
        const customer = customers.data[0];
        console.log('✅ Found Stripe customer:', customer.id);
        
        // Get active subscriptions for this customer
        const subscriptions = await stripe.subscriptions.list({
          customer: customer.id,
          status: 'active',
          limit: 1
        });
        
        if (subscriptions.data.length > 0) {
          existingSubscription = subscriptions.data[0];
          hasActiveSubscription = true;
          console.log('✅ Found active subscription:', existingSubscription.id);
          
          // Update user's Stripe customer ID if not already set
          if (parent.stripeCustomerId !== customer.id) {
            await storage.updateUser(parent.id, { stripeCustomerId: customer.id });
            console.log('✅ Updated user.stripeCustomerId to:', customer.id);
          }
          
          // Update or create membership enrollment if subscription exists
          if (parent.schoolId) {
            const existingMemberships = await storage.getMembershipEnrollmentsByParentId(parent.id);
            const currentYear = new Date().getFullYear();
            const activeMembership = existingMemberships.find(m => 
              m.membershipYear === currentYear && m.status === 'enrolled'
            );
            
            if (!activeMembership) {
              // Create active membership enrollment from Stripe subscription
              const subData = existingSubscription as any;
              
              // Safely parse Stripe timestamps to dates
              const safeStripeDate = (timestamp: number | undefined): Date => {
                if (!timestamp || typeof timestamp !== 'number') {
                  console.warn('⚠️ Invalid Stripe timestamp, using current date');
                  return new Date();
                }
                const date = new Date(timestamp * 1000);
                if (isNaN(date.getTime())) {
                  console.warn('⚠️ Stripe timestamp resulted in invalid date:', timestamp);
                  return new Date();
                }
                return date;
              };
              
              const startDate = safeStripeDate(subData.current_period_start);
              const endDate = safeStripeDate(subData.current_period_end);
              
              await storage.createMembershipEnrollment({
                schoolId: parent.schoolId,
                parentUserId: parent.id,
                membershipYear: currentYear,
                membershipTier: 'basic',
                amount: 17500, // $175 in cents
                amountPaid: 17500,
                remainingBalance: 0,
                totalAmount: 17500, // Total membership amount in cents
                balanceDue: 0, // Fully paid via Stripe subscription
                status: 'enrolled',
                stripeSubscriptionId: existingSubscription.id,
                stripeCustomerId: customer.id,
                startDate,
                renewalDate: endDate,
                notes: 'Auto-synced from Stripe subscription',
                paymentMethod: 'other',
                dueDate: startDate,
                endDate: endDate, // End date same as expiration date
                expirationDate: endDate,
                gracePeriodEnd: null
              });
              console.log('✅ Created active membership enrollment from Stripe subscription');
            }
          }
        } else {
          console.log('ℹ️ No active subscriptions found for customer:', customer.id);
        }
      } else {
        console.log('ℹ️ No Stripe customer found with email:', userEmail);
      }
    } catch (stripeError: any) {
      // Log error but don't fail the whole checkout - just proceed without Stripe sync
      console.error('⚠️ Error checking Stripe subscription (non-blocking):', stripeError.message);
    }
    
    try {
      // Map frontend payment plan values to database enum values
      const paymentPlanMapping: Record<string, string> = {
        'full': 'full_payment',
        'deposit': 'deposit_only',
        'split': 'custom',
        'biweekly': 'biweekly'
      };
      
      const dbPaymentPlan = (paymentPlanMapping[paymentPlan] || 'full_payment') as 'full_payment' | 'deposit_only' | 'biweekly' | 'custom';
      
      // Find or use existing pending enrollments (created when items were added to cart)
      const enrollmentIds: number[] = [];
      
      // Only process items if there are any (skip for membership-only carts)
      if (hasItems) {
        const allEnrollments = await storage.getAllEnrollments?.() || [];
        
        for (const item of items) {
          // Get the child to fetch schoolId
          const child = children.find((c: any) => c.id === item.childId);
          if (!child) {
            throw new Error(`Child ${item.childId} not found`);
          }
        
        // Check if there's already a pending enrollment (from cart or existing)
        let enrollment = allEnrollments.find(e => 
          (item.enrollmentId && e.id === item.enrollmentId) || // Match by enrollmentId if available
          (e.childId === item.childId &&
           ((item.classType === 'marketplace' && e.marketplaceClassId === item.marketplaceClassId) ||
            (item.classType !== 'marketplace' && e.classId === item.classId)) &&
           e.status === 'pending_payment')
        );
        
        if (enrollment) {
          // SECURITY: Validate enrollment belongs to authenticated parent
          if (enrollment.parentEmail !== userEmail && enrollment.parentId !== parent.id) {
            console.error(`🚨 SECURITY: Enrollment ${enrollment.id} does not belong to parent ${userEmail}`);
            console.error(`   Enrollment parent: ${enrollment.parentEmail} (ID: ${enrollment.parentId})`);
            console.error(`   Authenticated parent: ${userEmail} (ID: ${parent.id})`);
            return res.status(403).json({
              message: 'You do not have permission to complete payment for this enrollment',
              error: 'UNAUTHORIZED_ENROLLMENT',
              details: 'This enrollment belongs to a different parent account'
            });
          }
          
          console.log(`✅ Found existing pending enrollment ${enrollment.id} for child ${item.childId}`);
          // Update the existing enrollment with payment plan details
          await storage.updateProgramEnrollment(enrollment.id, {
            paymentPlan: dbPaymentPlan,
            paymentFrequency: paymentFrequency,
            paymentSystemVersion: 'v2_stripe'
          });
          enrollmentIds.push(enrollment.id);
        } else {
          // Get class data for new enrollments
          // Use marketplaceClassId for marketplace enrollments, classId for regular enrollments
          const actualClassId = item.marketplaceClassId || item.classId;
          if (!actualClassId) {
            throw new Error(`No valid class ID found for ${item.className}`);
          }
          
          const classData = await storage.getClassById(actualClassId);
          if (!classData) {
            throw new Error(`Class ${actualClassId} not found for ${item.className}`);
          }
          
          // If no pending enrollment found (shouldn't happen in normal flow), create one
          console.log(`⚠️ No pending enrollment found for child ${item.childId} in class ${item.classId}, creating new one`);
          
          // Validate schoolId - NEVER allow fallback to hardcoded values
          const enrollmentSchoolId = child.schoolId || parent.schoolId;
          if (!enrollmentSchoolId) {
            throw new Error(`Cannot create enrollment: No valid school ID found for child ${item.childId} or parent ${parent.email}`);
          }
          
          // Helper to safely convert date to string
          const formatDate = (date: any): string | null => {
            if (!date) return null;
            if (typeof date === 'string') return date;
            if (date instanceof Date) return date.toISOString().split('T')[0];
            return String(date);
          };
          
          enrollment = await storage.createProgramEnrollment({
            schoolId: enrollmentSchoolId,
            classType: item.classType || 'regular',
            classId: item.classType === 'marketplace' ? null : item.classId,
            marketplaceClassId: item.marketplaceClassId || null,
            programId: item.marketplaceClassId || item.classId,
            childId: item.childId,
            childName: item.childName,
            className: item.className,
            variantId: null,
            parentId: parent.id,
            parentEmail: userEmail,
            totalCost: item.totalCost,
            totalPaid: 0,
            remainingBalance: item.totalCost,
            depositRequired: 0,
            paymentStatus: 'pending',
            paymentPlan: dbPaymentPlan,
            paymentSystemVersion: 'v2_stripe',
            paymentFrequency: paymentFrequency,
            programStartDate: formatDate(classData.startDate),
            programEndDate: formatDate(classData.endDate),
            stripeSubscriptionId: null,
            stripeCustomerId: null,
            notes: null,
            metadata: {},
            status: 'pending_payment', // Start as pending, will be enrolled after payment
            enrollmentDate: new Date()
          });
          enrollmentIds.push(enrollment.id);
        }
        }
      } // End of hasItems block

      console.log('✅ Using enrollments with IDs:', enrollmentIds);

      // SECURITY: Use server-calculated AUTHORITATIVE values for payment
      // NEVER use client-sent totals - they can be manipulated
      const authoritativeTotal = authoritativeItemTotal + authoritativeMembershipAmount;
      
      console.log('💰 Using authoritative totals for payment:', {
        authoritativeItemTotal,
        authoritativeMembershipAmount,
        authoritativeTotal,
        clientSentTotal: total,
        clientSentMembership: membership?.amount || 0
      });
      
      let totalWithMembership = authoritativeTotal;
      
      // UNIFIED CREDITS VALIDATION AND APPLICATION
      // Credits can only reduce payment amount, not exceed it
      // Uses unified credit system for all credit types (volunteer, referral, etc.)
      let validatedCreditsToApply = 0;
      if (creditsToApply > 0) {
        // Validate user has enough available credits using unified credit system
        const totalAvailableCents = await storage.getTotalAvailableCredits(parent.id);
        
        // Cap credits at total amount or available balance (whichever is lower)
        validatedCreditsToApply = Math.min(creditsToApply, totalWithMembership, totalAvailableCents);
        
        console.log('💰 Credits validation (unified system):', {
          requestedCredits: creditsToApply,
          availableCredits: totalAvailableCents,
          validatedCredits: validatedCreditsToApply,
          totalBeforeCredits: totalWithMembership
        });
        
        if (validatedCreditsToApply > 0) {
          totalWithMembership = totalWithMembership - validatedCreditsToApply;
          console.log('💰 Applied credits:', {
            creditsApplied: validatedCreditsToApply,
            newTotal: totalWithMembership
          });
        }
      }
      
      // Build secure membership data from server-side validated parent info
      let serverMembership: { 
        parentUserId: number; 
        schoolId: number; 
        amount: number; 
        year: number;
        discountId?: number;
        discountName?: string;
        originalAmount?: number;
        discountAmount?: number;
      } | undefined;
      
      if (membership && authoritativeMembershipAmount > 0 && parent.schoolId) {
        // Validate that the requested school matches the parent's school
        if (membership.schoolId !== parent.schoolId) {
          console.error('🚨 SECURITY: Membership schoolId mismatch. Request:', membership.schoolId, 'Parent:', parent.schoolId);
          return res.status(403).json({
            message: 'Cannot create membership for a different school',
            error: 'SCHOOL_MISMATCH'
          });
        }
        
        // Get school's configured membership fee
        const parentSchool = await storage.getSchool(parent.schoolId);
        const originalMembershipFee = parentSchool?.membershipFeeAmount || 0;
        
        if (!originalMembershipFee) {
          console.error('🚨 SECURITY: School has no membership fee configured but client sent membership');
          return res.status(403).json({
            message: 'School does not have a membership fee configured',
            error: 'NO_MEMBERSHIP_FEE'
          });
        }
        
        // Calculate the expected discounted membership amount server-side
        // This accounts for any applicable membership discounts
        const discountResult = await calculateMembershipDiscount(
          parent.schoolId,
          parent.id,
          originalMembershipFee
        );
        
        // Validate that client's amount matches server-calculated amount
        // Allow either the original amount OR the discounted amount
        const isValidAmount = authoritativeMembershipAmount === originalMembershipFee || 
                             authoritativeMembershipAmount === discountResult.finalAmount;
        
        if (!isValidAmount) {
          console.error('🚨 SECURITY: Membership amount mismatch. Request:', authoritativeMembershipAmount, 
            'Original:', originalMembershipFee, 'Discounted:', discountResult.finalAmount);
          return res.status(403).json({
            message: 'Membership fee amount does not match expected amount',
            error: 'AMOUNT_MISMATCH',
            details: {
              originalAmount: originalMembershipFee,
              discountedAmount: discountResult.finalAmount,
              clientAmount: authoritativeMembershipAmount
            }
          });
        }
        
        // Use the validated amount (either original or discounted)
        const validatedMembershipAmount = authoritativeMembershipAmount;
        
        // Check if client is actually paying the discounted amount (not full price)
        const isPayingDiscountedAmount = discountResult.appliedDiscounts.length > 0 && 
                                         authoritativeMembershipAmount === discountResult.finalAmount;
        
        // Log discount application if applicable
        if (isPayingDiscountedAmount) {
          console.log('🎫 Membership discount applied:', {
            originalAmount: originalMembershipFee,
            discountAmount: discountResult.discountAmount,
            finalAmount: discountResult.finalAmount,
            appliedDiscount: discountResult.appliedDiscounts[0]?.discountName
          });
        } else if (discountResult.appliedDiscounts.length > 0) {
          console.log('ℹ️ Membership discount available but parent paying full price:', {
            originalAmount: originalMembershipFee,
            availableDiscount: discountResult.appliedDiscounts[0]?.discountName,
            clientAmount: authoritativeMembershipAmount
          });
        }
        
        // Use server-derived parent info, not client-provided
        // IMPORTANT: Only include discount info when client is actually paying discounted amount
        serverMembership = {
          parentUserId: parent.id, // Server-derived, not from client
          schoolId: parent.schoolId, // Server-derived, not from client
          amount: validatedMembershipAmount, // Use validated amount (may be discounted)
          year: membership.year || new Date().getFullYear(),
          // Only include discount info if client is paying the discounted amount
          ...(isPayingDiscountedAmount && {
            discountId: discountResult.appliedDiscounts[0].discountId,
            discountName: discountResult.appliedDiscounts[0].discountName,
            originalAmount: originalMembershipFee,
            discountAmount: discountResult.discountAmount
          })
        };
        
        console.log('🎫 Membership fee included in payment (server-validated):', {
          enrollmentTotal: total,
          membershipAmount: authoritativeMembershipAmount,
          totalWithMembership,
          membershipYear: serverMembership.year,
          parentUserId: serverMembership.parentUserId,
          schoolId: serverMembership.schoolId
        });
      }

      // Build discount snapshot for payment tracking/audit
      // cartPricingResult is stored at handler level so it's accessible here
      let discountSnapshot: {
        subtotal: number;
        discountTotal: number;
        appliedDiscounts: Array<{
          source: 'promo' | 'sibling' | 'free_after_threshold' | 'automatic' | 'bundle';
          discountId?: number;
          code?: string;
          name: string;
          type: string;
          value: number;
          amount: number;
        }>;
      } | undefined;
      
      // Check if cartPricingResult is defined (only exists when hasItems is true)
      if (hasItems && cartPricingResult && cartPricingResult.discounts.totalDiscountAmount > 0) {
        // Map applied discounts to the snapshot format
        const mappedDiscounts = cartPricingResult.discounts.appliedDiscounts.map((d: any) => ({
          source: (d.sourceType || 'automatic') as 'promo' | 'sibling' | 'free_after_threshold' | 'automatic' | 'bundle',
          discountId: d.discountId || d.id,
          code: d.code,
          name: d.name || d.discountName || 'Discount',
          type: d.type || d.discountType || 'percentage',
          value: d.value || d.discountValue || 0,
          amount: d.discountAmount || d.amount || 0
        }));
        
        discountSnapshot = {
          subtotal: cartPricingResult.subtotal,
          discountTotal: cartPricingResult.discounts.totalDiscountAmount,
          appliedDiscounts: mappedDiscounts
        };
        
        console.log('💰 Built discount snapshot for payment:', {
          subtotal: discountSnapshot.subtotal,
          discountTotal: discountSnapshot.discountTotal,
          discountsCount: discountSnapshot.appliedDiscounts.length,
          discountNames: discountSnapshot.appliedDiscounts.map(d => d.name)
        });
      }
      
      // CREDIT-ONLY CHECKOUT: Handle $0 total after credits are applied
      // When credits fully cover the order, skip Stripe and process directly with admin approval
      if (totalWithMembership === 0 && validatedCreditsToApply > 0) {
        console.log('🎫 CREDIT-ONLY CHECKOUT: Total is $0 after credits, skipping Stripe');
        
        // Generate a unique checkout session ID for credit hold tracking
        const checkoutSessionId = `credit_only_${Date.now()}_${parent.id}`;
        
        // RESERVE-THEN-FINALIZE PATTERN:
        // 1. Create credit holds (reserve credits without consuming them)
        // 2. Process enrollment updates
        // 3. On success: finalize holds (convert to actual usage)
        // 4. On failure: release holds (credits automatically become available again)
        
        const creditHoldResult = await storage.createCreditHolds(
          parent.id,
          validatedCreditsToApply,
          checkoutSessionId,
          `Credit-only checkout for enrollments: ${enrollmentIds.join(', ')}`,
          30 // 30 minute expiration
        );
        
        console.log('🔒 Credits held (reserved):', {
          totalHeld: creditHoldResult.totalHeld,
          holdsCount: creditHoldResult.holds.length
        });
        
        // Validate we held enough credits
        if (creditHoldResult.totalHeld < validatedCreditsToApply) {
          // Not enough credits available - release any partial holds
          await storage.releaseCreditHolds(checkoutSessionId);
          return res.status(400).json({
            message: 'Insufficient credits available. Some credits may be held by other checkouts.',
            error: 'INSUFFICIENT_CREDITS'
          });
        }
        
        // Track original enrollment states for rollback on failure
        const originalEnrollmentStates: Map<number, { status: string; paymentStatus: string; totalPaid: number; remainingBalance: number | null; metadata: any }> = new Map();
        
        try {
        // Update enrollments to pending_admin_approval status (requires school admin approval for $0 orders)
        // Allocate credits proportionally based on cart pricing
        // Use DISCOUNTED total for allocation, SUBTOTAL for proportions (they use same basis)
        const discountedEnrollmentTotal = hasItems && cartPricingResult ? cartPricingResult.total : 0;
        const rawEnrollmentSubtotal = hasItems && cartPricingResult ? cartPricingResult.subtotal : 0;
        const membershipTotal = authoritativeMembershipAmount || 0;
        
        // Pre-calculate credit portions: enrollments get their discounted share, membership gets the rest
        const enrollmentCreditsToAllocate = Math.min(discountedEnrollmentTotal, validatedCreditsToApply);
        const membershipCreditsToAllocate = Math.min(membershipTotal, validatedCreditsToApply - enrollmentCreditsToAllocate);
        
        console.log('📊 Credit allocation plan:', {
          totalCredits: validatedCreditsToApply,
          enrollmentSubtotal: rawEnrollmentSubtotal,
          enrollmentDiscountedTotal: discountedEnrollmentTotal,
          membershipTotal,
          enrollmentCredits: enrollmentCreditsToAllocate,
          membershipCredits: membershipCreditsToAllocate
        });
        
        const creditAllocationDetails: { enrollments: { id: number; credits: number; cost: number }[]; membership: { credits: number; cost: number } | null } = {
          enrollments: [],
          membership: null
        };
        
        // Allocate enrollment credits proportionally across all enrollments
        // Use running remainder approach to ensure exact reconciliation (no rounding drift)
        let remainingEnrollmentCredits = enrollmentCreditsToAllocate;
        const enrollmentCount = enrollmentIds.length;
        let processedCount = 0;
        
        for (const enrollmentId of enrollmentIds) {
          const enrollment = await storage.getProgramEnrollmentById(enrollmentId);
          if (!enrollment) continue;
          
          // Store original state for rollback on failure
          originalEnrollmentStates.set(enrollmentId, {
            status: enrollment.status || 'pending',
            paymentStatus: enrollment.paymentStatus || 'pending',
            totalPaid: enrollment.totalPaid || 0,
            remainingBalance: enrollment.remainingBalance,
            metadata: enrollment.metadata
          });
          
          processedCount++;
          const isLastEnrollment = processedCount === enrollmentCount;
          
          const enrollmentCost = enrollment.totalCost || 0;
          
          let creditsForThisEnrollment: number;
          let discountedEnrollmentCost: number;
          
          if (isLastEnrollment) {
            // Last enrollment absorbs any remaining credits to ensure exact reconciliation
            creditsForThisEnrollment = remainingEnrollmentCredits;
            discountedEnrollmentCost = creditsForThisEnrollment; // In credit-only checkout, paid = cost
          } else {
            // Calculate proportional share for non-last enrollments
            const proportion = rawEnrollmentSubtotal > 0 ? enrollmentCost / rawEnrollmentSubtotal : 0;
            creditsForThisEnrollment = Math.round(enrollmentCreditsToAllocate * proportion);
            // Clamp to remaining
            creditsForThisEnrollment = Math.min(creditsForThisEnrollment, remainingEnrollmentCredits);
            discountedEnrollmentCost = creditsForThisEnrollment; // In credit-only checkout, paid = cost
          }
          
          remainingEnrollmentCredits -= creditsForThisEnrollment;
          
          creditAllocationDetails.enrollments.push({
            id: enrollmentId,
            credits: creditsForThisEnrollment,
            cost: discountedEnrollmentCost // In credit-only, credits applied = cost covered
          });
          
          await storage.updateProgramEnrollment(enrollmentId, {
            status: 'pending_admin_approval',
            paymentStatus: 'completed', // Paid via credits
            totalPaid: creditsForThisEnrollment, // Record only this enrollment's portion
            // In credit-only checkout, credits fully cover the order, so remainingBalance is always 0
            remainingBalance: 0,
            metadata: {
              creditOnlyCheckout: true,
              creditsAppliedToThisEnrollment: creditsForThisEnrollment,
              discountedCost: discountedEnrollmentCost,
              totalCreditsAppliedInCheckout: validatedCreditsToApply,
              checkoutSessionId,
              requiresAdminApproval: true,
              checkoutDate: new Date().toISOString()
            }
          });
          console.log(`✅ Enrollment ${enrollmentId} updated: credits applied ${creditsForThisEnrollment}, status pending_admin_approval`);
        }
        
        // Create payment history record for credit-only checkout using saveStripePayment
        const totalEnrollmentCredits = creditAllocationDetails.enrollments.reduce((sum, e) => sum + e.credits, 0);
        
        // Track membership credit allocation if applicable
        // Use actual remaining credits after enrollment allocation for exact reconciliation
        const actualMembershipCredits = validatedCreditsToApply - totalEnrollmentCredits;
        if (actualMembershipCredits > 0) {
          creditAllocationDetails.membership = {
            credits: actualMembershipCredits,
            cost: actualMembershipCredits // In credit-only checkout, credits = cost
          };
          console.log(`✅ Membership credit allocation: ${actualMembershipCredits} cents applied (absorbs any rounding from enrollment allocation)`);
        }
        
        const totalMembershipCredits = creditAllocationDetails.membership?.credits || 0;
        
        // Reconciliation check: ensure allocated credits equal total credits (with 1 cent rounding tolerance)
        const totalAllocatedCredits = totalEnrollmentCredits + totalMembershipCredits;
        const allocationDifference = Math.abs(totalAllocatedCredits - validatedCreditsToApply);
        if (allocationDifference > 1) {
          console.error('🚨 Credit allocation reconciliation failed:', {
            validatedCreditsToApply,
            totalAllocatedCredits,
            enrollmentCredits: totalEnrollmentCredits,
            membershipCredits: totalMembershipCredits,
            difference: allocationDifference
          });
        } else {
          console.log('✅ Credit allocation reconciled:', {
            total: validatedCreditsToApply,
            allocated: totalAllocatedCredits,
            enrollments: totalEnrollmentCredits,
            membership: totalMembershipCredits
          });
        }
        
        const paymentHistoryEntry = await (storage as any).saveStripePayment({
          userId: parent.id,
          paymentIntentId: checkoutSessionId, // Use the checkout session ID for tracking
          amount: validatedCreditsToApply,
          currency: 'usd',
          status: 'succeeded',
          metadata: {
            creditOnlyCheckout: true,
            enrollmentIds,
            checkoutSessionId,
            checkoutType: 'credit_only',
            creditsApplied: validatedCreditsToApply,
            creditAllocation: {
              enrollmentCredits: totalEnrollmentCredits,
              membershipCredits: totalMembershipCredits,
              details: creditAllocationDetails
            }
          }
        });
        
        console.log('📝 Payment history created:', {
          id: paymentHistoryEntry.id,
          totalCredits: validatedCreditsToApply,
          enrollmentCredits: totalEnrollmentCredits,
          membershipCredits: totalMembershipCredits
        });
        
        // FINALIZE: Convert credit holds to actual usage now that payment history is created
        const finalizeResult = await storage.finalizeCreditHolds(
          checkoutSessionId,
          paymentHistoryEntry.id,
          `Credit-only checkout for enrollments: ${enrollmentIds.join(', ')}`
        );
        
        console.log('✅ Credits finalized:', {
          finalizedCount: finalizeResult.finalizedCount,
          totalFinalized: finalizeResult.totalFinalized
        });
        
        // Return success response for credit-only checkout
        return res.json({
          creditOnlyCheckout: true,
          enrollmentIds,
          creditsApplied: validatedCreditsToApply,
          message: 'Enrollment submitted for admin approval. Your credits have been applied.',
          paymentHistoryId: paymentHistoryEntry.id,
          status: 'pending_admin_approval'
        });
        } catch (creditCheckoutError: any) {
          // RELEASE: Release the credit holds (credits become available again)
          console.error('❌ Credit-only checkout failed, rolling back and releasing credit holds...', creditCheckoutError);
          
          // First, rollback any enrollment updates that were made
          if (originalEnrollmentStates.size > 0) {
            console.log(`🔄 Rolling back ${originalEnrollmentStates.size} enrollment(s) to original state...`);
            for (const [enrollmentId, originalState] of originalEnrollmentStates.entries()) {
              try {
                await storage.updateProgramEnrollment(enrollmentId, {
                  status: originalState.status as any,
                  paymentStatus: originalState.paymentStatus,
                  totalPaid: originalState.totalPaid,
                  remainingBalance: originalState.remainingBalance,
                  metadata: originalState.metadata
                });
                console.log(`   🔄 Rolled back enrollment ${enrollmentId}`);
              } catch (rollbackError) {
                console.error(`   ⚠️ Failed to rollback enrollment ${enrollmentId}:`, rollbackError);
              }
            }
          }
          
          // Then release credit holds
          try {
            const releaseResult = await storage.releaseCreditHolds(checkoutSessionId);
            console.log('🔓 Credit holds released after failed checkout:', {
              releasedCount: releaseResult.releasedCount,
              totalReleased: releaseResult.totalReleased
            });
          } catch (releaseError) {
            console.error('🚨 CRITICAL: Failed to release credit holds after failed checkout:', releaseError);
            // Holds will auto-expire after 30 minutes if release fails
          }
          
          throw creditCheckoutError; // Re-throw to be caught by outer error handler
        }
      }
      
      // Use payment plan service for ALL payment plans
      // NOTE: CombinedStorage has all IStorage methods needed but doesn't formally implement the interface
      // See server/storage.ts TODO comment for full context on storage interface alignment
      const paymentPlanService = new StripePaymentPlanService(storage as any);
      
      // Calculate credit allocation for regular Stripe payments (simpler than credit-only)
      // Credits are applied: enrollments first, then membership
      let creditAllocationForPayment: { enrollmentCredits: number; membershipCredits: number } | undefined;
      if (validatedCreditsToApply > 0) {
        const discountedEnrollmentTotal = hasItems && cartPricingResult ? cartPricingResult.total : 0;
        const membershipCost = authoritativeMembershipAmount || 0;
        
        // Enrollments absorb credits first, up to their discounted total
        const enrollmentCredits = Math.min(discountedEnrollmentTotal, validatedCreditsToApply);
        // Remaining credits go to membership
        const membershipCredits = Math.min(membershipCost, validatedCreditsToApply - enrollmentCredits);
        
        creditAllocationForPayment = {
          enrollmentCredits,
          membershipCredits
        };
        
        console.log('📊 Credit allocation for Stripe payment:', creditAllocationForPayment);
      }
      
      const paymentPlanResult = await paymentPlanService.createEducationalPaymentPlan({
        parentEmail: userEmail,
        enrollmentIds,
        totalAmount: totalWithMembership, // Include membership fee in total (already reduced by credits)
        paymentPlan: paymentPlan as 'deposit' | 'biweekly' | 'full',
        paymentFrequency: paymentFrequency as 'weekly' | 'biweekly' | 'monthly' | 'one_time',
        membership: serverMembership, // Pass server-validated membership data
        discountSnapshot, // Pass discount tracking data
        creditsAppliedCents: validatedCreditsToApply, // Pass credits for metadata storage (unified credit system)
        creditAllocation: creditAllocationForPayment // Pass credit breakdown for payment history
      });

      console.log('✅ Payment plan created successfully:', {
        paymentIntentId: paymentPlanResult.paymentIntent.id,
        scheduledPaymentsCount: paymentPlanResult.scheduledPayments.length,
        paymentPlan
      });

      // All payment plans now return clientSecret 🎉
      res.json({
        clientSecret: paymentPlanResult.paymentIntent.client_secret,
        paymentIntentId: paymentPlanResult.paymentIntent.id,
        enrollmentIds,
        scheduledPayments: paymentPlanResult.scheduledPayments,
        paymentPlan,
        // Include volunteer credits info
        creditsApplied: validatedCreditsToApply,
        // Include Stripe subscription info for UI display
        hasActiveSubscription,
        subscriptionInfo: existingSubscription ? {
          id: existingSubscription.id,
          status: existingSubscription.status,
          currentPeriodEnd: (() => {
            try {
              const ts = existingSubscription.current_period_end;
              if (!ts || typeof ts !== 'number') return null;
              const date = new Date(ts * 1000);
              return isNaN(date.getTime()) ? null : date.toISOString();
            } catch {
              return null;
            }
          })()
        } : null
      });

    } catch (error: any) {
      console.error('❌ Error in enrollment creation or payment plan:', error);
      res.status(500).json({
        message: 'Failed to create enrollment or payment plan',
        error: error.message
      });
    }
  } catch (error: any) {
    console.error('❌ Error creating payment intent:', error);
    res.status(500).json({
      message: 'Failed to create payment intent',
      error: error.message
    });
  }
});

// Create payment intent for product order
router.post('/create-product-payment', supabaseAuth, async (req: any, res) => {
  try {
    console.log('💳 Creating payment intent for product order');
    
    // Get the authenticated user's email from Supabase auth
    const userEmail = req.user.email;

    const { submissionId, totalAmount, description } = req.body;

    if (!submissionId || !totalAmount || totalAmount <= 0) {
      return res.status(400).json({
        message: 'Submission ID and valid total amount are required',
        error: 'INVALID_REQUEST'
      });
    }

    // Create payment intent
    const stripe = await getStripeClient();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount), // Amount in cents
      currency: 'usd',
      description: description || 'Product Order',
      metadata: {
        submissionId: submissionId.toString(),
        userEmail,
        type: 'product_order'
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log('✅ Payment intent created:', paymentIntent.id);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });

  } catch (error: any) {
    console.error('❌ Error creating product payment intent:', error);
    res.status(500).json({
      message: 'Failed to create payment intent',
      error: error.message
    });
  }
});

// Get subscription schedules for authenticated parent
router.get('/subscription-schedules', supabaseAuth, async (req: any, res) => {
  try {
    const parentEmail = req.user.email;
    console.log('📅 Fetching subscription schedules for parent:', parentEmail);

    // Test mode: return empty schedules
    if (process.env.NODE_ENV === 'test') {
      console.log('🧪 Test mode: Returning empty subscription schedules');
      return res.json({
        success: true,
        schedules: []
      });
    }

    // Get unique Stripe customer IDs for this parent
    const customerIds = await storage.getStripeCustomerIdsByParentEmail(parentEmail);
    
    if (customerIds.length === 0) {
      return res.json({
        success: true,
        schedules: []
      });
    }

    console.log(`📅 Found ${customerIds.length} Stripe customer IDs`);

    // Fetch subscription schedules from Stripe for each customer ID
    const stripe = await getStripeClient();
    const allSchedules = [];
    for (const customerId of customerIds) {
      const schedules = await stripe.subscriptionSchedules.list({
        customer: customerId,
        limit: 100
      });
      allSchedules.push(...schedules.data);
    }

    console.log(`✅ Retrieved ${allSchedules.length} subscription schedules from Stripe`);

    // Transform to frontend format (camelCase top-level, snake_case for Stripe nested objects)
    const formattedSchedules = allSchedules.map(schedule => {
      // Find current phase index by matching phase start_date with current_phase
      let currentPhaseIndex = 0;
      if (schedule.current_phase && schedule.phases) {
        currentPhaseIndex = schedule.phases.findIndex((phase: any) => 
          phase.start_date === (schedule.current_phase as any)?.start_date
        );
        if (currentPhaseIndex === -1) currentPhaseIndex = 0;
      }

      return {
        id: schedule.id,
        status: schedule.status,
        created: schedule.created,
        customer: schedule.customer,
        metadata: schedule.metadata,
        phases: schedule.phases, // Keep snake_case as it's Stripe's format
        currentPhaseIndex: currentPhaseIndex, // Numeric index instead of object
        endBehavior: schedule.end_behavior,
        releasedAt: schedule.released_at,
        releasedSubscription: schedule.released_subscription
      };
    });

    res.json({
      success: true,
      schedules: formattedSchedules
    });

  } catch (error: any) {
    console.error('❌ Error fetching subscription schedules:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch subscription schedules'
    });
  }
});

// Get active subscriptions for authenticated parent
router.get('/subscriptions', supabaseAuth, async (req: any, res) => {
  try {
    const parentEmail = req.user.email;
    console.log('💳 Fetching subscriptions for parent:', parentEmail);

    // Test mode: return empty subscriptions
    if (process.env.NODE_ENV === 'test') {
      console.log('🧪 Test mode: Returning empty subscriptions');
      return res.json({
        success: true,
        subscriptions: []
      });
    }

    // Get unique Stripe customer IDs for this parent
    const customerIds = await storage.getStripeCustomerIdsByParentEmail(parentEmail);
    
    if (customerIds.length === 0) {
      return res.json({
        success: true,
        subscriptions: []
      });
    }

    console.log(`💳 Found ${customerIds.length} Stripe customer IDs`);

    // Fetch subscriptions from Stripe for each customer ID
    const stripe = await getStripeClient();
    const allSubscriptions = [];
    for (const customerId of customerIds) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all', // Get all statuses (active, past_due, canceled, etc.)
        limit: 100
      });
      allSubscriptions.push(...subscriptions.data);
    }

    console.log(`✅ Retrieved ${allSubscriptions.length} subscriptions from Stripe`);

    // Transform to frontend format (keep Stripe snake_case for nested properties)
    const formattedSubscriptions = allSubscriptions.map(sub => {
      const subData = sub as any;
      return {
        id: sub.id,
        status: sub.status,
        created: sub.created,
        current_period_start: subData.current_period_start,
        current_period_end: subData.current_period_end,
        customer: sub.customer,
        items: sub.items.data,
        metadata: sub.metadata,
        cancel_at_period_end: sub.cancel_at_period_end,
        canceled_at: sub.canceled_at,
        schedule: sub.schedule
      };
    });

    res.json({
      success: true,
      subscriptions: formattedSubscriptions
    });

  } catch (error: any) {
    console.error('❌ Error fetching subscriptions:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch subscriptions'
    });
  }
});

// Get payment history for authenticated user
router.get('/payment-history', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    console.log('💰 Fetching payment history for user:', userEmail);

    // Get user from database to get user ID
    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Fetch payment history from database
    const paymentHistory = await storage.getPaymentsByParentEmail(userEmail);
    
    console.log(`✅ Retrieved ${paymentHistory.length} payment records from database`);

    // Format payment history for frontend
    const formattedPayments = paymentHistory.map((payment: any) => ({
      id: payment.id,
      paymentIntentId: payment.paymentIntentId,
      customerId: payment.customerId,
      amount: payment.amount,
      status: payment.status,
      subscriptionId: payment.subscriptionId,
      createdDate: payment.createdDate,
      paymentMethod: payment.paymentMethod,
      description: payment.description
    }));

    res.json({
      success: true,
      payments: formattedPayments
    });

  } catch (error: any) {
    console.error('❌ Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch payment history'
    });
  }
});

// Admin endpoint for manual Stripe subscription sync
router.post('/admin/sync-stripe-subscription', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const { email } = req.body;
    const adminSchoolId = req.schoolId; // School ID from middleware
    console.log('🔄 Admin manually syncing Stripe subscription for email:', email, 'from school:', adminSchoolId);

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    // Security: First, get user from database and verify they exist
    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: `User with email ${email} not found in database`
      });
    }

    // Security: Verify user belongs to the requesting admin's school BEFORE contacting Stripe
    if (!user.schoolId || String(user.schoolId) !== String(adminSchoolId)) {
      console.log(`❌ Authorization failed: user school ${user.schoolId} doesn't match admin school ${adminSchoolId}`);
      return res.status(403).json({
        success: false,
        message: `User with email ${email} does not belong to your school`
      });
    }

    console.log('✅ Authorization passed: user belongs to admin school');

    // Now proceed with Stripe lookup
    const stripe = await getStripeClient();
    const customers = await stripe.customers.search({
      query: `email:'${email}'`
    });

    if (customers.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No Stripe customer found with email: ${email}`
      });
    }

    const customer = customers.data[0];
    console.log('✅ Found Stripe customer:', customer.id);

    // Get active subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1
    });

    if (subscriptions.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Stripe customer ${customer.id} exists but has no active subscriptions`
      });
    }

    const subscription = subscriptions.data[0];
    console.log('✅ Found active subscription:', subscription.id);

    // Update user's Stripe customer ID
    await storage.updateUser(user.id, { stripeCustomerId: customer.id });
    console.log('✅ Updated user.stripeCustomerId to:', customer.id);

    // Create or update membership enrollment
    // Note: We already verified user.schoolId === adminSchoolId above, but use adminSchoolId directly for clarity
    const existingMemberships = await storage.getMembershipEnrollmentsByParentId(user.id);
    const currentYear = new Date().getFullYear();
    const activeMembership = existingMemberships.find(m => 
      m.membershipYear === currentYear && m.status === 'enrolled'
    );

    if (!activeMembership) {
      // Create active membership enrollment from Stripe subscription
      // Use adminSchoolId directly to ensure school ownership (already verified above)
      const subData = subscription as any;
      
      // Safely parse Stripe timestamps to dates
      const safeStripeDate = (timestamp: number | undefined): Date => {
        if (!timestamp || typeof timestamp !== 'number') {
          console.warn('⚠️ Invalid Stripe timestamp, using current date');
          return new Date();
        }
        const date = new Date(timestamp * 1000);
        if (isNaN(date.getTime())) {
          console.warn('⚠️ Stripe timestamp resulted in invalid date:', timestamp);
          return new Date();
        }
        return date;
      };
      
      const startDate = safeStripeDate(subData.current_period_start);
      const endDate = safeStripeDate(subData.current_period_end);
      
      await storage.createMembershipEnrollment({
        schoolId: Number(adminSchoolId),
        parentUserId: user.id,
        membershipYear: currentYear,
        membershipTier: 'basic',
        amount: 17500, // $175 in cents
        amountPaid: 17500,
        remainingBalance: 0,
        totalAmount: 17500, // Total membership amount in cents
        balanceDue: 0, // Fully paid via Stripe subscription
        status: 'enrolled',
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: customer.id,
        startDate,
        renewalDate: endDate,
        notes: 'Admin-synced from Stripe subscription',
        paymentMethod: 'other',
        dueDate: startDate,
        endDate: endDate, // End date same as expiration date
        expirationDate: endDate,
        gracePeriodEnd: null
      });
      console.log('✅ Created active membership enrollment from Stripe subscription');
    } else {
      console.log('ℹ️ User already has active membership for current year');
    }

    const subData = subscription as any;
    res.json({
      success: true,
      message: `Successfully synced Stripe subscription for ${email}`,
      data: {
        customerId: customer.id,
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        currentPeriodEnd: (() => {
          try {
            const ts = subData.current_period_end;
            if (!ts || typeof ts !== 'number') return null;
            const date = new Date(ts * 1000);
            return isNaN(date.getTime()) ? null : date.toISOString();
          } catch {
            return null;
          }
        })()
      }
    });

  } catch (error: any) {
    console.error('❌ Error syncing Stripe subscription:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to sync Stripe subscription'
    });
  }
});

// Test endpoint for Stripe account lookup debugging
router.post('/test-account-lookup', supabaseAuth, async (req: any, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    console.log('🧪 Testing Stripe account lookup for email:', email);
    
    const result: any = {
      email,
      timestamp: new Date().toISOString(),
      stripeCustomer: null,
      activeSubscriptions: [],
      databaseUser: null,
      membershipEnrollments: [],
      summary: {
        hasStripeCustomer: false,
        hasActiveSubscription: false,
        hasDatabaseRecord: false,
        hasActiveMembership: false
      }
    };

    // Step 1: Check database for user
    try {
      const user = await storage.getUserByEmail(email);
      if (user) {
        result.databaseUser = {
          id: user.id,
          email: user.email,
          schoolId: user.schoolId,
          stripeCustomerId: user.stripeCustomerId,
          role: user.role
        };
        result.summary.hasDatabaseRecord = true;
        console.log('✅ Found database user:', user.id);

        // Check for membership enrollments
        const memberships = await storage.getMembershipEnrollmentsByParentId(user.id);
        result.membershipEnrollments = memberships.map(m => ({
          id: m.id,
          membershipYear: m.membershipYear,
          status: m.status,
          amount: m.amount,
          amountPaid: m.amountPaid,
          stripeSubscriptionId: m.stripeSubscriptionId,
          startDate: m.startDate,
          renewalDate: m.renewalDate
        }));
        
        const activeMembership = memberships.find(m => 
          m.status === 'enrolled' && m.membershipYear === new Date().getFullYear()
        );
        result.summary.hasActiveMembership = !!activeMembership;
        console.log(`📋 Found ${memberships.length} membership enrollments`);
      } else {
        console.log('ℹ️ No database user found');
      }
    } catch (dbError: any) {
      console.error('⚠️ Database lookup error:', dbError.message);
      result.databaseError = dbError.message;
    }

    // Step 2: Search Stripe for customer
    try {
      const stripe = await getStripeClient();
      const customers = await stripe.customers.search({
        query: `email:'${email}'`
      });
      
      if (customers.data.length > 0) {
        const customer = customers.data[0];
        result.stripeCustomer = {
          id: customer.id,
          email: customer.email,
          created: customer.created,
          metadata: customer.metadata
        };
        result.summary.hasStripeCustomer = true;
        console.log('✅ Found Stripe customer:', customer.id);

        // Step 3: Get active subscriptions
        const subscriptions = await stripe.subscriptions.list({
          customer: customer.id,
          status: 'active',
          limit: 10
        });
        
        result.activeSubscriptions = subscriptions.data.map(sub => {
          const subData = sub as any;
          return {
            id: sub.id,
            status: sub.status,
            created: sub.created,
            current_period_start: subData.current_period_start,
            current_period_end: subData.current_period_end,
            items: sub.items.data.map(item => ({
              id: item.id,
              price: item.price,
              quantity: item.quantity
            })),
            metadata: sub.metadata
          };
        });
        
        result.summary.hasActiveSubscription = subscriptions.data.length > 0;
        console.log(`✅ Found ${subscriptions.data.length} active subscriptions`);
      } else {
        console.log('ℹ️ No Stripe customer found');
      }
    } catch (stripeError: any) {
      console.error('⚠️ Stripe lookup error:', stripeError.message);
      result.stripeError = stripeError.message;
    }

    // Summary and recommendations
    if (result.summary.hasStripeCustomer && !result.summary.hasDatabaseRecord) {
      result.recommendation = 'Stripe customer exists but no database user. User may need to register.';
    } else if (result.summary.hasActiveSubscription && !result.summary.hasActiveMembership) {
      result.recommendation = 'Active Stripe subscription found but no active membership enrollment. Consider syncing.';
    } else if (result.summary.hasStripeCustomer && result.databaseUser?.stripeCustomerId !== result.stripeCustomer.id) {
      result.recommendation = 'Stripe customer ID mismatch. Database should be updated.';
    } else if (result.summary.hasActiveSubscription && result.summary.hasActiveMembership) {
      result.recommendation = 'Everything is in sync! ✅';
    } else {
      result.recommendation = 'No issues detected or user has no Stripe account.';
    }

    res.json({
      success: true,
      result
    });

  } catch (error: any) {
    console.error('❌ Test account lookup error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test account lookup'
    });
  }
});

// NOTE: Webhook handler has been moved to dedicated webhook-handler.ts 
// and is applied directly in server/index.ts BEFORE any JSON parsers
// to ensure proper raw buffer handling for signature verification.
// This prevents middleware order issues where JSON parsers would 
// corrupt the raw buffer needed for Stripe signature verification.

// Request free enrollment (100% discount) - requires admin approval
router.post('/request-free-enrollment', supabaseAuth, async (req: any, res) => {
  try {
    console.log('🆓 Processing free enrollment request (100% discount)');
    
    const userEmail = req.user.email;
    const { items, subtotal, discounts, total, discountCode } = req.body;

    // Validate this is actually a free enrollment
    if (total !== 0) {
      return res.status(400).json({
        success: false,
        message: 'This endpoint is only for free enrollments (100% discount)',
        error: 'NOT_FREE_ENROLLMENT'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart items are required',
        error: 'MISSING_ITEMS'
      });
    }

    // Get parent user
    const parent = await storage.getUserByEmail(userEmail);
    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Parent user not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Verify user owns the children in the cart
    const children = await storage.getChildrenByParentEmail(userEmail);
    const childIds = children.map(child => child.id);
    
    const invalidItems = items.filter((item: any) => !childIds.includes(item.childId));
    if (invalidItems.length > 0) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Cannot enroll children not owned by this parent',
        error: 'UNAUTHORIZED_CHILDREN'
      });
    }

    // Find or update existing pending enrollments to pending_admin_approval
    const enrollmentIds = [];
    const allEnrollments = await storage.getAllEnrollments?.() || [];
    
    for (const item of items) {
      const child = children.find(c => c.id === item.childId);
      if (!child) {
        throw new Error(`Child ${item.childId} not found`);
      }

      // Find existing pending enrollment
      let enrollment = allEnrollments.find(e => 
        (item.enrollmentId && e.id === item.enrollmentId) ||
        (e.childId === item.childId &&
         ((item.classType === 'marketplace' && e.marketplaceClassId === item.marketplaceClassId) ||
          (item.classType !== 'marketplace' && e.classId === item.classId)) &&
         e.status === 'pending_payment')
      );

      if (enrollment) {
        // Update to pending_admin_approval status
        await storage.updateEnrollment(enrollment.id, {
          status: 'pending_admin_approval',
          totalCost: 0,
          remainingBalance: 0,
          paymentStatus: 'completed', // No payment needed
          notes: `Free enrollment - 100% discount applied (${discountCode || 'unknown code'}). Awaiting admin approval.`,
          metadata: {
            ...((enrollment.metadata as any) || {}),
            discountCode: discountCode,
            discountAmount: subtotal,
            originalTotal: subtotal,
            discountedTotal: 0,
            requestedAt: new Date().toISOString(),
            requestedBy: userEmail
          }
        });
        enrollmentIds.push(enrollment.id);
        console.log(`✅ Updated enrollment ${enrollment.id} to pending_admin_approval`);
      } else {
        // Create new enrollment with pending_admin_approval status
        const schoolId = parent.schoolId || child.schoolId || 1;
        const newEnrollment = await storage.createEnrollment({
          schoolId,
          classType: item.classType || 'marketplace',
          classId: item.classType !== 'marketplace' ? item.classId : null,
          marketplaceClassId: item.classType === 'marketplace' ? item.marketplaceClassId : null,
          programId: null,
          childId: item.childId,
          childName: item.childName,
          className: item.className,
          variantId: item.variantId || null,
          parentId: parent.id,
          parentEmail: userEmail,
          totalCost: 0,
          totalPaid: 0,
          remainingBalance: 0,
          depositRequired: 0,
          paymentStatus: 'completed',
          paymentPlan: 'full_payment',
          paymentFrequency: 'one_time',
          paymentSystemVersion: 'v2_stripe',
          programStartDate: item.startDate || null,
          programEndDate: item.endDate || null,
          status: 'pending_admin_approval',
          enrollmentDate: new Date(),
          notes: `Free enrollment - 100% discount applied (${discountCode || 'unknown code'}). Awaiting admin approval.`,
          metadata: {
            discountCode: discountCode,
            discountAmount: subtotal,
            originalTotal: subtotal,
            discountedTotal: 0,
            requestedAt: new Date().toISOString(),
            requestedBy: userEmail
          }
        });
        enrollmentIds.push(newEnrollment.id);
        console.log(`✅ Created new enrollment ${newEnrollment.id} with pending_admin_approval`);
      }
    }

    // Create notification for school admin
    try {
      const schoolId = parent.schoolId || 1;
      const childNames = items.map((item: any) => item.childName).join(', ');
      const classNames = items.map((item: any) => item.className).join(', ');
      
      // Find school admins to notify - get all staff and filter by role
      const allSchoolStaff = await storage.getSchoolStaffBySchoolId(schoolId);
      const schoolAdmins = allSchoolStaff.filter((s: any) => s.role === 'school_admin');
      
      for (const admin of schoolAdmins) {
        if (!admin.userId) continue;
        
        // Create notification with required fields
        const notification = await storage.createNotification({
          senderId: parent.id,
          type: 'in_app',
          priority: 'high',
          subject: 'Free Enrollment Pending Approval',
          content: `${parent.email} has requested a free enrollment (100% discount) for ${childNames} in ${classNames}. Please review and approve or reject this request.`,
          targetType: 'individual',
          targetData: { userId: admin.userId, enrollmentIds, discountCode },
          scheduledFor: null,
          expiresAt: null
        });
        
        // Create recipient for the notification
        await storage.createNotificationRecipient({
          notificationId: notification.id,
          recipientId: admin.userId,
          deliveryType: 'in_app',
          status: 'pending'
        });
      }
      console.log(`📧 Sent notification to ${schoolAdmins.length} school admins`);
    } catch (notifyError) {
      console.error('⚠️ Error sending admin notification (non-blocking):', notifyError);
    }

    res.json({
      success: true,
      message: 'Free enrollment request submitted. Awaiting admin approval.',
      enrollmentIds,
      status: 'pending_admin_approval'
    });

  } catch (error: any) {
    console.error('❌ Free enrollment request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process free enrollment request',
      error: error.message
    });
  }
});

// Admin: Get pending approval enrollments
router.get('/pending-approvals', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    const user = await storage.getUserByEmail(userEmail);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check if user is a school admin (check role from user object or staff records)
    const isSchoolAdmin = user.role === 'schoolAdmin' || user.role === 'admin' || user.role === 'superAdmin';
    
    if (!isSchoolAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only school administrators can view pending approvals' 
      });
    }

    // Get all pending_admin_approval enrollments for this school
    const allEnrollments = await storage.getAllEnrollments?.() || [];
    const pendingApprovals = allEnrollments.filter(e => 
      e.status === 'pending_admin_approval' && 
      e.schoolId === user.schoolId
    );

    res.json({
      success: true,
      pendingApprovals: pendingApprovals.map(e => ({
        id: e.id,
        childName: e.childName,
        className: e.className,
        parentEmail: e.parentEmail,
        discountCode: (e.metadata as any)?.discountCode || 'Unknown',
        originalTotal: (e.metadata as any)?.originalTotal || 0,
        requestedAt: (e.metadata as any)?.requestedAt || e.createdAt,
        status: e.status
      }))
    });

  } catch (error: any) {
    console.error('❌ Error fetching pending approvals:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Admin: Approve or reject free enrollment
router.post('/approve-enrollment/:enrollmentId', supabaseAuth, async (req: any, res) => {
  try {
    const userEmail = req.user.email;
    const enrollmentId = parseInt(req.params.enrollmentId);
    const { action, reason } = req.body; // action: 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid action. Must be "approve" or "reject"'
      });
    }

    const user = await storage.getUserByEmail(userEmail);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check if user is a school admin
    const isSchoolAdmin = user.role === 'schoolAdmin' || user.role === 'admin' || user.role === 'superAdmin';
    
    if (!isSchoolAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Only school administrators can approve enrollments' 
      });
    }

    // Get the enrollment
    const allEnrollments = await storage.getAllEnrollments?.() || [];
    const enrollment = allEnrollments.find(e => e.id === enrollmentId);

    if (!enrollment) {
      return res.status(404).json({ success: false, error: 'Enrollment not found' });
    }

    if (enrollment.status !== 'pending_admin_approval') {
      return res.status(400).json({ 
        success: false, 
        error: 'Enrollment is not pending approval' 
      });
    }

    // Verify enrollment belongs to admin's school
    if (enrollment.schoolId !== user.schoolId) {
      return res.status(403).json({ 
        success: false, 
        error: 'Cannot approve enrollments from other schools' 
      });
    }

    if (action === 'approve') {
      // Approve the enrollment
      await storage.updateEnrollment(enrollmentId, {
        status: 'enrolled',
        notes: `${enrollment.notes || ''}\n\nApproved by ${userEmail} on ${new Date().toISOString()}`,
        metadata: {
          ...((enrollment.metadata as any) || {}),
          approvedAt: new Date().toISOString(),
          approvedBy: userEmail
        }
      });

      // Notify parent of approval
      try {
        const parentUser = await storage.getUserByEmail(enrollment.parentEmail);
        if (parentUser) {
          const notification = await storage.createNotification({
            senderId: user.id,
            type: 'in_app',
            priority: 'normal',
            subject: 'Enrollment Approved!',
            content: `Your free enrollment request for ${enrollment.childName} in ${enrollment.className} has been approved. The enrollment is now active.`,
            targetType: 'individual',
            targetData: { userId: parentUser.id, enrollmentId },
            scheduledFor: null,
            expiresAt: null
          });
          
          await storage.createNotificationRecipient({
            notificationId: notification.id,
            recipientId: parentUser.id,
            deliveryType: 'in_app',
            status: 'pending'
          });
        }
      } catch (notifyError) {
        console.error('⚠️ Error sending approval notification:', notifyError);
      }

      console.log(`✅ Enrollment ${enrollmentId} approved by ${userEmail}`);
      res.json({
        success: true,
        message: 'Enrollment approved successfully',
        enrollmentId,
        newStatus: 'enrolled'
      });

    } else {
      // Reject the enrollment
      await storage.updateEnrollment(enrollmentId, {
        status: 'cancelled',
        notes: `${enrollment.notes || ''}\n\nRejected by ${userEmail} on ${new Date().toISOString()}. Reason: ${reason || 'Not specified'}`,
        metadata: {
          ...((enrollment.metadata as any) || {}),
          rejectedAt: new Date().toISOString(),
          rejectedBy: userEmail,
          rejectionReason: reason || 'Not specified'
        }
      });

      // Notify parent of rejection
      try {
        const parentUser = await storage.getUserByEmail(enrollment.parentEmail);
        if (parentUser) {
          const notification = await storage.createNotification({
            senderId: user.id,
            type: 'in_app',
            priority: 'normal',
            subject: 'Enrollment Request Not Approved',
            content: `Your free enrollment request for ${enrollment.childName} in ${enrollment.className} was not approved. ${reason ? `Reason: ${reason}` : 'Please contact the school for more information.'}`,
            targetType: 'individual',
            targetData: { userId: parentUser.id, enrollmentId, reason },
            scheduledFor: null,
            expiresAt: null
          });
          
          await storage.createNotificationRecipient({
            notificationId: notification.id,
            recipientId: parentUser.id,
            deliveryType: 'in_app',
            status: 'pending'
          });
        }
      } catch (notifyError) {
        console.error('⚠️ Error sending rejection notification:', notifyError);
      }

      console.log(`❌ Enrollment ${enrollmentId} rejected by ${userEmail}`);
      res.json({
        success: true,
        message: 'Enrollment rejected',
        enrollmentId,
        newStatus: 'cancelled'
      });
    }

  } catch (error: any) {
    console.error('❌ Error processing enrollment approval:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Admin endpoint to sync payments from Stripe for a specific parent
// This helps reconcile missing payments that may not have been recorded by webhooks
router.post('/admin/sync-payments/:parentEmail', supabaseAuth, requireSchoolContext, async (req: any, res) => {
  try {
    const parentEmail = decodeURIComponent(req.params.parentEmail);
    const adminSchoolId = req.schoolId;
    
    console.log(`🔄 Syncing Stripe payments for ${parentEmail} (admin from school ${adminSchoolId})`);
    
    // SECURITY: Verify the parent exists and admin has access to them
    const parentUser = await storage.getUserByEmail(parentEmail);
    if (!parentUser) {
      return res.status(404).json({
        success: false,
        message: 'Parent not found',
        error: 'PARENT_NOT_FOUND'
      });
    }
    
    // SECURITY: Check if admin has access to this parent via their children or enrollments
    const parentChildren = await storage.getChildrenByParentEmail(parentEmail);
    const parentEnrollments = await storage.getProgramEnrollmentsByParent(parentUser.id);
    const parentMemberships = await storage.getMembershipEnrollmentsByParentId(parentUser.id);
    
    // Check if any enrollment or membership is from admin's school
    const hasSchoolEnrollment = parentEnrollments.some(e => e.schoolId === adminSchoolId);
    const hasSchoolMembership = parentMemberships.some(m => m.schoolId === adminSchoolId);
    const parentBelongsToSchool = parentUser.schoolId === adminSchoolId;
    
    if (!hasSchoolEnrollment && !hasSchoolMembership && !parentBelongsToSchool) {
      console.warn(`🚫 Admin from school ${adminSchoolId} attempted to sync payments for parent ${parentEmail} who is not associated with their school`);
      return res.status(403).json({
        success: false,
        message: 'Access denied: This parent is not associated with your school',
        error: 'UNAUTHORIZED_ACCESS'
      });
    }
    
    const stripe = await getStripeClient();
    
    // Find the Stripe customer for this parent
    const customers = await stripe.customers.list({
      email: parentEmail,
      limit: 1
    });
    
    if (customers.data.length === 0) {
      return res.json({
        success: true,
        message: 'No Stripe customer found for this email',
        synced: 0,
        paymentsFound: 0
      });
    }
    
    const customer = customers.data[0];
    
    // Get all successful payment intents for this customer
    const paymentIntents = await stripe.paymentIntents.list({
      customer: customer.id,
      limit: 100
    });
    
    // Filter for succeeded payments only
    const succeededPayments = paymentIntents.data.filter(pi => pi.status === 'succeeded');
    
    console.log(`💳 Found ${succeededPayments.length} succeeded payments in Stripe for ${parentEmail}`);
    
    // Check which payments are already recorded in the database
    const existingPayments = await storage.getPaymentsByParentEmail(parentEmail);
    const existingStripeIds = new Set(existingPayments.map(p => p.stripePaymentIntentId));
    
    // Find missing payments
    const missingPayments = succeededPayments.filter(pi => !existingStripeIds.has(pi.id));
    
    console.log(`⚠️ Found ${missingPayments.length} payments missing from database`);
    
    // Sync missing payments to database
    const syncedPayments = [];
    for (const pi of missingPayments) {
      try {
        // Extract metadata with defensive parsing
        let itemsJson: string | undefined;
        let description = 'Synced payment from Stripe';
        let childName = 'Unknown';
        let className = 'Unknown';
        let enrollmentIds: number[] = [];
        let derivedSchoolId = adminSchoolId;
        
        // Safely extract itemsJson
        if (pi.metadata?.itemsJson && typeof pi.metadata.itemsJson === 'string') {
          itemsJson = pi.metadata.itemsJson;
          try {
            const items = JSON.parse(itemsJson);
            if (Array.isArray(items) && items.length > 0) {
              childName = items[0]?.childName || 'Unknown';
              className = items.length > 1 ? `${items.length} classes` : (items[0]?.className || 'Unknown');
              description = `Synced payment (${items.length} items)`;
            }
          } catch (e) {
            console.warn('Failed to parse itemsJson, using defaults');
          }
        }
        
        // Safely extract enrollmentIds and derive schoolId from enrollments
        if (pi.metadata?.enrollmentIds && typeof pi.metadata.enrollmentIds === 'string') {
          try {
            const parsedIds = JSON.parse(pi.metadata.enrollmentIds);
            if (Array.isArray(parsedIds)) {
              enrollmentIds = parsedIds.filter(id => typeof id === 'number');
              
              // Derive schoolId from the first valid enrollment
              for (const eId of enrollmentIds) {
                const enrollment = parentEnrollments.find(e => e.id === eId);
                if (enrollment && enrollment.schoolId) {
                  derivedSchoolId = enrollment.schoolId;
                  break;
                }
              }
            }
          } catch (e) {
            console.warn('Failed to parse enrollmentIds, using empty array');
          }
        }
        
        // SECURITY: Only sync payments that belong to admin's school
        // If we can't determine the school from enrollment, only sync if parent belongs to admin's school
        if (derivedSchoolId !== adminSchoolId && !parentBelongsToSchool) {
          console.log(`⚠️ Skipping payment ${pi.id} - belongs to different school (${derivedSchoolId})`);
          continue;
        }
        
        // Use the parent's email from our verified record, not from Stripe metadata
        const payment = {
          schoolId: derivedSchoolId,
          parentId: parentUser.id,
          parentEmail: parentEmail, // Use verified email
          childName,
          className,
          description: `[Synced] ${description}`,
          amount: pi.amount,
          currency: pi.currency || 'usd',
          status: 'completed' as const,
          stripePaymentIntentId: pi.id,
          stripeChargeId: null,
          stripeRefundId: null,
          originalPaymentId: null,
          enrollmentIds,
          metadata: {
            syncedAt: new Date().toISOString(),
            syncedByAdmin: req.user?.email,
            originalCreated: new Date(pi.created * 1000).toISOString()
          },
          paymentDate: new Date(pi.created * 1000)
        };
        
        const createdPayment = await storage.createPayment(payment);
        syncedPayments.push({
          id: createdPayment.id,
          stripeId: pi.id,
          amount: pi.amount / 100,
          created: new Date(pi.created * 1000).toISOString()
        });
        
        console.log(`✅ Synced payment ${pi.id} ($${pi.amount / 100})`);
      } catch (paymentError: any) {
        console.error(`❌ Failed to sync payment ${pi.id}:`, paymentError.message);
      }
    }
    
    res.json({
      success: true,
      message: `Synced ${syncedPayments.length} of ${missingPayments.length} missing payments`,
      synced: syncedPayments.length,
      paymentsFound: succeededPayments.length,
      existingPayments: existingPayments.length,
      missingPayments: missingPayments.length,
      syncedPayments
    });
    
  } catch (error: any) {
    console.error('❌ Error syncing payments from Stripe:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;