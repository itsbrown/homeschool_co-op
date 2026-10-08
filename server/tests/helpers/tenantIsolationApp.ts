import express, { type Application } from "express";
import schoolsRouter from "../../api/schools";
import schoolAdminRouter from "../../api/school-admin";
import educatorRouter from "../../api/educator";
import classesRouter from "../../api/classes";
import childrenRouter from "../../api/children";
import paymentHistoryRouter from "../../api/payment-history";
import customFormsRouter from "../../api/custom-forms";
import notificationsRouter from "../../api/notifications";
import calendarEventsRouter from "../../api/calendar-events";
import scheduleBuilderRouter from "../../api/schedule-builder";
import financialReportsRouter from "../../api/financial-reports";
import storeAdminRouter from "../../api/store-admin";
import fundraisersRouter from "../../api/fundraisers";
import platformSubscriptionsRouter from "../../api/platform-subscriptions";
import schoolApplicationsRouter from "../../api/school-applications";
import { supabaseAuth } from "../../middleware/supabase-auth";

/** Routes a school admin, educator, or parent could use to reach another school. */
export function createTenantIsolationApp(): Application {
  const app = express();
  app.use(express.json());
  app.use("/api/schools", schoolsRouter);
  app.use("/api/school-admin", schoolAdminRouter);
  app.use("/api/educator", educatorRouter);
  app.use("/api/classes", classesRouter);
  app.use("/api/children", childrenRouter);
  app.use("/api/payments", paymentHistoryRouter);
  app.use("/api/custom-forms", customFormsRouter);
  app.use("/api/notifications", supabaseAuth, notificationsRouter);
  app.use("/api/calendar-events", calendarEventsRouter);
  app.use("/api/schedule-builder", scheduleBuilderRouter);
  app.use("/api/admin/financial-reports", supabaseAuth, financialReportsRouter);
  app.use("/api/school-admin/public-store", storeAdminRouter);
  app.use("/api/fundraisers", fundraisersRouter);
  app.use("/api/platform-subscriptions", platformSubscriptionsRouter);
  app.use("/api/school-applications", schoolApplicationsRouter);
  return app;
}
