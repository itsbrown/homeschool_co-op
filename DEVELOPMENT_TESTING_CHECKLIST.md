# Development Testing Checklist

**Purpose**: Catch basic code issues (duplicate functions, shadowed imports, runtime errors) before architect review.  
**Origin**: Created in response to Nov 22, 2025 middleware import bug where duplicate local functions shadowed imported middleware.

## For Middleware/Import Changes
Before marking completed, verify:
- [ ] **Check for duplicate function definitions**
  ```bash
  # Search for ALL definitions of the function you're importing (regular functions + arrow functions)
  grep -rn "^function functionName\|^async function functionName" server/
  grep -rn "^export function functionName\|^export async function functionName" server/
  grep -rn "const functionName.*=.*=>\|const functionName.*=.*async.*=>" server/
  grep -rn "export const functionName.*=.*=>|export const functionName.*=.*async.*=>" server/
  ```
- [ ] **Verify import is not shadowed by local function**
  ```bash
  # After adding import, check the same file doesn't define it locally
  grep -n "import.*functionName" file.ts
  grep -n "function functionName\|async function functionName" file.ts
  grep -n "const functionName.*=" file.ts
  ```
- [ ] **Test affected endpoints** - Don't rely only on LSP (it misses runtime errors)
  - Test 2-3 endpoints that use the middleware
  - Check server logs for errors
  - Verify expected behavior (e.g., schoolId extracted correctly)
- [ ] **Architect review BEFORE marking completed** - Include git diff

## For Function Removal
Before marking completed, verify:
- [ ] **Search ALL files for remaining function calls**
  ```bash
  # Find all calls to the function you're removing
  grep -rn "functionName(" server/ client/
  ```
- [ ] **Check for local duplicates with same name**
  ```bash
  # Find all definitions across the codebase (regular + arrow functions)
  grep -rn "function functionName\|const functionName.*=.*function" .
  grep -rn "const functionName.*=.*=>" .
  ```
- [ ] **Verify no references in other files**
  ```bash
  # Search for any mention of the function
  grep -rn "functionName" --include="*.ts" --include="*.tsx"
  ```

## For Database Schema Changes
Before marking completed, verify:
- [ ] **Never change primary key ID types** (serial ↔ varchar breaks existing data)
- [ ] **Check existing schema first**
  ```bash
  # Query database to see current column types
  npm run db:studio
  ```
- [ ] **Use safe push command**: `npm run db:push --force` (never write manual migrations)
- [ ] **Test with actual data** - Don't just check LSP

## General Pre-Completion Pattern
- [ ] **LSP only catches type errors** - Always test runtime behavior
- [ ] **Test the actual feature** - Click through UI or call API endpoints
- [ ] **Check server/browser logs** - Look for errors, warnings, unexpected output
- [ ] **Architect review catches issues** - Call before marking completed, not after
- [ ] **Include git diff in architect review** - Set `include_git_diff: true`

## Quick Verification Commands
```bash
# Find duplicate function definitions (regular functions)
grep -rn "^function extractSchoolId\|^async function extractSchoolId" server/

# Find duplicate function definitions (arrow functions)
grep -rn "const extractSchoolId.*=.*=>\|const extractSchoolId.*=.*async.*=>" server/

# Find all imports and local definitions (look for conflicts)
grep -n "import.*requireSchoolContext" server/api/school-admin.ts
grep -n "function requireSchoolContext\|const requireSchoolContext" server/api/school-admin.ts

# Count how many times a function is defined (should be 1)
grep -rn "^function myFunction\|const myFunction.*=" . | wc -l

# Find all calls to a function across codebase
grep -rn "myFunction(" --include="*.ts" --include="*.tsx"
```
