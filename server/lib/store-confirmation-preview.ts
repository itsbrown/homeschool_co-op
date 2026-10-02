const previews = new Map<string, string>();

/** Last store confirmation text for a recipient. Used by the test email-log route. */
export function rememberStoreConfirmationPreview(email: string, text: string): void {
  previews.set(email.trim().toLowerCase(), text);
}

export function readStoreConfirmationPreview(email: string): string | null {
  return previews.get(email.trim().toLowerCase()) ?? null;
}
