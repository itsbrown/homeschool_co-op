import { Router, type Request, type Response } from "express";
import { supabaseAuth } from "../middleware/supabase-auth";
import { storage } from "../storage";
import {
  parentAuthCriteriaFromRequest,
  resolveParentDbUser,
} from "../lib/parent-auth-scope";
import { listClassAllergyAlertsForParent } from "../lib/class-allergy-alerts";

export const parentClassAllergyAlertsRouter = Router();

parentClassAllergyAlertsRouter.get("/", supabaseAuth, async (req: Request, res: Response) => {
  try {
    const criteria = parentAuthCriteriaFromRequest(req);
    if (!criteria.email && !criteria.supabaseId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const parent = await resolveParentDbUser(storage, criteria);
    if (!parent) return res.status(401).json({ message: "Parent account not found" });
    const alerts = await listClassAllergyAlertsForParent(parent.id);
    res.json({ alerts });
  } catch (error) {
    console.error("Failed to load class allergy alerts:", error);
    res.status(500).json({ message: "Failed to load class allergy alerts" });
  }
});
