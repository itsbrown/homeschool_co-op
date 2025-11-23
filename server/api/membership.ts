import { Router } from "express";
import {
  getSchoolMemberships,
  getMembershipById,
  updateMembership,
  recordMembershipPayment,
  getMembershipSummary,
  getMySchoolMemberships,
  getMySchoolMembershipSummary,
  createMembershipEnrollment,
  createMembershipCheckoutSession
} from "./membership-admin";

const router = Router();

// Admin routes for membership management (authenticated user's school)
router.get("/my-school", getMySchoolMemberships);
router.get("/my-school/summary", getMySchoolMembershipSummary);

// Admin routes for membership management (specific school - platform admins)
router.get("/schools/:schoolId", getSchoolMemberships);
router.get("/summary/:schoolId", getMembershipSummary);
router.get("/:id", getMembershipById);
router.patch("/:id", updateMembership);
router.post("/:id/payment", recordMembershipPayment);

// Create new membership enrollment
router.post("/", createMembershipEnrollment);

// Create Stripe Checkout Session for membership payment
router.post("/create-checkout-session", createMembershipCheckoutSession);

export default router;
