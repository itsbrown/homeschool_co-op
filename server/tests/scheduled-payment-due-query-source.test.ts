import { describe, expect, it, jest } from "@jest/globals";
import {
  AUTOPAY_MAX_RETRY_ATTEMPTS,
  buildDueAutoPayQueryCriteria,
  getDueAutoPayCandidates,
} from "../services/autopay-policy";

describe("scheduled payment due-query source", () => {
  it("uses repository query criteria as due-payment source of truth", async () => {
    const queryDueScheduledPayments = jest.fn(async () => [
      { id: 101, status: "pending", retryCount: 0, dueDate: "2026-05-08T00:00:00.000Z" },
    ]);

    const repo = { queryDueScheduledPayments };
    const now = new Date("2026-05-08T13:00:00.000Z");
    const result = await getDueAutoPayCandidates(repo, now);

    expect(result).toHaveLength(1);
    expect(queryDueScheduledPayments).toHaveBeenCalledTimes(1);
    expect(queryDueScheduledPayments).toHaveBeenCalledWith(buildDueAutoPayQueryCriteria(now));
  });

  it("passes retry cap in query criteria (no in-memory due filtering contract)", async () => {
    const queryDueScheduledPayments = jest.fn(async () => []);
    const repo = { queryDueScheduledPayments };

    await getDueAutoPayCandidates(repo, new Date("2026-05-08T13:00:00.000Z"));

    const criteria = queryDueScheduledPayments.mock.calls[0][0];
    expect(criteria.retryCountLessThan).toBe(AUTOPAY_MAX_RETRY_ATTEMPTS);
    expect(criteria.statuses).toEqual(["pending", "overdue"]);
  });
});
