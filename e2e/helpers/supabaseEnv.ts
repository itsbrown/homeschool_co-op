/** True when CI/nightly has a real Supabase test project (not Jest/Playwright placeholders). */
export function isRealSupabaseConfigured(): boolean {
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !serviceKey) {
    return false;
  }
  if (url.includes("127.0.0.1:54321") && serviceKey.includes("EGIM96RAZx")) {
    return false;
  }
  if (serviceKey.includes("placeholder") || serviceKey.startsWith("jest-")) {
    return false;
  }
  if (url === "https://example.supabase.co") {
    return false;
  }
  return serviceKey.length >= 32;
}
