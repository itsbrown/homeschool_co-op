# Google Drive service account (Week Planner)

The app cannot invent this key. Google Cloud issues it. Without it, **Connect folder** saves the URL and **Generate lesson** stays empty (reindex 503).

## Create the key (once)

1. Open [Google Cloud Console](https://console.cloud.google.com/) as `contact.americanseekersacademy@gmail.com`.
2. Top bar: pick or create a **project** (e.g. `asa-learning`). If it says “Select a project,” create one first.
3. Enable Drive (this is required — Connect shows 403 without it):
   [Enable Google Drive API for homeschool-platform-509218](https://console.cloud.google.com/apis/library/drive.googleapis.com?project=homeschool-platform-509218)
   Click **Enable**, wait about a minute.
4. Open **Service accounts** (not IAM, not Credentials):
   [console.cloud.google.com/iam-admin/serviceaccounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
5. **Create service account**. Name: `asa-drive-reader`. Skip roles. **Done**.
6. On the list, **click the email** (`asa-drive-reader@….iam.gserviceaccount.com`). Do not stay on the list, and do not open **APIs & Services → Credentials**.
7. Tabs across the top of that account: Details | Permissions | **Keys**.
8. **Keys → Add key → Create new key → JSON → Create**. The file downloads once.
9. In Drive, share each lesson folder **and each class newsletter folder** with that `client_email` (Viewer). Local key email: `asa-drive-reader@homeschool-platform-509218.iam.gserviceaccount.com`. Example AoA: `1O-YEumtCmpCNQVVFOO9_jOECaLjVSeEs`. Newsletter hub: `1dafHE0ybd9KslOZzPxwzE2DZAykgAg_s`.

If the list row has ⋮, **Manage keys** is the same Keys page. If Console says key creation is disabled by organization policy, say so — that is a Workspace admin block, not a missing menu.

## Install locally

```bash
node scripts/install-google-drive-service-account.mjs ~/Downloads/asa-drive-xxxxx.json
```

That writes `secrets/google-drive-service-account.json` (gitignored) and sets `GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE` in `.env`. Restart `npm run dev`.

Replit / Railway: paste the same JSON as one line into secret `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`.

Do not commit the key. Do not paste the private key into chat.
