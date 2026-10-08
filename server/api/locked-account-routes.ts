import type { Express } from "express";
import { storage } from "../storage";
import { supabaseAuth } from "../middleware/supabase-auth";
import { requireRole } from "../middleware/auth0-auth";
import { emailsMatch } from "@shared/parent-identity";
import { canReadChild, isPlatformAdmin, staffCanAccessSchool } from "../lib/route-access";

const requireSuperAdmin = [supabaseAuth, requireRole(["superAdmin"])] as const;

export function registerLockedAccountRoutes(app: Express): void {
  app.get("/api/children/:id/enrollments", supabaseAuth, async (req: any, res) => {
    try {
      const childId = parseInt(req.params.id, 10);
      if (Number.isNaN(childId)) {
        return res.status(400).json({ message: "Invalid child ID" });
      }

      const child = await storage.getChildById(childId);
      if (!child) {
        return res.status(404).json({ message: "Child not found" });
      }
      if (!(await canReadChild(req, child))) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const enrollments = await storage.getEnrollmentsByChildId(childId);
      return res.json(enrollments);
    } catch (error) {
      console.error("Error fetching child enrollments:", error);
      return res.status(500).json({ message: "Failed to fetch enrollments" });
    }
  });

  app.get("/api/children/:id", supabaseAuth, async (req: any, res) => {
    try {
      const childId = parseInt(req.params.id, 10);
      if (Number.isNaN(childId)) {
        return res.status(400).json({ message: "Invalid child ID" });
      }

      const child = await storage.getChildById(childId);
      if (!child) {
        return res.status(404).json({ message: "Child not found" });
      }
      if (!(await canReadChild(req, child))) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      return res.json(child);
    } catch (error) {
      console.error("Error fetching child:", error);
      return res.status(500).json({ message: "Failed to fetch child data" });
    }
  });

  app.get("/api/users/role/:email", supabaseAuth, async (req: any, res) => {
    try {
      const email = decodeURIComponent(req.params.email || "");
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const selfEmail = req.user?.email as string | undefined;
      if (!selfEmail) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const isSelf = emailsMatch(selfEmail, email);
      if (!isSelf) {
        const sameSchool =
          user.schoolId != null && (await staffCanAccessSchool(req, user.schoolId));
        if (!isPlatformAdmin(req) && !sameSchool) {
          return res.status(403).json({ message: "Insufficient permissions" });
        }
      }

      return res.json({ role: user.role, email: user.email });
    } catch (error) {
      console.error("Error fetching user role:", error);
      return res.status(500).json({ message: "Error fetching user role" });
    }
  });

  app.get("/api/admin/backups", ...requireSuperAdmin, async (_req, res) => {
    try {
      const { backupService } = await import("../services/backupService.js");
      const backups = await backupService.listBackups();
      res.json(backups);
    } catch (error) {
      console.error("Failed to list backups:", error);
      res.status(500).json({ error: "Failed to list backups" });
    }
  });

  app.post("/api/admin/backups/create", ...requireSuperAdmin, async (_req, res) => {
    try {
      const { backupService } = await import("../services/backupService.js");
      await backupService.performBackup();
      res.json({ success: true, message: "Backup created successfully" });
    } catch (error) {
      console.error("Failed to create backup:", error);
      res.status(500).json({ error: "Failed to create backup" });
    }
  });

  app.post("/api/admin/backups/restore/:timestamp", ...requireSuperAdmin, async (req, res) => {
    try {
      const { backupService } = await import("../services/backupService.js");
      const { timestamp } = req.params;
      const result = await backupService.restoreBackup(timestamp);

      if (result.success) {
        res.json({ success: true, message: `Restored ${result.restoredCount} files` });
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error) {
      console.error("Failed to restore backup:", error);
      res.status(500).json({ error: "Failed to restore backup" });
    }
  });
}
