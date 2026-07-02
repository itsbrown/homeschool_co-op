import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db';
import {
  children,
  programEnrollments,
  storeOrderItems,
  storeOrders,
  users,
} from '@shared/schema';
import { formatStoreOrderNumber } from './store-checkout-contact';
import {
  formatStoreProductDeliveryLabel,
  type StoreProductDelivery,
} from './store-product-fulfillment';

export type StoreSignupRow = {
  id: string;
  kind: 'program' | 'product';
  enrollmentId: number | null;
  storeOrderId: number | null;
  orderNumber: string | null;
  orderStatus: string | null;
  signedUpAt: string;
  programName: string;
  programType: 'class' | 'session' | 'product' | null;
  childName: string | null;
  childBirthdate: string | null;
  childGrade: string | null;
  parentName: string | null;
  parentEmail: string;
  parentPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  enrollmentStatus: string | null;
  waitlistPosition: number | null;
  totalCostCents: number;
  totalPaidCents: number;
  quantity: number | null;
  productFulfillmentMethod: string | null;
  shippingAddress: string | null;
};

function parentDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
} | null | undefined): string | null {
  if (!user) return null;
  const fromParts = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fromParts || user.name || null;
}

function emergencyDisplayName(user: {
  emergencyContactFirstName?: string | null;
  emergencyContactLastName?: string | null;
} | null | undefined): string | null {
  if (!user) return null;
  const name = [user.emergencyContactFirstName, user.emergencyContactLastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || null;
}

function programTypeForEnrollment(e: {
  sessionId?: number | null;
  marketplaceClassId?: number | null;
  classId?: number | null;
}): 'class' | 'session' | null {
  if (e.sessionId) return 'session';
  if (e.marketplaceClassId || e.classId) return 'class';
  return null;
}

export async function getPublicStoreSignups(schoolId: number): Promise<StoreSignupRow[]> {
  const db = await getDb();

  const enrollments = await db
    .select()
    .from(programEnrollments)
    .where(
      and(
        eq(programEnrollments.schoolId, schoolId),
        sql`${programEnrollments.metadata}->>'enrollmentSource' = 'public_store'`,
      ),
    )
    .orderBy(desc(programEnrollments.enrollmentDate));

  const parentIds = [...new Set(enrollments.map((e) => e.parentId))];
  const childIds = [...new Set(enrollments.map((e) => e.childId))];
  const storeOrderIds = [
    ...new Set(
      enrollments
        .map((e) => {
          const meta = (e.metadata ?? {}) as { storeOrderId?: number };
          return meta.storeOrderId ?? null;
        })
        .filter((id): id is number => typeof id === 'number'),
    ),
  ];

  const parentRows =
    parentIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, parentIds))
      : [];
  const childRows =
    childIds.length > 0
      ? await db.select().from(children).where(inArray(children.id, childIds))
      : [];
  const orderRows =
    storeOrderIds.length > 0
      ? await db.select().from(storeOrders).where(inArray(storeOrders.id, storeOrderIds))
      : [];

  const parentById = new Map(parentRows.map((p) => [p.id, p]));
  const childById = new Map(childRows.map((c) => [c.id, c]));
  const orderById = new Map(orderRows.map((o) => [o.id, o]));

  const programRows: StoreSignupRow[] = enrollments.map((e) => {
    const meta = (e.metadata ?? {}) as { storeOrderId?: number };
    const parent = parentById.get(e.parentId);
    const child = childById.get(e.childId);
    const order = meta.storeOrderId ? orderById.get(meta.storeOrderId) : undefined;

    return {
      id: `enrollment-${e.id}`,
      kind: 'program',
      enrollmentId: e.id,
      storeOrderId: meta.storeOrderId ?? order?.id ?? null,
      orderNumber: order ? formatStoreOrderNumber(order.id, order.createdAt) : null,
      orderStatus: order?.status ?? null,
      signedUpAt: new Date(e.enrollmentDate).toISOString(),
      programName: e.className,
      programType: programTypeForEnrollment(e),
      childName: e.childName,
      childBirthdate: child?.birthdate ? String(child.birthdate) : null,
      childGrade: child?.gradeLevel ?? null,
      parentName: parentDisplayName(parent),
      parentEmail: e.parentEmail,
      parentPhone: parent?.phone ?? null,
      emergencyContactName: emergencyDisplayName(parent),
      emergencyContactPhone: parent?.emergencyContactPhone ?? null,
      emergencyContactRelationship: parent?.emergencyContactRelationship ?? null,
      enrollmentStatus: e.status,
      waitlistPosition: e.waitlistPosition ?? null,
      totalCostCents: e.totalCost ?? 0,
      totalPaidCents: e.totalPaid ?? 0,
      quantity: null,
      productFulfillmentMethod: null,
      shippingAddress: null,
    };
  });

  const allOrders = await db
    .select()
    .from(storeOrders)
    .where(eq(storeOrders.schoolId, schoolId))
    .orderBy(desc(storeOrders.createdAt));

  const orderIdsForProducts = allOrders.map((o) => o.id);
  const productItems =
    orderIdsForProducts.length > 0
      ? await db
          .select()
          .from(storeOrderItems)
          .where(inArray(storeOrderItems.storeOrderId, orderIdsForProducts))
      : [];

  const orderByIdAll = new Map(allOrders.map((o) => [o.id, o]));
  const productRows: StoreSignupRow[] = productItems.map((item) => {
    const order = orderByIdAll.get(item.storeOrderId);
    const productDelivery = (order?.metadata as { productDelivery?: StoreProductDelivery } | null)
      ?.productDelivery;
    return {
      id: `product-${item.id}`,
      kind: 'product',
      enrollmentId: null,
      storeOrderId: item.storeOrderId,
      orderNumber: order ? formatStoreOrderNumber(order.id, order.createdAt) : null,
      orderStatus: order?.status ?? null,
      signedUpAt: order ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
      programName: item.name,
      programType: 'product',
      childName: null,
      childBirthdate: null,
      childGrade: null,
      parentName: order?.parentName ?? null,
      parentEmail: order?.parentEmail ?? '',
      parentPhone: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      emergencyContactRelationship: null,
      enrollmentStatus: null,
      waitlistPosition: null,
      totalCostCents: item.lineTotalCents,
      totalPaidCents: order?.status === 'paid' ? item.lineTotalCents : 0,
      quantity: item.quantity,
      productFulfillmentMethod: productDelivery?.method ?? null,
      shippingAddress:
        productDelivery?.method === 'shipping' && productDelivery.shippingAddress
          ? formatStoreProductDeliveryLabel(productDelivery)
          : productDelivery?.method === 'pickup'
            ? 'Pick up at campus'
            : null,
    };
  });

  const combined = [...programRows, ...productRows];
  combined.sort(
    (a, b) => new Date(b.signedUpAt).getTime() - new Date(a.signedUpAt).getTime(),
  );
  return combined;
}

