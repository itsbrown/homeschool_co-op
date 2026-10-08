import crypto from "crypto";

/** Password column placeholder that is not a shared secret from source control. */
export function unpublishedPassword(): string {
  return `unusable.${crypto.randomBytes(24).toString("base64url")}`;
}
