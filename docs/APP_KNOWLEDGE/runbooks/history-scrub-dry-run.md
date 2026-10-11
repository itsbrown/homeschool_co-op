# History scrub dry run

Measured 2026-10-11. **No push.** The GitHub remote was not updated, no branch was deleted, and nothing was force-pushed.

This file is the path-and-count record for a later history rewrite. It does not contain file contents.

## What was run

1. `git clone --mirror` of `https://github.com/itsbrown/homeschool_co-op.git` into a local directory.
2. `git filter-repo --dry-run --invert-paths --paths-from-file purge-paths.txt --force` on a second local mirror made with `git clone --mirror --local` from that clone. `--dry-run` parsed every commit and did not import the result. The fast-export comparison files were deleted; they are not in this repo.
3. The same `git filter-repo` command **without** `--dry-run` on that throwaway mirror only, because `--dry-run` does not prune empty commits and cannot show whether a branch ref disappears. `git filter-repo` removed the throwaway's `origin` remote. That remote pointed at the local mirror path, not at GitHub.

`--sensitive-data-removal` was not used, so filter-repo did not fetch from GitHub.

## Counts

| Item | Count |
| --- | --- |
| Commits parsed by `--dry-run` | 6527 |
| Commits that touch at least one path below | 402 |
| Commits after the throwaway rewrite | 6455 |
| Empty commits pruned by that rewrite | 72 |
| Branch tips (`refs/heads`) | 138, every tip SHA changed |
| Pull refs (`refs/pull`) | 170, every tip SHA changed |
| Tags | 0 |
| Refs deleted by the rewrite | 0 |

## `docs/fall-2026-class-rosters` is not deleted by the path purge

On the original mirror that branch has **24** commits that are not in `main`. Those commits only touch:

- `docs/audit/fall-2026-class-rosters.csv` (23 commits)
- `docs/audit/fall-2026-class-rosters-transitions.csv` (8 commits)
- `docs/audit/fall-2026-class-rosters-summary.md` (1 commit)

After the throwaway purge, **1** commit remains on the branch. It only adds `docs/audit/fall-2026-class-rosters-summary.md` (1702 bytes, 29 lines, 0 email-shaped tokens, not on `main`). The ref still exists.

These refs also still exist. After the purge they have **0** commits that are not in `main`:

- `docs/fall-2026-full-day-students-csv`
- `docs/fall-2026-parents-enrolled-cart`

