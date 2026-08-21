import { test, type APIResponse } from "@playwright/test";

export type SeedEnvelope<TData> = {
  success?: boolean;
  data?: TData;
  error?: string;
  details?: string;
};

/**
 * Playwright treats `test.skip` as a green run (exit 0). Seed/login specs are a
 * product gate: missing Postgres or Supabase must **fail**, unless the operator
 * explicitly sets `E2E_ALLOW_SKIP=1` (ignored in CI).
 *
 * Env: `.env` (Railway dev-clone DATABASE_URL) + `.env.e2e`. Never `.env.prod`.
 */
export function e2eAllowSkip(): boolean {
  return process.env.E2E_ALLOW_SKIP === "1" && process.env.CI !== "true";
}

function failOrSkip(message: string): never {
  if (e2eAllowSkip()) {
    test.skip(true, message);
  }
  throw new Error(message);
}

export function requireLinkedSeed<TData>(
  response: APIResponse,
  json: SeedEnvelope<TData> | null,
  options?: {
    /** Defaults to `data.supabaseLinked === true` when that field exists. */
    linked?: boolean;
    need?: string;
  },
): TData {
  if (!response.ok()) {
    failOrSkip(
      `seed failed (${response.status()}): ${json?.error ?? json?.details ?? "see server logs"}`,
    );
  }
  if (!json?.success || json.data == null) {
    failOrSkip(json?.error ?? json?.details ?? "seed returned no data");
  }

  const data = json.data as TData & { supabaseLinked?: boolean };
  const linked = options?.linked ?? data.supabaseLinked;
  if (linked !== true) {
    failOrSkip(
      `${options?.need ?? "Supabase"} was not linked. Use .env (Railway clone DATABASE_URL) + .env.e2e. ` +
        "Worktrees: symlink those files from the main checkout. " +
        "A skipped Playwright spec is not a pass (set E2E_ALLOW_SKIP=1 only for a laptop without keys).",
    );
  }

  return json.data;
}
