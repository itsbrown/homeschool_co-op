import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  explainDriveListFailure,
  isDriveConfigured,
  parseServiceAccountJson,
  readDriveServiceAccountJson,
} from "../../lib/google-drive-curriculum";

const FILE = "GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE";
const JSON_ENV = "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON";
const APP_CREDS = "GOOGLE_APPLICATION_CREDENTIALS";

describe("google-drive-curriculum service account", () => {
  const prev = {
    file: process.env[FILE],
    json: process.env[JSON_ENV],
    app: process.env[APP_CREDS],
  };

  afterEach(() => {
    if (prev.file === undefined) delete process.env[FILE];
    else process.env[FILE] = prev.file;
    if (prev.json === undefined) delete process.env[JSON_ENV];
    else process.env[JSON_ENV] = prev.json;
    if (prev.app === undefined) delete process.env[APP_CREDS];
    else process.env[APP_CREDS] = prev.app;
  });

  it("is not configured when env and file are missing", () => {
    delete process.env[FILE];
    delete process.env[JSON_ENV];
    delete process.env[APP_CREDS];
    expect(isDriveConfigured()).toBe(false);
    expect(readDriveServiceAccountJson()).toBeNull();
  });

  it("prefers inline JSON over a file", () => {
    process.env[JSON_ENV] = '{"type":"service_account","client_email":"a@b","private_key":"k"}';
    process.env[FILE] = "/no/such/file.json";
    expect(isDriveConfigured()).toBe(true);
    expect(readDriveServiceAccountJson()).toContain("a@b");
  });

  it("reads a key file from GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE", () => {
    delete process.env[JSON_ENV];
    const dir = mkdtempSync(join(tmpdir(), "asa-drive-"));
    const path = join(dir, "key.json");
    writeFileSync(path, JSON.stringify({ type: "service_account", client_email: "sa@x", private_key: "pk" }));
    process.env[FILE] = path;
    expect(isDriveConfigured()).toBe(true);
    const creds = parseServiceAccountJson(readDriveServiceAccountJson()!);
    expect(creds.client_email).toBe("sa@x");
  });

  it("explains a disabled Drive API 403", () => {
    delete process.env[FILE];
    delete process.env[JSON_ENV];
    delete process.env[APP_CREDS];
    const message = explainDriveListFailure(
      403,
      '{"error":{"message":"Google Drive API has not been used in project 1","status":"PERMISSION_DENIED","details":[{"reason":"SERVICE_DISABLED"}]}}',
    );
    expect(message).toMatch(/Turn on the Google Drive API/);
  });
});
