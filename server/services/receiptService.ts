import { storage } from '../storage';
import { InsertPaymentReceipt } from '@shared/schema';

function generateReceiptNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `RCP-${timestamp}-${random}`;
}

export async function createPaymentReceiptRecord(params: {
  schoolId: number;
  parentUserId: number;
  paymentId?: number;
  enrollmentId?: number;
  amount: number;
  description: string;
  stripePaymentIntentId?: string;
}): Promise<void> {
  try {
    const receiptNumber = generateReceiptNumber();
    
    const receiptData: InsertPaymentReceipt = {
      receiptNumber,
      schoolId: params.schoolId,
      parentUserId: params.parentUserId,
      paymentId: params.paymentId || null,
      enrollmentId: params.enrollmentId || null,
      amount: params.amount,
      description: params.description,
      receiptDate: new Date(),
      filePath: null,
      status: 'generated'
    };

    await storage.createPaymentReceipt(receiptData);
    console.log(`🧾 Payment receipt created: ${receiptNumber} for $${(params.amount / 100).toFixed(2)}`);
  } catch (error) {
    console.error('❌ Error creating payment receipt record:', error);
  }
}

export async function createReceiptFromPayment(payment: {
  schoolId: number;
  parentId?: number;
  parentEmail: string;
  amount: number;
  description?: string;
  childName?: string;
  className?: string;
  enrollmentIds?: number[];
}): Promise<void> {
  try {
    if (!payment.parentId) {
      const user = await storage.getUserByEmail(payment.parentEmail);
      if (!user) {
        console.log('⚠️ Cannot create receipt: parent user not found');
        return;
      }
      payment.parentId = user.id;
    }

    const description = payment.description || 
      `Payment for ${payment.childName || 'enrollment'}${payment.className ? ` - ${payment.className}` : ''}`;

    const enrollmentId = payment.enrollmentIds && payment.enrollmentIds.length > 0 
      ? payment.enrollmentIds[0] 
      : undefined;

    await createPaymentReceiptRecord({
      schoolId: payment.schoolId,
      parentUserId: payment.parentId,
      enrollmentId,
      amount: payment.amount,
      description
    });
  } catch (error) {
    console.error('❌ Error creating receipt from payment:', error);
  }
}
