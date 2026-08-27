export type SessionClosedNotice = {
  sessionId: number;
  name: string;
  message: string;
};

export type OpenSessionsResponse<TSession = unknown> = {
  sessions: TSession[];
  closedNotices: SessionClosedNotice[];
  membersOnlyNotices: SessionClosedNotice[];
};

/**
 * Normalize GET /api/admin/sessions/open — object shape (preferred) or legacy array.
 */
export function parseOpenSessionsResponse<TSession = unknown>(
  data: unknown,
): OpenSessionsResponse<TSession> {
  if (Array.isArray(data)) {
    return { sessions: data as TSession[], closedNotices: [], membersOnlyNotices: [] };
  }
  if (data && typeof data === "object") {
    const obj = data as {
      sessions?: unknown;
      closedNotices?: unknown;
      membersOnlyNotices?: unknown;
    };
    return {
      sessions: Array.isArray(obj.sessions) ? (obj.sessions as TSession[]) : [],
      closedNotices: Array.isArray(obj.closedNotices)
        ? (obj.closedNotices as SessionClosedNotice[])
        : [],
      membersOnlyNotices: Array.isArray(obj.membersOnlyNotices)
        ? (obj.membersOnlyNotices as SessionClosedNotice[])
        : [],
    };
  }
  return { sessions: [], closedNotices: [], membersOnlyNotices: [] };
}
