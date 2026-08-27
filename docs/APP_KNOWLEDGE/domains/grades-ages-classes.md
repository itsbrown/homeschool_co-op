# Grades, ages, and class targeting

How child grade/age relate to classes and enrollment **today**.

## Invariants

- **No enrollment constraint by grade or age.** `POST /api/classes/:id/enroll` does not compare `children.gradeLevel` vs `classes.gradeLevels`. It does gate on `classes.require_member_id` (non-empty `users.member_id`, staff bypass) in addition to existence, duplicates, and capacity/waitlist.
- **No `minGrade` / `maxGrade` / `ageMin` / `ageMax` columns** anywhere in schema.
- **Grade Placement (opt-in):** when `classes.auto_place_by_grade` is on, sync places session-paid campus students whose grade matches — see [grade-placement.md](./grade-placement.md). Normalization lives in `shared/grade-levels.ts`.
- **Roster source of truth:** `program_enrollments` joined to `children` (not `school_class_enrollments` for current school-admin class UI). Paid enroll still has no grade gate; placement is a separate opt-in path.
- **Value mismatch (historical):** class grades are slugs (`1st-grade`); child grades are display labels (`1st Grade`). Use `normalizeGradeLevel` / `gradesMatch` for any matching.
- **Age → grade (school-admin edit):** `gradeLevelFromAge` / `gradeLevelFromBirthdate` use **age − 5** (≤3 Littles, 4 Pre-K, 5 K, 6→1st … capped at 12th). Edit Student auto-fills from DOB; PUT normalizes to display labels and syncs `school_students.grade`.

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
| Parent student profile | `client/src/pages/children/ChildProfilePage.tsx` | Health & Safety **Add / Edit** saves allergies via `PATCH /api/children/:id` (parents) or `PUT /api/school-admin/students/:id` (admins) |
| School admin Students | `client/src/pages/schools/StudentsPage.tsx` | Classes column from `GET /api/school-admin/students` → `classes[]` (current seats via `buildCurrentClassesByChildId`) |
| Edit / register student | `client/src/pages/schools/StudentRegistrationPage.tsx` | Grade options from `GRADE_LEVEL_OPTIONS` (labels); auto from DOB (age − 5); invalidate students queries after save |

## Pitfalls

| Symptom | Cause | Fix |
|---------|--------|-----|
| Grade dropdown shows placeholder after load | Select values (`1st`) ≠ stored labels (`1st Grade`) | Use `GRADE_LEVEL_OPTIONS` labels as Select values; normalize on GET/PUT |
| Grade “didn't save” after Update | `staleTime: Infinity` + no query invalidation on students list | `invalidateQueries(['/api/school-admin/students'])` after PUT |
| DOB date input blank | ISO datetime in `birthdate` | `toDateInputValue()` → `YYYY-MM-DD` |
| Parent Profile trash “Delete Child” fails | `DELETE /api/school-admin/children/:id` — **400** if any `program_enrollments`; historically **500** when deleting `children` before `school_students` (no CASCADE) | Use `deleteSchoolAdminChild` (school_students first). E2E: `e2e/parent-profile-delete-child.spec.ts` (`withDeletableChild`) |
| Parent cannot add allergies on Student Profile | Health tab was display-only; Edit Profile (`ChildRegistrationForm`) required **Gender** though signup does not collect it; `PATCH /api/children/:id` used strict `parentEmail ===` (fails when email is null/case-mismatched and the child is linked by `parent_id`). Allergies column is **text** — arrays in the body 500 the update | Health tab **Add / Edit**; gender optional on edit; `childMatchesParent` + `buildChildProfilePatch` coerce arrays to `"Peanuts, Shellfish"` |

## Key files

- `shared/schema.ts` — `children`, `classes`, `programEnrollments`
- `shared/grade-levels.ts` — normalize, age−5 helpers, `GRADE_LEVEL_OPTIONS`
- `shared/child-profile-patch.ts` — allergy text coerce + child update whitelist
- `server/lib/delete-school-admin-child.ts` — school-admin hard delete (FK-safe order)
- `server/api/classes.ts` — enroll (no grade check)
- `server/api/school-admin.ts` — `GET/PUT /students/:id`, `GET /classes/:id/roster`
- `.agents/skills/asa-enrollment-classes/SKILL.md` — enrollment lifecycle
