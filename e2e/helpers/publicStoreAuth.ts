import { expect, type Page } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { postSetupPublicStoreScenario } from "./testSeed";
import { waitForSupabaseToken } from "./parentCheckoutHelpers";

export type StoreAuthSeed = {
  slug: string;
  parent: { email: string; password: string };
  child?: { firstName: string; lastName: string };
  classListingId?: number;
  itemSlug?: string;
};

/** Seed a public store with a Supabase-linked parent at the same school. */
export async function seedPublicStoreWithLinkedParent(
  request: APIRequestContext,
  options: Record<string, unknown> = {},
): Promise<{ ok: true; seed: StoreAuthSeed } | { ok: false; reason: string }> {
  const { response, json } = await postSetupPublicStoreScenario(request, {
    withParent: true,
    linkSupabaseAuthParent: true,
    ...options,
  });
  if (!response.ok()) {
    return { ok: false, reason: `seed failed (${response.status()})` };
  }
  if (json?.data?.parentSupabaseLinked !== true || !json.data.parent) {
    return { ok: false, reason: "parent Supabase link unavailable" };
  }

  const slug = json.data.storeSlug;
  let itemSlug: string | undefined;
  const listingId = json.data.class?.listingId;
  if (listingId) {
    const itemRes = await request.get(`/api/public/store/${slug}/catalog/${listingId}`);
    if (itemRes.ok()) {
      const body = (await itemRes.json()) as { item: { slug: string } };
      itemSlug = body.item.slug;
    }
  }

  return {
    ok: true,
    seed: {
      slug,
      parent: json.data.parent,
      child: json.data.child,
      classListingId: listingId ?? undefined,
      itemSlug,
    },
  };
}

export function storePathRegex(path: string): RegExp {
  return new RegExp(`${path.replace(/\//g, "\\/")}(\\?|$)`);
}

export async function completeStoreLoginForm(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await expect(page).toHaveURL(/\/login(\?|$)/);
  const returnTo = new URL(page.url()).searchParams.get("returnTo");
  expect(returnTo, "login link should include returnTo").toBeTruthy();
  expect(returnTo!.startsWith("/store/")).toBeTruthy();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await waitForSupabaseToken(page);
}

export async function expectRedirectAfterStoreLogin(
  page: Page,
  expectedPath: string,
): Promise<void> {
  await expect(page).toHaveURL(storePathRegex(expectedPath), { timeout: 45_000 });
}

export async function loginFromStoreHeader(
  page: Page,
  returnPath: string,
  email: string,
  password: string,
): Promise<void> {
  await page.getByTestId("store-header-sign-in").click();
  await completeStoreLoginForm(page, email, password);
  await expectRedirectAfterStoreLogin(page, returnPath);
}

export async function loginFromStoreCheckoutContact(
  page: Page,
  checkoutPath: string,
  email: string,
  password: string,
): Promise<void> {
  await page.getByTestId("store-checkout-sign-in").click();
  await completeStoreLoginForm(page, email, password);
  await expectRedirectAfterStoreLogin(page, checkoutPath);
}

export async function loginFromStoreCheckoutChildrenStep(
  page: Page,
  checkoutPath: string,
  email: string,
  password: string,
): Promise<void> {
  await page.getByTestId("store-checkout-sign-in-children").click();
  await completeStoreLoginForm(page, email, password);
  await expectRedirectAfterStoreLogin(page, checkoutPath);
}

export async function expectStoreCartLineCount(page: Page, expectedLines: number): Promise<void> {
  const count = await page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem("public_store_cart_v1");
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as { lines?: unknown[] };
      return parsed.lines?.length ?? 0;
    } catch {
      return 0;
    }
  });
  expect(count).toBe(expectedLines);
}

export async function expectAuthReturnToStored(page: Page, expectedPath: string): Promise<void> {
  const stored = await page.evaluate(() => sessionStorage.getItem("auth_return_to"));
  expect(stored).toBe(expectedPath);
}
