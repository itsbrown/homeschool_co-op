# Grades, ages, and class targeting

How child grade/age relate to classes and enrollment **today**.

## Invariants

- **No enrollment constraint by grade or age.** `POST /api/classes/:id/enroll` checks existence, duplicates, and capacity/waitlist only — not `children.gradeLevel` vs `classes.gradeLevels`.
- **No `minGrade` / `maxGrade` / `ageMin` / `ageMax` columns** anywhere in schema.
- **Grade Placement (opt-in):** when `classes.auto_place_by_grade` is on, sync places session-paid campus students whose grade matches — see [grade-placement.md](./grade-placement.md). Normalization lives in `shared/grade-levels.ts`.
- **Roster source of truth:** `program_enrollments` joined to `children` (not `school_class_enrollments` for current school-admin class UI). Paid enroll still has no grade gate; placement is a separate opt-in path.
- **Value mismatch (historical):** class grades are slugs (`1st-grade`); child grades are display labels (`1st Grade`). Use `normalizeGradeLevel` / `gradesMatch` for any matching.

## Schema (canonical)

| Table | Fields | Notes |
|-------|--------|--------|
| `children` | `birthdate` (date, required), `gradeLevel` (text, required), `currentReadingGradeLevel` (optional) | No stored `age` column — computed at read time |
| `classes` | `gradeLevels` (text[]), `ageRange` (text, marketplace-oriented) | Unified marketplace + school_admin |
| `school_classes` | `gradeLevel` (text, singular) | Legacy parallel table |
| `programs` | `ageRange`, `gradeLevels[]` | Legacy marketplace programs |
| `school_students` | `grade` (text) | School affiliation copy; not roster for class details |
| `program_enrollments` | `childId`, `className` (denorm), `marketplaceClassId` / `classId` | Roster + payment lane |
| `discounts` | `applicableToGradeLevels` (text[]) | Discount eligibility metadata (not class enroll gate) |

## UI surfaces

| Surface | Path | Grade behavior |
|---------|------|----------------|
| Class create/edit | `client/src/pages/schools/SchoolClassCreationPage.tsx` | Multi-select → `gradeLevels` slugs (`littles`…`12th-grade`) |
| Class details | `client/src/pages/schools/SchoolClassDetailsPage.tsx` | Display map for slugs; students tab |
| Classes list filter | `client/src/pages/schools/ClassesPage.tsx` | Client filter on `cls.gradeLevel` (singular — may not match array field) |
| Parent catalog filter | `client/src/components/registration/ProgramList.tsx` | `program.gradeLevels.includes(filter)` — browse filter only |
| Parent profile (admin) | `client/src/pages/schools/ParentProfilePage.tsx` | Child cards: grade + birthdate; class titles on **Enrollments** tab via `enrollment.className` |
| Parent children | `client/src/pages/ChildrenPage.tsx` | Grade on card; class title from `/api/children/:id/enrollments` |
| School admin Students | `client/src/pages/schools/StudentsPage.tsx` | Classes column from `GET /api/school-admin/students` → `classes[]` (current seats via `buildCurrentClassesByChildId`) |

## Key files

- `shared/schema.ts` — `children`, `classes`, `programEnrollments`
- `server/api/classes.ts` — enroll (no grade check)
- `server/api/school-admin.ts` — `GET /classes/:id/roster`
- `.agents/skills/asa-enrollment-classes/SKILL.md` — enrollment lifecycle
