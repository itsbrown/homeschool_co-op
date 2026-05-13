import { QueryClient } from "@tanstack/react-query";

const POST_PAYMENT_QUERY_KEYS: string[][] = [
  ["/api/parent/enrollments"],
  ["/api/enrollments"],
  ["billing-summary"],
  ["/api/billing/summary"],
  ["/api/parent/memberships"],
  ["/api/parent/member-id"],
  ["payment-history"],
  ["/api/payment-history/history"],
  ["/api/payment-history"],
  ["/api/stripe/payment-history"],
  ["/api/scheduled-payments/upcoming"],
  ["scheduled-payments-upcoming"],
  ["parent-credits"],
  ["parent-outstanding-cart-classes-total"],
  ["/api/parent/credits"],
];

/**
 * Refreshes all parent payment/membership surfaces after a successful payment.
 * This keeps dashboard, billing, cart, and membership widgets in sync.
 */
export async function refreshPostPaymentState(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    POST_PAYMENT_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  );

  // Force immediate reads of authoritative state where stale "Pay now" CTAs tend to linger.
  await Promise.all([
    queryClient.refetchQueries({ queryKey: ["/api/parent/enrollments"], type: "all" }),
    queryClient.refetchQueries({ queryKey: ["/api/enrollments"], type: "all" }),
    queryClient.refetchQueries({ queryKey: ["/api/parent/memberships"], type: "all" }),
    queryClient.refetchQueries({ queryKey: ["billing-summary"], type: "all" }),
    queryClient.refetchQueries({ queryKey: ["/api/stripe/payment-history"], type: "all" }),
    queryClient.refetchQueries({ queryKey: ["/api/scheduled-payments/upcoming"], type: "all" }),
    queryClient.refetchQueries({ queryKey: ["/api/parent/credits"], type: "all" }),
    queryClient.refetchQueries({ queryKey: ["parent-credits"], type: "all" }),
  ]);
}
