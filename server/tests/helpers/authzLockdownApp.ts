import express, { type Application } from "express";
import schoolsRouter from "../../api/schools";
import schoolAdminRouter from "../../api/school-admin";
import adminUsersRouter from "../../api/admin-users";
import migrationRouter from "../../routes/migration";
import paymentImportRouter from "../../api/payment-import";
import roleInvitationsRouter from "../../api/role-invitations";
import schoolApplicationsRouter from "../../api/school-applications";
import stripeMigrationRouter from "../../api/stripe-migration";
import paymentCleanupRouter from "../../api/payment-cleanup";
import ocrTestRouter from "../../api/ocr-test";
import educatorRouter from "../../api/educator";
import { registerLockedAccountRoutes } from "../../api/locked-account-routes";

export function createAuthzLockdownApp(): Application {
  const app = express();
  app.use(express.json());
  registerLockedAccountRoutes(app);
  app.use("/api/schools", schoolsRouter);
  app.use("/api/school-admin", schoolAdminRouter);
  app.use("/api/admin-users", adminUsersRouter);
  app.use("/api/migration", migrationRouter);
  app.use("/api/payment-import", paymentImportRouter);
  app.use("/api/admin/role-invitations", roleInvitationsRouter);
  app.use("/api/school-applications", schoolApplicationsRouter);
  app.use("/api/stripe-migration", stripeMigrationRouter);
  app.use("/api/payment-cleanup", paymentCleanupRouter);
  app.use("/api/ocr-test", ocrTestRouter);
  app.use("/api/educator", educatorRouter);
  return app;
}
