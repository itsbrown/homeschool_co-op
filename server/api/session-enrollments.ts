import { Router } from "express";
import { z } from "zod";
import { sessions, programEnrollments } from "@shared/schema";
import { createEnrollmentDataSimple } from "@shared/enrollment-factory";
import { storage } from "../storage";
import { supabaseAuth } from "../middleware/supabase-auth";
import { getDb } from "../db";
import { eq, and, inArray, notInArray, sql } from "drizzle-orm";

const router = Router();

const sessionEnrollSchema = z.object({
  childIds: z.array(z.number()).min(1, "Select at least one child"),
  sessionIds: z.array(z.number()).min(1, "Select at least one session"),
  variant: z.enum(["half_day", "full_day"]),
});

router.post("/", supabaseAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const parsed = sessionEnrollSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid enrollment data", errors: parsed.error.flatten() });
    }

    const { childIds, sessionIds, variant } = parsed.data;
    const db = await getDb();

    const parentChildren = await storage.getChildrenByParentId(userId);
    const parentChildIds = parentChildren.map((c: any) => c.id);
    const invalidChildIds = childIds.filter((id) => !parentChildIds.includes(id));
    if (invalidChildIds.length > 0) {
      return res.status(403).json({ message: "You can only enroll your own children" });
    }

    const sessionRows = await db
      .select()
      .from(sessions)
      .where(inArray(sessions.id, sessionIds));

    if (sessionRows.length !== sessionIds.length) {
      return res.status(404).json({ message: "One or more sessions not found" });
    }

    const closedSessions = sessionRows.filter((s) => !s.enrollmentOpen);
    if (closedSessions.length > 0) {
      return res.status(400).json({
        message: `Enrollment is not open for: ${closedSessions.map((s) => s.name).join(", ")}`,
      });
    }

    const createdEnrollments: any[] = [];
    const skipped: string[] = [];

    for (const childId of childIds) {
      const child = parentChildren.find((c: any) => c.id === childId);
      if (!child) continue;

      for (const session of sessionRows) {
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

        const capacity = variant === "half_day" ? session.halfDayCapacity : session.fullDayCapacity;

        let enrollmentStatus = "pending_payment";
        let waitlistPosition = null;

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

        const variantLabel = variant === "half_day" ? "Half Day" : "Full Day";
        const user = await storage.getUser(userId);

        const enrollmentData = createEnrollmentDataSimple({
          schoolId: session.schoolId,
          classType: "marketplace",
          classId: null,
          marketplaceClassId: null,
          sessionId: session.id,
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

        console.log(
          `📝 Session enrollment: ${child.firstName} → ${session.name} (${variantLabel}) - ${enrollmentStatus} - $${(price / 100).toFixed(2)}`
        );
      }
    }

    res.json({
      enrollments: createdEnrollments,
      skipped,
      message:
        createdEnrollments.length > 0
          ? `${createdEnrollments.length} enrollment(s) added to cart`
          : "No new enrollments created",
    });
  } catch (error) {
    console.error("Error creating session enrollments:", error);
    res.status(500).json({ message: "Failed to create enrollments" });
  }
});

export default router;
