import type { InsertPayment } from '@shared/schema';

/** Map admin-entered method labels to `payments.payment_method` enum values. */
export function mapManualPaymentMethodToLedger(
  method: string | undefined,
): 'stripe' | 'cash' | 'check' | 'bank_transfer' | 'other' {
  switch ((method ?? 'manual').trim().toLowerCase()) {
    case 'cash':
      return 'cash';
    case 'check':
      return 'check';
    case 'bank_transfer':
    case 'bank transfer':
      return 'bank_transfer';
    case 'stripe':
      return 'stripe';
    default:
      return 'other';
  }
}

/** Build a legacy `payments` row for admin UI / parent profile (Postgres-backed). */
export function buildManualLegacyPaymentRow(input: {
  stripePaymentIntentId: string;
  parentEmail: string;
  parentId: number;
  schoolId: number;
  childName: string;
  className: string;
  amountCents: number;
  currency: string;
  description: string;
  paymentMethod: string;
  enrollmentIds: number[];
  paymentDate: Date;
  adminEmail: string;
  notes?: string;
}): InsertPayment {
  return {
    stripePaymentIntentId: input.stripePaymentIntentId,
    parentEmail: input.parentEmail,
    parentId: input.parentId,
    childName: input.childName,
    className: input.className,
    amount: input.amountCents,
    currency: input.currency,
    status: 'completed',
    description: input.description,
    schoolId: input.schoolId,
    stripeChargeId: null,
    stripeRefundId: null,
    enrollmentIds: input.enrollmentIds,
    originalPaymentId: null,
    paymentMethod: mapManualPaymentMethodToLedger(input.paymentMethod),
    paymentDate: input.paymentDate,
    metadata: {
      paymentMethod: input.paymentMethod,
      createdBy: input.adminEmail,
      createdByRole: 'schoolAdmin',
      isManualPayment: true,
      notes: input.notes ?? '',
      originalPaymentDate: input.paymentDate.toISOString(),
    },
  };
}

/** True when a stripe_payment_history row is an admin manual entry not mirrored in `payments`. */
export function isManualStripeLedgerRow(row: {
  paymentIntentId: string;
  source?: string | null;
}): boolean {
  if (row.paymentIntentId.startsWith('manual_')) {
    return true;
  }
  return row.source === 'manual';
}
