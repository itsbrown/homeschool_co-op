import type { Request, Response } from "express";
import { requirePreviewDemo } from "../server/services/concierge/preview-demo-guard";
import { createPreviewExpressApp } from "../server/preview/express-app";

type ExpressHandler = (req: Request, res: Response) => void;

let app: ExpressHandler | null = null;

/**
 * Vercel Node function. The Express app is created on the first request so
 * `vercel build` can bundle this file without a database or demo env.
 * PREVIEW_DEMO_MODE is required at runtime, and the guard refuses Replit
 * production and production-looking DATABASE_URL values.
 */
export default function previewHandler(req: Request, res: Response) {
  if (!app) {
    requirePreviewDemo();
    app = createPreviewExpressApp();
  }
  return app(req, res);
}
