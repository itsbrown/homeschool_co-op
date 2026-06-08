import { QueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { refreshPostPaymentState } from "@/lib/postPaymentRefresh";

export type FinalizePaymentAfterStripeSuccessOptions = {
  paymentIntentId: string;
  enrollmentIds?: number[];
};

/**
 * Client-side fulfillment fallback when Stripe webhooks are delayed or unavailable.
 * Payment already succeeded at Stripe — errors are logged but do not block success UX.
 */
export async function finalizePaymentAfterStripeSuccess(
  queryClient: QueryClient,
  options: FinalizePaymentAfterStripeSuccessOptions,
): Promise<void> {
  const { paymentIntentId, enrollmentIds } = options;

  try {
    const body: { paymentIntentId: string; enrollmentIds?: number[] } = {
      paymentIntentId,
    };
    if (enrollmentIds && enrollmentIds.length > 0) {
      body.enrollmentIds = enrollmentIds;
    }

    const fulfillResponse = await apiRequest("POST", "/api/billing/fulfill-payment-intent", body);
    if (!fulfillResponse.ok) {
      const payload = await fulfillResponse.json().catch(() => ({}));
      console.warn("Payment fulfillment fallback failed:", payload);
    }
  } catch (fulfillErr) {
    console.warn("Payment fulfillment fallback error:", fulfillErr);
  }

  await refreshPostPaymentState(queryClient);
}
