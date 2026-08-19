import { queryClient } from "@/lib/queryClient";

const EDUCATOR_SESSION_QUERY_KEYS = [
  ["/api/educator/dashboard"],
  ["/api/educator/active-session"],
  ["/api/educator/my-classes"],
  ["/api/educator/my-hours"],
  ["/api/educator/sessions"],
] as const;

/** Invalidate live educator session surfaces after start / end / mark. */
export function invalidateEducatorSessionQueries() {
  for (const queryKey of EDUCATOR_SESSION_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}
