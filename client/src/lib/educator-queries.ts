import { queryClient, apiRequest } from "@/lib/queryClient";

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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function formatDateLocal(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatTimeLocal(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export async function createAndStartEducatorSession(classId: number): Promise<{ id: number }> {
  const now = new Date();
  const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const createResponse = await apiRequest("POST", "/api/educator/sessions", {
    classId,
    scheduledDate: formatDateLocal(now),
    scheduledStartTime: formatTimeLocal(now),
    scheduledEndTime: formatTimeLocal(endTime),
  });
  const createdSession: { id: number } = await createResponse.json();
  await apiRequest("POST", `/api/educator/sessions/${createdSession.id}/start`);
  return createdSession;
}
