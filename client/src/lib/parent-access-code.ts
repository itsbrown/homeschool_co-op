/** Shared React Query key for `GET /api/parent/access-code`. */
export const PARENT_ACCESS_CODE_QUERY_KEY = ["/api/parent/access-code"] as const;

export type ParentAccessCodeResponse = {
  enabled: boolean;
  locationId: number | null;
  locationName: string | null;
  code: string | null;
};

export function shouldShowParentDoorCode(
  data: ParentAccessCodeResponse | undefined | null,
): boolean {
  return Boolean(data?.enabled && data.code);
}

export function formatDoorCodeLabel(locationName: string | null | undefined): string {
  const campus = locationName?.trim();
  return campus ? `${campus} door code` : "Door code";
}
