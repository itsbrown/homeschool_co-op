import express from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { emailLog } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = express.Router();

const sendGridEventSchema = z.object({
  email: z.string().email(),
  event: z.enum(['processed', 'delivered', 'bounce', 'dropped', 'deferred', 'open', 'click', 'spamreport']),
  sg_message_id: z.string().optional(),
  reason: z.string().optional(),
  type: z.string().optional(),
  category: z.union([z.string(), z.array(z.string())]).optional(),
});

/** SendGrid Event Webhook stub — updates email_log delivery status when events arrive. */
router.post('/events', express.json(), async (req, res) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    const db = await getDb();

    for (const raw of events) {
      const parsed = sendGridEventSchema.safeParse(raw);
      if (!parsed.success) continue;

      const { email, event, reason } = parsed.data;
      const status =
        event === 'delivered' ? 'sent' : event === 'bounce' || event === 'dropped' ? 'failed' : undefined;
      if (!status) continue;

      const [latest] = await db
        .select()
        .from(emailLog)
        .where(eq(emailLog.recipientEmail, email))
        .orderBy(desc(emailLog.id))
        .limit(1);

      if (latest) {
        await db
          .update(emailLog)
          .set({
            status,
            error: status === 'failed' ? reason ?? `SendGrid ${event}` : null,
          })
          .where(eq(emailLog.id, latest.id));
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[sendgrid-webhook] Error processing events:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
