/**
 * Admin payment-flow health endpoint.
 *
 * Mounted in app-init.ts behind supabaseAuth + requireRole(FINANCIAL_ADMIN_ROLES):
 *   GET  /api/admin/payment-health        → latest cached snapshot (fast, read-only)
 *   POST /api/admin/payment-health/run    → run a sweep on demand
 *        body: { autoHeal?: boolean, notify?: boolean } (both default true)
 *
 * The on-demand run never charges a card; the only mutation is the documented
 * safe auto-heal (cancel stale installments on $0-balance enrollments).
 */

import express from "express";
import rateLimit from "express-rate-limit";
import {
  getLastPaymentFlowSnapshot,
  runPaymentFlowMonitor,
} from "../services/payment-flow-monitor";

const router = express.Router();

const runLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Payment-health sweep ran recently. Please wait a moment." },
});

router.get("/", (_req, res) => {
  const snapshot = getLastPaymentFlowSnapshot();
  if (!snapshot) {
    return res.json({
      status: "pending",
      message: "No payment-flow health sweep has run yet in this process.",
      snapshot: null,
    });
  }
  res.json({ status: "ok", snapshot });
});

router.post("/run", runLimiter, async (req, res) => {
  try {
    const autoHeal = req.body?.autoHeal !== false;
    const notify = req.body?.notify !== false;
    const snapshot = await runPaymentFlowMonitor({ autoHeal, notify });
    res.json({ status: "ok", snapshot });
  } catch (err: any) {
    res.status(500).json({ status: "error", error: err?.message ?? String(err) });
  }
});

export default router;
