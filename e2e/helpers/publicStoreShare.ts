import { expect, type Page } from "@playwright/test";

/** Capture clipboard.writeText for share-button tests (no native share sheet in CI). */
export async function installShareClipboardCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __storeShareClipboard?: string }).__storeShareClipboard = "";
    const clip = navigator.clipboard;
    if (!clip) return;
    clip.writeText = async (text: string) => {
      (window as unknown as { __storeShareClipboard?: string }).__storeShareClipboard = text;
    };
  });
}

export async function readShareClipboard(page: Page): Promise<string> {
  return page.evaluate(
    () => (window as unknown as { __storeShareClipboard?: string }).__storeShareClipboard ?? "",
  );
}

export async function readStoreShareReferralUserId(
  page: Page,
  storeSlug: string,
): Promise<number | null> {
  return page.evaluate((slug) => {
    try {
      const raw = sessionStorage.getItem("store_share_referrals_v1");
      if (!raw) return null;
      const map = JSON.parse(raw) as Record<string, { userId?: number }>;
      const userId = map[slug]?.userId;
      return typeof userId === "number" && userId > 0 ? userId : null;
    } catch {
      return null;
    }
  }, storeSlug);
}

export async function expectShareClipboardContainsItem(
  page: Page,
  options: {
    title: string;
    slug: string;
    storeSlug: string;
    sharerUserId?: number | null;
    descriptionSnippet?: string;
  },
): Promise<void> {
  const text = await readShareClipboard(page);
  expect(text).toContain(options.title);
  expect(text).toContain(`/store/${options.storeSlug}/${options.slug}`);
  if (options.descriptionSnippet) {
    expect(text).toContain(options.descriptionSnippet);
  }
  if (options.sharerUserId != null) {
    expect(text).toContain(`userId=${options.sharerUserId}`);
  } else {
    expect(text).not.toMatch(/userId=\d+/);
  }
}

export async function waitForSessionUserId(page: Page, expectedId: number): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => sessionStorage.getItem("userId")))
    .toBe(String(expectedId));
}