`docs/fix-fall-2026-roster-headcount` (open PR #116) still has 1 unique commit after the purge. Rebase that branch. Do not delete it as part of the roster-ref cleanup.

filter-repo prints `git branch -d` for **every** local branch, including `main`, when the repo is a mirror (`refs/heads` rather than `refs/remotes`). That list is not a deletion plan. Do not run it.

The real run has to delete the three roster-publishing refs itself. This dry run did not.

## Paths to purge

61 paths. Bytes and row counts are from `main` when the file is on `main`. "Rows" is data rows for CSV (lines minus header), array or object length for JSON, and line count for text. PDF row count is not applicable. "Tree" is who removes the file from the current tree: this PR, or open PR #149. History still contains every path until the rewrite below is pushed.

| Path | Bytes | Rows | First commit | Tree |
| --- | --- | --- | --- | --- |
| `attached_assets/Lexile_Levels_-_Sheet1_1774785240076.csv` | 6222 | 56 | `4b699f2c015e68bb137eee709bfd0edfce5edceb` | 149 |
| `attached_assets/Pasted--Created-database-enrollments-with-IDs-37-Creating-Stripe-payment-plan-parentEmail-c-1762341274052_1762341274053.txt` | 2107 | 34 | `0e9ddcbf1166b5a0bcf8a0d5890056f9a213dc06` | this PR |
| `attached_assets/Pasted--Created-database-enrollments-with-IDs-37-Creating-Stripe-payment-plan-parentEmail-c-1762341281584_1762341281584.txt` | 2107 | 34 | `0e9ddcbf1166b5a0bcf8a0d5890056f9a213dc06` | this PR |
| `attached_assets/Pasted--Is-authenticated-false-Current-cart-items-before-API-call-0-No-user-email-available-for-cart-1757094357310_1757094357310.txt` | 3465 | 39 | `aa169eb33967786e61e2c67b6cc0f3bc206d1210` | this PR |
| `attached_assets/Pasted--id-168-email-yates-stephaniej-gmail-com-name-Stephanie_1766437711637.txt` | 16609 | 469 | `5ac5ae59248c81e17fadcff6ceb53decc73dc4b4` | 149 |
| `attached_assets/brevo-contacts.csv` | 120764 | 713 | `f024dad3edd0da1528cbb2c92d5b2d07e5705a23` | 149 |
| `attached_assets/drizzle-data-2025-12-09T16_59_46.902Z_1765299601312.csv` | 181 | 2 | `a2b684ede23676a21ec507178f53d42e1b35ebb2` | 149 |
| `attached_assets/parent_Sep2_1756811710802.csv` | 19105 | 62 | `ad804c46990174d51cdde6477facce8d729b5a41` | 149 |
| `attached_assets/unified_payments (2)_1756056903964.csv` | 5618 | 23 | `f9aea2cdb22c562863fb8f90b4b3236b4a3c27a4` | 149 |
| `attached_assets/users_1761901101012.csv` | 1690 | 6 | `e582bf425e999d8fc88c52b6aa7209c0d4efb81d` | 149 |
| `attached_assets/users_1761901247719.csv` | 1690 | 6 | `e582bf425e999d8fc88c52b6aa7209c0d4efb81d` | 149 |
| `attached_assets/users_1761901434134.csv` | 1690 | 6 | `0e150b4a91614f5cbc605ed7f2557f886c5e9fe8` | 149 |
| `attached_assets/users_1761901890907.csv` | 1690 | 6 | `53c60fc4b702489f6b22ce5eb42be39281934285` | 149 |
| `backups/scheduled_payments_2026-01-20T06-25-56.json` | 62659 | 76 | `53986624fd856d6525584455cefa4ed25c666c52` | 149 |
| `cookies.txt` | 269 | 5 | `33e9938fed12fe0beb9a5138f031d03bb04aa782` | this PR |
| `create-supabase-auth-account.js` | 2918 | 89 | `2fc6e2ee1ac90243c1f278e4005e2fc9deead736` | 149 |
| `data/archive_legacy_json/enrollments.json` | 21993 | 57 | `2fc6e2ee1ac90243c1f278e4005e2fc9deead736` | 149 |
| `data/archive_legacy_json/enrollments_backup_1757021496.json` | 2420 | 8 | `2fc6e2ee1ac90243c1f278e4005e2fc9deead736` | 149 |
| `data/archive_legacy_json/enrollments_debug_1757021649.json` | 2420 | 8 | `2fc6e2ee1ac90243c1f278e4005e2fc9deead736` | 149 |
| `data/archive_legacy_json/payment-history.json` | 12865 | 29 | `2fc6e2ee1ac90243c1f278e4005e2fc9deead736` | 149 |
| `data/archive_legacy_json/scheduled-payments.json` | 2 | 0 | `2fc6e2ee1ac90243c1f278e4005e2fc9deead736` | 149 |
| `data/children.json` | 327 | 1 | `98eabc0844933bdc0a2d3216b5546f8ed2f6d9c4` | 149 |
| `data/children.json.backup.1756881292013` | 38884 | 72 | `39eb84c8b06fdec179a51ed4681f8a912f7c6525` | 149 |
| `data/daily-flow-entries.json` | 4338 | 5 | `11bfd0071257491a6ab9d57ec04cb4d42dfbc572` | 149 |
| `data/daily-flow-templates.json` | 396 | 1 | `11bfd0071257491a6ab9d57ec04cb4d42dfbc572` | 149 |
| `data/discounts.json` | 1631 | 2 | `39eb84c8b06fdec179a51ed4681f8a912f7c6525` | 149 |
| `data/enrollments.json` | 300 | 1 | `afa00e8b2e7b19e612dc1f33a98ad5c00a5afbd2` | 149 |
| `data/knowledge-bases.json` | 7187 | 6 | `c0daee39507f4cc34ef1427dd413477986d4bf18` | 149 |
| `data/notification-recipients.json` | 30727 | 151 | `7a49cf0b1e986f7c728b1767db977f56edbd6a72` | 149 |
| `data/notifications.json` | 2324 | 4 | `7a49cf0b1e986f7c728b1767db977f56edbd6a72` | 149 |
| `data/password-reset-tokens.json` | 2 | 0 | `afdf659e6c0d6de11c497db92bd8dbd9794396f4` | 149 |
| `data/payment-history.json` | 733 | 1 | `3992e4385f12af38d9b389ed8733da417f2c656e` | 149 |
| `data/scheduled-payments.json` | 25892 | 52 | `c4987df9d30c3f0282036f93580750b8b90e54d8` | 149 |
| `data/school-data.json` | 456 | 17 | `bf001aec57375addd6e2d12b5862e5e75882d61e` | 149 |
| `data/school-students.json` | 6370 | 19 | `cc21affae27735506caac73451576b73b0c38bb1` | 149 |
| `data/school-students.json.backup` | 7171 | 22 | `ad3e8b65286d7bdcaf88cf85ede332c062400c20` | 149 |
| `data/schools.json` | 775 | 1 | `4cf3063a6f8ada94f74a5ac7ea6e6d92656c67eb` | 149 |
| `data/staff-positions.json` | 946 | 8 | `c5aa72682a6c78f2cbfc25eacbc5bea86c49cc03` | 149 |
| `data/staff.json` | 4240 | 9 | `b6efff014c6d5adc31396085bef5211c93f2892f` | 149 |
| `data/user-profiles.json` | 247 | 1 | `49746cd6d78322c7ea5025452edad7fbfb95ed00` | 149 |
| `db_push_output.txt` | 1272 | 23 | `1804b76344776ddcc0073cc7483a00fa3f646f5b` | 149 |
| `docs/audit/fall-2026-class-rosters-transitions.csv` | 111 | 0 | `b580dadaa7e05296523e57f8ab6bce190d0ae804` | 149 |
| `docs/audit/fall-2026-class-rosters.csv` | 17244 | 92 | `10d1a0789dd7b82ba89b070f1766dcaa3c99fd45` | 149 |
| `docs/audit/fall-2026-full-day-students.csv` | 12608 | 54 | `857f2a9a269f48d7e50e5a44a427a3dbb6bdf19d` | 149 |
| `docs/audit/fall-2026-parents-enrolled-and-cart.csv` | 16889 | 63 | `c4a9d61d1ac003c747e6a6315f2af8665b2e654e` | 149 |
| `docs/audit/grace-mulcahy-payment-receipt-summary.json` | 2498 | 1 | `ddc18a91d2360a131ee58d56f4a06aee85a54be3` | 149 |
| `docs/audit/grace-mulcahy-spring-refund-summary.json` | 977 | 1 | `ddc18a91d2360a131ee58d56f4a06aee85a54be3` | 149 |
| `docs/audit/heather-jacks-pi.json` | 812 | 9 | `7cd4be46238c968b58a372b2ef23021d49d1ad33` | 149 |
| `docs/audit/nina-resser-spring-rebalance.json` | 747 | 1 | `ddc18a91d2360a131ee58d56f4a06aee85a54be3` | 149 |
| `docs/audit/spring-pay-reminder-denise-parga.json` | 727 | 1 | `ddc18a91d2360a131ee58d56f4a06aee85a54be3` | 149 |
| `docs/audit/spring-pay-reminder-domenico-danesi.json` | 657 | 1 | `ddc18a91d2360a131ee58d56f4a06aee85a54be3` | 149 |
| `docs/audit/spring-pay-reminder-grace-mulcahy.json` | 650 | 1 | `ddc18a91d2360a131ee58d56f4a06aee85a54be3` | 149 |
| `docs/audit/spring-pay-reminder-jennifer-brew.json` | 600 | 1 | `ddc18a91d2360a131ee58d56f4a06aee85a54be3` | 149 |
| `docs/audit/spring-pay-reminder-olivia-drago-rowe.json` | 615 | 1 | `ddc18a91d2360a131ee58d56f4a06aee85a54be3` | 149 |
| `docs/audit/spring-pay-reminder-verryluz-pagan.json` | 682 | 1 | `ddc18a91d2360a131ee58d56f4a06aee85a54be3` | 149 |
| `docs/audit/tiffany-torres-payment-receipt.json` | 513 | 1 | `ddc18a91d2360a131ee58d56f4a06aee85a54be3` | 149 |
| `docs/audit/verryluz-pagan-correction-summary.json` | 768 | 1 | `ddc18a91d2360a131ee58d56f4a06aee85a54be3` | 149 |
| `docs/audit/verryluz-stuck-installment-fix-summary.json` | 695 | 1 | `b6846f28d6987750f5be23f9de3a539af00af365` | 149 |
| `exports/brevo-contacts.csv` | 120764 | 713 | `f024dad3edd0da1528cbb2c92d5b2d07e5705a23` | 149 |
| `uploads/1753097597384_MEMBER_AGREEMENT_JULY_2025.pdf` | 110734 | — | `79144c9b2fa69a1ca80f48c904c3d82cf97a37ed` | this PR |
| `uploads/1753111827031_VOLUNTEER__MENTOR_AGREEMENT.pdf` | 240068 | — | `7ed201c7e0aeb9e8f81202398647128fbc3f6f8d` | this PR |

`create-supabase-auth-account.js` is in the purge list because #149 removes it from the tree and the file contains a hardcoded `createUser` password (length 15) plus an email argument (length 40). The service-role value is not in the file; it reads `process.env.SUPABASE_SERVICE_ROLE_KEY`. This PR does not delete that script.

## Open PR branches that need a rebase

Every open PR head contains at least one purged path, so each needs a rebase onto the rewritten `main` (or must be included in the same filter-repo run and force-pushed with the rewrite).

| PR | Branch |
| --- | --- |
| #155 | `cursor/parent-concierge-phase-1-fcfe` |
| #151 | `cursor/public-page-seo-10a0` |
| #150 | `cursor/school-onboarding-10a0` |
| #149 | `cursor/security-lockdown-e98b` |
| #148 | `cursor/platform-audit-94b7` |
| #145 | `cursor/e2e-supabase-live-project-guard-02c7` |
| #144 | `cursor/fix-e2e-supabase-user-lookup-18ec` |
| #143 | `cursor/security-db-push-guard-f540` |
| #141 | `feature/week-plan-multiple-lesson-links` |
| #123 | `fix/parent-important-documents` |
| #118 | `feature/class-auto-place-day-type` |
| #116 | `docs/fix-fall-2026-roster-headcount` |
| #105 | `feature/education-standards-kpis` |
| #69 | `fix/payment-flow-monitor-start` |
| #68 | `fix/free-after-threshold-money-path` |

## Commands for the real run

Not run here. Review the path list, then on a fresh machine:

```bash
git clone --mirror git@github.com:itsbrown/homeschool_co-op.git /tmp/asa-history-scrub
cd /tmp/asa-history-scrub
# purge-paths.txt = the 61 paths in the table, one per line
git filter-repo --dry-run --invert-paths --paths-from-file purge-paths.txt --force
git filter-repo --invert-paths --paths-from-file purge-paths.txt --force
```

Delete only the roster-publishing refs, after checking the summary markdown if you still want it:

```bash
git update-ref -d refs/heads/docs/fall-2026-class-rosters
git update-ref -d refs/heads/docs/fall-2026-full-day-students-csv
git update-ref -d refs/heads/docs/fall-2026-parents-enrolled-cart
```

Push only after that review. Add `origin` back first (`git filter-repo` removes it). Prefer pushing rewritten heads over `--mirror`, so a stale clone cannot delete unrelated remote refs:

```bash
git remote add origin git@github.com:itsbrown/homeschool_co-op.git
git push --force --all origin
git push origin --delete docs/fall-2026-class-rosters
git push origin --delete docs/fall-2026-full-day-students-csv
git push origin --delete docs/fall-2026-parents-enrolled-cart
```

There are no tags to push. Rebase or include the open PR branches in the same rewrite before their next push.

## Secrets to rotate

Names only. No values belong in this file.

- `PROD_DATABASE_URL` (GitHub Actions secret used by the deleted roster workflow). The name was not found as a committed value in the purged blobs. Rotate it anyway.
- `ROSTER_SNAPSHOT_TOKEN` (GitHub Actions secret the deleted workflow used to push `docs/fall-2026-class-rosters`). Not found as a committed value in these blobs. Rotate or remove it.
- Supabase **database password** for project `moivwjuglwwfrhqeewju`. `db_push_output.txt` contains a `postgresql://` URL, user `postgres`, password length 15, host includes that project ref.
- `SUPABASE_SERVICE_ROLE_KEY` for project `moivwjuglwwfrhqeewju`. No service-role JWT was found in the purged blobs. `create-supabase-auth-account.js` only references the env var. Rotate the key anyway; the repo is public.
- Cookie name `connect.sid` in `cookies.txt` (one HttpOnly cookie, domain localhost, value length 80). Invalidate that session. No other cookie names and no API key names were in that file.
- Hardcoded password passed to `supabase.auth.admin.createUser` in `create-supabase-auth-account.js` (length 15). Rotate that auth user's password. The email argument is not repeated here.

No `sk_live_`, `sk_test_`, `rk_live_`, `whsec_`, or `sb_secret_` prefix was found in the purged blobs.

## What a scrub does not do

Rewriting this repository does not recall clones, forks, CI caches, GitHub's cached views, or anyone who already downloaded a copy. Making the repository private matters in addition to the scrub. Rotate the secrets above even after the history rewrite.
