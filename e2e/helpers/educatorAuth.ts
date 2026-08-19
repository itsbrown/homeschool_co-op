import {
  dismissStaffGuideIfVisible,
  loginParent,
  preventStaffGuideModal,
} from "./parentCheckoutHelpers";
import type { Page } from "@playwright/test";

export async function loginEducatorFromSeed(page: Page, email: string, password: string) {
  await preventStaffGuideModal(page);
  await loginParent(page, email, password);
  await dismissStaffGuideIfVisible(page);
}

export function educatorSupabaseLinked(data: {
  educatorSupabaseLinked?: boolean;
  supabaseLinked?: boolean;
}): boolean {
  return data.educatorSupabaseLinked === true || data.supabaseLinked === true;
}
