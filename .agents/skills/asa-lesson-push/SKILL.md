---
name: asa-lesson-push
description: >-
  Cursor-chat Drive → Week Planner push for Logic Hall and Grammar Hall,
  lesson Doc heading parse, draft-only apply script, and word-search packing.
  Use when Corey says push lesson, fill Grammar/Logic Hall week planner from
  Drive, re-push a slot, or make a word search from a lesson Doc.
---

# ASA lesson push (Cursor chat)

## Core Rules

- **Drive is authoring** — `week_plan_blocks` is a snapshot. Same `driveFileId` on re-push.
- **Preview then wait** — run `push-week-plan-block.ts --dry-run` and show block id before any write.
- **Draft only** — never Publish, email, or `--prod` unless the same message names them.
- **Clone default** — `.env` / Railway. `--prod` requires `with-prod-env.mjs` in the same command.
- **Lookup by name + time** — not prod ids. Clone Logic/Grammar ids differ from `#7/#82` and `#8/#84`.
- **Stop if missing** — no Drive file, no skeleton slot, or no Built week plan. Do not invent curriculum.

## Chat loop

1. Read the Drive Doc (MCP). Require headings: Title, Objectives, Materials, Homework, Script, Notes, Handouts.
2. `parseLessonDocHeadings` + `extractDriveFileId` → write `payload.json` (`hall`, `weekNumber`, `slotKey` or `dayOfWeek`+`startTime`).
3. `npx tsx server/scripts/push-week-plan-block.ts --dry-run payload.json`
4. Wait for “Push. Stay draft.”
5. Apply without `--dry-run`. Confirm on clone `/schools/week-planner`.

```bash
npx tsx server/scripts/push-week-plan-block.ts --dry-run payload.json
npx tsx server/scripts/push-week-plan-block.ts payload.json
node scripts/with-prod-env.mjs -- npx tsx server/scripts/push-week-plan-block.ts --prod payload.json
```

In-app product path (prefer this): Week Planner → Edit a lesson → **Connect folder** → **Generate lesson**. Cursor push is the staff backup when a heading Doc must land in one slot. Reindex 503 without a Drive key — install via `docs/APP_KNOWLEDGE/runbooks/google-drive-service-account.md`.

How-to prompts: `docs/APP_KNOWLEDGE/runbooks/lesson-push-cursor.md`.

## Halls (do not re-seed)

| Hall | Skeleton name | Prod class | Prod skeleton |
|------|---------------|------------|---------------|
| `logic` | `Logic Hall \| F2026 \| Afternoon` | `#82` | `#7` |
| `grammar` | `Grammar Hall \| F2026 \| Brighton` | `#84` Seekers 3–4 | `#8` |

Same 1:00–3:00 MWF clock. Rooms share the clock, not the packet. Grammar Friday 2:10 Week 1 = Preamble; Week 2 = Articles Seekers (no speech slip). Logic Friday 2:10 Week 2 = Articles claim · reason · reply. **Cubs `#83` is not Grammar Hall.** Drive hub: folder `1ZabPoqBouabtps2aVJdKInJ-QqWh1zue`. File list: `docs/APP_KNOWLEDGE/runbooks/lesson-push-cursor.md` (Fall 2026 Drive inventory).

Aliases: `latin`, `aoa`, `science`, `math`, `art`, `civics`. Week plan must already exist (Week Planner → New Week → Build).

## Word search

Grok **picks words only** (8–12 from that Doc). Never draw a grid in chat.

```bash
npx tsx server/scripts/make-wordsearch.ts --words familia,annus,pater --title "Latin Week 2"
```

Paste the student half into the Drive Doc; keep the answer key out of parent print. Do not use `AIWorksheetGenerator` or `activities.wordsearch`.

**Coloring pages:** Hugging Face image tools, black outlines, no letters → PNG on Drive → Handouts URL. Worksheets with words stay in the Doc.

## Common Pitfalls

- **Pushed Logic content into Grammar Friday civics** → rooms share the clock, not the packet → Grammar Friday 2:10 Week 1 is Preamble; Week 2 is Articles Seekers (no speech slip). Never paste Logic Hall’s Constitution or claim · reason · reply packet into Grammar Hall.
- **Pushed Space / Universe into Grammar Hall science** → Seekers Wednesday 1:15 is eESAGS Earth’s Features (Inside Earth → Earthquakes → Volcanoes…). Universe Seekers PDF stays off this room. No Elemental SW/LT/CP photocopies.
- **`--prod` without with-prod-env on clone** → writes clone thinking it is prod → still require both; dry-run first and read `env` in the JSON.
- **Clone 404 / missing week** → week not Built, or ids assumed from prod → resolve `skeletonName` + `weekNumber` + `13:15`.
- **Invented word-search grid** → letters do not fit → run `make-wordsearch.ts`.
- **Published by accident** → script never flips `week_plans.status` → Publish only in the Week Planner UI.
- **Connect folder then Generate empty (reindex 503)** → no Drive service-account key on this machine → `node scripts/install-google-drive-service-account.mjs ~/Downloads/key.json` then share the folder with that `client_email`.
- **Connect folder 403 Drive list failed** → Drive API off on `homeschool-platform-509218` → Enable at Cloud Console Library, wait a minute, retry. Folder must also be shared with `asa-drive-reader@homeschool-platform-509218.iam.gserviceaccount.com`.
- **Generate filled title/link but empty Objectives/Materials/Description** → matcher grabbed the PDF (`AoA` in the filename) over the Hall Doc (`Circumstance` ≠ `circumstantial`). Docs now outscore PDFs.
- **Generate worked once, then empty** → the saved Doc was marked used → Generate again now re-reads the same Doc on that slot.

## Best Practices

### Do

- Use `slotKey` (`latin`) or `dayOfWeek` + `startTime` from `shared/lesson-push/hall-slots.ts`.
- Keep one living Doc per slot per week; put the same URL on `lessonLink` / `resources`.
- Dry-run and quote `block.id` + current title before applying.
- Re-push after Drive edits with the same `driveFileId`.
- Leave reset/dismiss slots on template defaults unless Corey names them.

### Don't

- Don't hardcode prod `week_plan_blocks.id` or `skeleton_blocks.id` on the clone.
- Don't call inventing Claude for Hall lessons. In-app **Draft week from Drive** uses the deterministic matcher on `curriculum_assets` (preview → Apply). This Cursor-chat loop stays for one-off heading Docs.
- Don't auto-create week plans or auto-Publish.
- Don't put Hugging Face / Stability inside `push-week-plan-block.ts`.
- Don't treat Cubs `#83` or the `activities` table as the Hall source of truth.

## Key Files

- `shared/lesson-push/hall-slots.ts` — Logic + Grammar 15-slot clock
- `shared/lesson-push/payload.ts` — Zod payload + slot resolve
- `shared/lesson-push/parse-doc.ts` — heading parse + Drive id
- `shared/lesson-push/word-search.ts` — guaranteed grid packer
- `server/scripts/push-week-plan-block.ts` — clone/prod apply, draft only
- `server/scripts/make-wordsearch.ts` — word-search CLI
- `docs/APP_KNOWLEDGE/runbooks/lesson-push-cursor.md` — How to use
- `docs/APP_KNOWLEDGE/runbooks/google-drive-service-account.md` — Drive key install
- `scripts/install-google-drive-service-account.mjs` — write gitignored key + `.env` file path
- `server/lib/schedule-builder-db.ts` — `updateWeekPlanBlock`
- `docs/APP_KNOWLEDGE/domains/schedule-and-lesson-planning.md` — Week Planner product loop
