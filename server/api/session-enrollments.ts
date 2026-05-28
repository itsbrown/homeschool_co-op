import { Router } from "express";
import { z } from "zod";
import { sessions, programEnrollments } from "@shared/schema";
import { createEnrollmentDataSimple } from "@shared/enrollment-factory";
import { storage } from "../storage";
import { supabaseAuth } from "../middleware/supabase-auth";
import { getDb } from "../db";
import { eq, and, inArray, notInArray, sql } from "drizzle-orm";
import {
  getChildrenForAuthenticatedParent,
  parentAuthCriteriaFromRequest,
  resolveParentDbUser,
  resolveSchoolIdsForParentSessions,
} from "../lib/parent-auth-scope";
import { getLocationCore } from "../lib/location-db";
import {
  isLocationActivationCancelled,
  isLocationInNoticePeriod,
  isLegacyActiveLocation,
  locationAllowsNewWishlistSignups,
} from "@shared/location-activation";
import { recheckLocationThreshold } from "../services/location-activation-service";

const router = Router();

const sessionEnrollSchema = z.object({
  childIds: z.array(z.number()).min(1, "Select at least one child"),
  sessionIds: z.array(z.number()).min(1, "Select at least one session"),
  variant: z.enum(["half_day", "full_day"]),
});

router.post("/", supabaseAuth, async (req: any, res) => {
  try {
    const criteria = parentAuthCriteriaFromRequest(req);
    const parent = await resolveParentDbUser(storage, criteria);
    if (!parent?.id) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const userId = parent.id;

    const parsed = sessionEnrollSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid enrollment data", errors: parsed.error.flatten() });
    }

    const { childIds, sessionIds, variant } = parsed.data;
    const db = await getDb();

    const parentChildren = await getChildrenForAuthenticatedParent(storage, criteria);
    const parentChildIds = parentChildren.map((c: any) => c.id);
    const invalidChildIds = childIds.filter((id) => !parentChildIds.includes(id));
    if (invalidChildIds.length > 0) {
      return res.status(403).json({ message: "You can only enroll your own children" });
    }

    const { schoolIds } = await resolveSchoolIdsForParentSessions(
      storage,
      criteria,
      req.user?.schoolId,
    );

    const sessionRows = await db
      .select()
      .from(sessions)
      .where(inArray(sessions.id, sessionIds));

    if (sessionRows.length !== sessionIds.length) {
      return res.status(404).json({ message: "One or more sessions not found" });
    }

    const outOfScopeSessions = sessionRows.filter((s) => !schoolIds.includes(s.schoolId));
    if (outOfScopeSessions.length > 0) {
      return res.status(403).json({
        message: `Session not available for your school: ${outOfScopeSessions.map((s) => s.name).join(", ")}`,
      });
    }

    for (const session of sessionRows) {
      if (session.locationId != null) {
        const loc = await getLocationCore(session.locationId);
        if (isLocationActivationCancelled(loc)) {
          return res.status(400).json({
            message: `Enrollment is closed for campus: ${loc?.name ?? session.locationId}`,
          });
        }
        if (isLocationInNoticePeriod(loc)) {
          return res.status(400).json({
            message: `This campus has reached its signup goal. New waitlist signups are closed while we prepare to charge families.`,
          });
        }
      }
    }

    for (const session of sessionRows) {
      if (session.enrollmentOpen) continue;
      if (session.locationId != null) {
        const loc = await getLocationCore(session.locationId);
        if (locationAllowsNewWishlistSignups(loc)) continue;
      }
      return res.status(400).json({
        message: `Enrollment is not open for: ${session.name}`,
      });
    }

    const requiresWishlist = await Promise.all(
      sessionRows.map(async (session) => {
        if (session.locationId == null) return { session, wishlist: false, location: null as Awaited<ReturnType<typeof getLocationCore>> };
        const location = await getLocationCore(session.locationId);
        const wishlist =
          !isLegacyActiveLocation(location) && locationAllowsNewWishlistSignups(location);
        return { session, wishlist, location };
      }),
    );

    const anyWishlist = requiresWishlist.some((r) => r.wishlist);
    if (anyWishlist && !parent.stripeDefaultPaymentMethodId) {
      return res.status(402).json({
        message: "A saved payment method is required to join the campus waitlist.",
        requiresPaymentMethod: true,
        code: "PAYMENT_METHOD_REQUIRED",
      });
    }

    const createdEnrollments: any[] = [];
    const skipped: string[] = [];
    const touchedLocationIds = new Set<number>();

    for (const childId of childIds) {
      const child = parentChildren.find((c: any) => c.id === childId);
      if (!child) continue;

      for (const { session, wishlist, location } of requiresWishlist) {
        const price = variant === "half_day" ? session.halfDayPrice : session.fullDayPrice;
        if (price == null || price <= 0) {
          skipped.push(`${child.firstName} - ${session.name} (${variant} pricing not configured)`);
          continue;
        }

        const duplicateRows = await db
          .select({ id: programEnrollments.id })
          .from(programEnrollments)
          .where(
            and(
              eq(programEnrollments.childId, childId),
              eq(programEnrollments.sessionId, session.id),
              notInArray(programEnrollments.status, ["cancelled"])
            )
          )
          .limit(1);

        if (duplicateRows.length > 0) {
          skipped.push(`${child.firstName} - ${session.name} (already enrolled or in cart)`);
          continue;
        }

        let enrollmentStatus = "pending_payment";
        let waitlistPosition = null;

        if (wishlist && session.locationId != null) {
          enrollmentStatus = "location_wishlist";
          touchedLocationIds.add(session.locationId);
        } else {
          const capacity = variant === "half_day" ? session.halfDayCapacity : session.fullDayCapacity;

          if (capacity != null && capacity > 0) {
            const [countResult] = await db
              .select({ count: sql<number>`count(*)::int` })
              .from(programEnrollments)
              .where(
                and(
                  eq(programEnrollments.sessionId, session.id),
                  eq(programEnrollments.variantId, variant),
                  notInArray(programEnrollments.status, ["cancelled"])
                )
              );

            const currentCount = countResult?.count || 0;

            if (currentCount >= capacity) {
              const [waitlistResult] = await db
                .select({ count: sql<number>`count(*)::int` })
                .from(programEnrollments)
                .where(
                  and(
                    eq(programEnrollments.sessionId, session.id),
                    eq(programEnrollments.variantId, variant),
                    eq(programEnrollments.status, "waitlist")
                  )
                );
              waitlistPosition = (waitlistResult?.count || 0) + 1;
              enrollmentStatus = "waitlist";
            }
          }
        }

        const variantLabel = variant === "half_day" ? "Half Day" : "Full Day";
        const user = await storage.getUser(userId);

        const enrollmentData = createEnrollmentDataSimple({
          schoolId: session.schoolId,
          classType: "marketplace",
          classId: null,
          marketplaceClassId: null,
          sessionId: session.id,
          locationId: session.locationId ?? null,
          enrollmentVersion: "v2",
          dayType: variant,
          enrolledHalfDayPrice: session.halfDayPrice ?? null,
          enrolledFullDayPrice: session.fullDayPrice ?? null,
          childId,
          childName: `${child.firstName} ${child.lastName}`,
          className: `${session.name} - ${variantLabel}`,
          variantId: variant,
          parentId: userId,
          parentEmail: user?.email || child.parentEmail || "",
          totalCost: price,
          totalPaid: 0,
          remainingBalance: price,
          depositRequired: 0,
          paymentStatus: "pending",
          paymentPlan: null,
          paymentFrequency: "one_time",
          programStartDate: session.startDate,
          programEndDate: session.endDate,
          status: enrollmentStatus as any,
          waitlistPosition,
          stripeSubscriptionId: null,
          stripeCustomerId: null,
        });

        const saved = await storage.createProgramEnrollment(enrollmentData);
        createdEnrollments.push(saved);

        if (saved.enrollmentVersion === "v2" && saved.id && enrollmentStatus !== "location_wishlist") {
          const dayType = saved.dayType ?? variant;
          try {
            await storage.createPriceHistoryEntry({
              enrollmentId: saved.id,
              changeType: "initial",
              previousDayType: null,
              newDayType: dayType,
              previousPriceCents: 0,
              newPriceCents: price,
              differenceCents: price,
              effectiveDate: session.startDate,
              changedBy: userId,
              reason: "Session enrollment created",
            });
          } catch (historyError) {
            console.error(
              `Failed to write price history for enrollment ${saved.id}:`,
              historyError,
            );
          }
        }

        console.log(
          `📝 Session enrollment: ${child.firstName} → ${session.name} (${variantLabel}) - ${enrollmentStatus} - $${(price / 100).toFixed(2)}`
        );
      }
    }

    for (const locId of touchedLocationIds) {
      await recheckLocationThreshold(locId);
    }

    const hasWishlist = createdEnrollments.some((e) => e.status === "location_wishlist");

    res.json({
      enrollments: createdEnrollments,
      skipped,
      requiresPaymentMethod: hasWishlist && !parent.stripeDefaultPaymentMethodId,
      message:
        createdEnrollments.length > 0
          ? hasWishlist
            ? `${createdEnrollments.length} waitlist signup(s) recorded — you will be notified before any charge`
            : `${createdEnrollments.length} enrollment(s) added to cart`
          : "No new enrollments created",
    });
  } catch (error) {
    console.error("Error creating session enrollments:", error);
    const details =
      process.env.NODE_ENV !== "production" && error instanceof Error
        ? error.message
        : undefined;
    res.status(500).json({
      message: "Failed to create enrollments",
      ...(details ? { details } : {}),
    });
  }
});

export default router;
