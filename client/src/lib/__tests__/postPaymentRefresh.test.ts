import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { QueryClient } from "@tanstack/react-query";
import { refreshPostPaymentState } from "../postPaymentRefresh";

describe("refreshPostPaymentState (P1-A-13)", () => {
  let queryClient: QueryClient;
  let invalidateSpy: jest.SpiedFunction<QueryClient["invalidateQueries"]>;
  let refetchSpy: jest.SpiedFunction<QueryClient["refetchQueries"]>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    invalidateSpy = jest.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    refetchSpy = jest.spyOn(queryClient, "refetchQueries").mockResolvedValue();
  });

  it("invalidates all parent payment and membership query keys", async () => {
    await refreshPostPaymentState(queryClient);

    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        ["/api/parent/enrollments"],
        ["/api/enrollments"],
        ["billing-summary"],
        ["/api/billing/summary"],
        ["/api/parent/memberships"],
        ["/api/parent/member-id"],
        ["payment-history"],
        ["/api/payment-history/history"],
        ["/api/payment-history"],
      ]),
    );
    expect(invalidateSpy).toHaveBeenCalledTimes(9);
  });

  it("refetches high-churn surfaces that drive Pay now / owed UI", async () => {
    await refreshPostPaymentState(queryClient);

    const keys = refetchSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        ["/api/parent/enrollments"],
        ["/api/enrollments"],
        ["/api/parent/memberships"],
        ["billing-summary"],
        ["/api/billing/summary"],
      ]),
    );
    expect(refetchSpy).toHaveBeenCalledTimes(5);
  });
});
