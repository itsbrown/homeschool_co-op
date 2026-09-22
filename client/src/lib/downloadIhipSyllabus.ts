export async function downloadIhipSyllabusPdf(childId: number): Promise<void> {
  const token = localStorage.getItem("supabase_token");
  const activeRole = localStorage.getItem("activeRole");
  const res = await fetch(`/api/progress/syllabus/${childId}?format=pdf`, {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(activeRole && { "X-Active-Role": activeRole }),
    },
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  const match = disposition?.match(/filename="([^"]+)"/);
  const filename = match?.[1] || `IHIP-Syllabus-${childId}.pdf`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
