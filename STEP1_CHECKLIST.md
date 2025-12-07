# 🟩 Step 1: Pre-Feature Foundation Checklist

## 1. Remove Deprecated/Legacy Code
- [ ] Search codebase for @deprecated, legacy, old, commented-out blocks
- [ ] Identify deprecated API endpoints, especially for enrollments, payments, auth
- [ ] Identify old storage methods (file-based JSON, legacy migrations)
- [ ] Remove/disable legacy unused endpoints and helpers
- [ ] Refactor/delete unused legacy test files/scripts
- [ ] Update README/docs to remove references to deprecated logic

## 2. Tighten Authentication & Authorization
- [ ] Review all API endpoints for classes, rosters, messaging, schedules, student profiles
- [ ] Add/update role-based middleware for staff/educator features
- [ ] Ensure endpoints are authenticated, check user role, limit by class assignment
- [ ] Test: log in as staff/educator, try to access other users/classes (should fail)
- [ ] Add/expand integration/unit tests for auth failures

## 3. Tighten DB Security & RLS Policies
- [ ] Audit Row Level Security (RLS) for accounts, classes, enrollments, messages
- [ ] Remove/update “allow all” policies to be restrictive in production
- [ ] Test RLS policies locally/staging with different roles
- [ ] Update migration scripts and docs to reflect new policies

## 4. Commit & Document
- [ ] Commit each major change separately with descriptive messages
- [ ] Update docs describing deprecated code removed, improved auth, hardened RLS
- [ ] Push changes to feature branch

## ⭐ Bonus
- [ ] Tag/open GitHub Issues for refactor/more review
- [ ] Let Copilot audit major changes or generate sample code/tests