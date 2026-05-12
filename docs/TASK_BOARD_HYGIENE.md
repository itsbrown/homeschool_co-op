# Task board hygiene (Replit)

## Schema sync duplicate tasks

- **Keep `#242`** — Fix schema sync / `drizzle-kit` / Zod issues (e.g. `idx_user_roles_unique_user_role` expression index introspection).
- **Reject `#249`** if it is a duplicate of `#242` (same root cause). Add a note on `#242`: “Supersedes #249.”

Do this in the Replit task UI; Cursor cannot change Replit task state.

## Ongoing

When two tasks target the same files and symptom, keep the **older** task ID unless the newer one explicitly supersedes with a link.