function csvEscape(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export function buildStoreSignupsCsv(rows: StoreSignupRow[]): string {
  const headers = [
    'Signed up',
    'Type',
    'Program / product',
    'Child name',
    'Child date of birth',
    'Child grade',
    'Parent name',
    'Parent email',
    'Parent phone',
    'Emergency contact',
    'Emergency phone',
    'Emergency relationship',
    'Enrollment status',
    'Waitlist position',
    'Order number',
    'Order status',
    'Total (USD)',
    'Paid (USD)',
    'Quantity',
    'Fulfillment',
    'Shipping / pickup',
  ];

  const lines = rows.map((row) => {
    const signedUp = new Date(row.signedUpAt).toLocaleString('en-US');
    const type =
      row.kind === 'product'
        ? 'Product'
        : row.programType === 'session'
          ? 'Session'
          : 'Class';
    return [
      csvEscape(signedUp),
      csvEscape(type),
      csvEscape(row.programName),
      csvEscape(row.childName),
      csvEscape(row.childBirthdate),
      csvEscape(row.childGrade),
      csvEscape(row.parentName),
      csvEscape(row.parentEmail),
      csvEscape(row.parentPhone),
      csvEscape(row.emergencyContactName),
      csvEscape(row.emergencyContactPhone),
      csvEscape(row.emergencyContactRelationship),
      csvEscape(row.enrollmentStatus),
      csvEscape(row.waitlistPosition),
      csvEscape(row.orderNumber),
      csvEscape(row.orderStatus),
      csvEscape((row.totalCostCents / 100).toFixed(2)),
      csvEscape((row.totalPaidCents / 100).toFixed(2)),
      csvEscape(row.quantity),
      csvEscape(row.productFulfillmentMethod),
      csvEscape(row.shippingAddress),
    ].join(',');
  });

  return [headers.join(','), ...lines].join('\n');
}
