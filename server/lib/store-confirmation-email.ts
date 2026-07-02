import { randomBytes } from 'crypto';
import { storage } from '../storage';
import { formatStoreOrderNumber } from './store-checkout-contact';
import { resolveStoreDeliveryDocuments } from './store-documents';
import { updateStoreOrder } from './store-storage';
import { sendStorePurchaseConfirmationEmail } from './email-service';
import type { CreatedStoreEnrollment } from './store-guest-checkout';

import type { StoreProductDelivery } from './store-product-fulfillment';

type StoreSnapshotPayload = {
  lines?: Array<{
    lineId: string;
    title: string;
    listingType: string;
    lineTotalCents?: number;
    quantity?: number;
    fulfillment?: string;
  }>;
  childAssignments?: Array<{
    lineId: string;
    childId: number;
    firstName: string;
    lastName: string;
  }>;
  parentName?: string;
  parentEmail?: string;
  accessToken?: string;
  productDelivery?: StoreProductDelivery | null;
};

type StoreOrderRow = {
  id: number;
  accessToken: string;
  totalCents: number;
  createdAt: Date | string;
  metadata?: Record<string, unknown> | null;
};

function appBaseUrl(): string {
  return (process.env.APP_URL || 'https://accounts.americanseekersacademy.com').replace(/\/$/, '');
}

function childNameForLine(
  lineId: string,
  childAssignments: StoreSnapshotPayload['childAssignments'],
): string | undefined {
  const row = childAssignments?.find((a) => a.lineId === lineId);
  if (!row) return undefined;
  return `${row.firstName} ${row.lastName}`.trim();
}

/** Ensures each delivery document has a share token so email links work without login. */
export async function ensureDeliveryDocumentShareTokens(
  documents: Array<{ id: number; shareToken?: string | null }>,
): Promise<Map<number, string>> {
  const tokens = new Map<number, string>();
  for (const doc of documents) {
    if (doc.shareToken) {
      tokens.set(doc.id, doc.shareToken);
      continue;
    }
    const token = randomBytes(24).toString('base64url');
    await storage.updateSchoolDocument(doc.id, { shareToken: token } as any);
    tokens.set(doc.id, token);
  }
  return tokens;
}

function documentDownloadUrl(shareToken: string): string {
  return `${appBaseUrl()}/api/schools/documents/public/${shareToken}/download`;
}

/**
 * Future: load delivery document buffers for SendGrid attachments when
 * STORE_CONFIRMATION_ATTACH_DOCUMENTS=true. Links are always included today.
 */
export async function buildStoreDeliveryEmailAttachments(
  _documents: Array<{ id: number; filePath: string; fileName: string; mimeType: string }>,
): Promise<Array<{ filename: string; content: Buffer; type: string }>> {
  if (process.env.STORE_CONFIRMATION_ATTACH_DOCUMENTS !== 'true') {
    return [];
  }
  // Attachment loading will read from object storage / legacy paths (SendGrid only).
  return [];
}

export async function sendStoreOrderConfirmationEmail(params: {
  schoolId: number;
  storeSlug: string;
  storeOrder: StoreOrderRow;
  snapshotPayload: StoreSnapshotPayload;
  parentEmail: string;
  parentName: string;
  paidEnrollments: CreatedStoreEnrollment[];
  waitlistEnrollments: CreatedStoreEnrollment[];
}): Promise<boolean> {
  const meta = (params.storeOrder.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.confirmationEmailSentAt === 'string' && meta.confirmationEmailSentAt.length > 0) {
    return true;
  }

  const payload = params.snapshotPayload;
  const lines = payload.lines ?? [];
  const programLines = lines.filter((l) => l.listingType !== 'product');
  const merchLines = lines.filter((l) => l.listingType === 'product');

  const rawDocs = await resolveStoreDeliveryDocuments(params.schoolId, programLines);
  const shareTokens = await ensureDeliveryDocumentShareTokens(rawDocs);
  const documents = rawDocs.map((d: { id: number; title: string; fileName: string }) => {
    const token = shareTokens.get(d.id);
    return {
      id: d.id,
      title: d.title,
      fileName: d.fileName,
      downloadUrl: token ? documentDownloadUrl(token) : undefined,
    };
  });

  const attachments = await buildStoreDeliveryEmailAttachments(rawDocs);

  const orderNumber = formatStoreOrderNumber(params.storeOrder.id, params.storeOrder.createdAt);
  const confirmationUrl = `${appBaseUrl()}/store/${params.storeSlug}/success?token=${params.storeOrder.accessToken}`;

  const paidLines = params.paidEnrollments.map((row) => ({
    title: row.line.title,
    childName: childNameForLine(row.line.lineId, payload.childAssignments),
    lineTotalCents: row.line.lineTotalCents ?? 0,
  }));

  const waitlistLines = params.waitlistEnrollments.map((row) => ({
    title: row.line.title,
    childName: childNameForLine(row.line.lineId, payload.childAssignments),
    waitlistPosition: row.waitlistPosition ?? null,
  }));

  const sent = await sendStorePurchaseConfirmationEmail({
    to: params.parentEmail,
    parentName: params.parentName,
    schoolId: params.schoolId,
    storeSlug: params.storeSlug,
    orderNumber,
    orderTotalCents: params.storeOrder.totalCents,
    confirmationUrl,
    paidLines,
    waitlistLines,
    merchLines: merchLines.map((l) => ({
      title: l.title,
      quantity: l.quantity,
      lineTotalCents: l.lineTotalCents ?? 0,
    })),
    productDelivery: payload.productDelivery ?? null,
    documents,
    attachments,
  });

  if (sent) {
    await updateStoreOrder(params.storeOrder.id, {
      metadata: {
        ...meta,
        confirmationEmailSentAt: new Date().toISOString(),
      },
    });
  }

  return sent;
}
