import { useQuery } from "@tanstack/react-query";

async function fetchDbUserId(): Promise<number | null> {
  const token = localStorage.getItem("supabase_token");
  if (!token) return null;

  const cached = sessionStorage.getItem("userId");
  if (cached) {
    const parsed = Number.parseInt(cached, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  const res = await fetch("/api/user/roles", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { userId?: number };
  return typeof json.userId === "number" && json.userId > 0 ? json.userId : null;
}

/** Numeric `users.id` for logged-in sharers (null for guests). */
export function useStoreSharerUserId(isAuthenticated: boolean): number | null {
  const { data } = useQuery({
    queryKey: ["/api/user/roles", "store-sharer"],
    queryFn: fetchDbUserId,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data ?? null;
}
