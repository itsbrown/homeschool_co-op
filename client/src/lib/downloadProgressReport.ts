export type DownloadReportParams = {
  childId: number;
  schoolYear: string;
  quarter: string;
  includeGuide?: boolean;
  snapshotId?: number;
  draft?: boolean;
};

export async function downloadProgressReportPdf(params: DownloadReportParams): Promise<void> {
  const qs = new URLSearchParams({
    format: 'pdf',
    template: 'ny-ihip-quarterly',
    schoolYear: params.schoolYear,
    quarter: params.quarter,
  });
  if (params.includeGuide) qs.set('includeGuide', 'true');
  if (params.snapshotId) qs.set('snapshotId', String(params.snapshotId));
  if (params.draft) qs.set('draft', 'true');

  const token = localStorage.getItem('supabase_token');
  const activeRole = localStorage.getItem('activeRole');
  const res = await fetch(`/api/progress/report/${params.childId}?${qs}`, {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(activeRole && { 'X-Active-Role': activeRole }),
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  const match = disposition?.match(/filename="([^"]+)"/);
  const filename = match?.[1] || `ASA-Quarterly-${params.quarter}.pdf`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
