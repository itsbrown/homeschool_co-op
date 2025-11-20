# Phase 3: Multi-Role Frontend Integration
## Implementation Plan for ASA Learning Platform

---

## Executive Summary

**Status**: Phase 1 & 2 COMPLETED ✅ | Phase 3 PENDING  
**Goal**: Integrate multi-role system into frontend, replacing hardcoded role logic with database-driven role management  
**Complexity**: Medium - Requires refactoring existing auth patterns while maintaining backward compatibility  
**Estimated Scope**: 8-12 tasks across authentication, UI components, and admin interfaces

---

## Phase 1 & 2 Completion Summary

### ✅ Phase 1: Database Layer (COMPLETED)
- `user_roles` junction table created with proper indexes
- Role enum expanded to support all user types
- Data migration of existing users completed
- Backward compatibility maintained via `users.role` column

### ✅ Phase 2: Backend APIs (COMPLETED)
**User-Facing APIs:**
- `GET /api/user/roles` - View all roles for authenticated user
- `POST /api/user/switch-role` - Switch active role with school context update
- `POST /api/user/reset-role` - Reset to primary role

**Admin APIs:**
- `GET /api/user/admin/users/:userId/roles` - View user's roles (school-filtered for schoolAdmins)
- `POST /api/user/admin/users/:userId/roles` - Add role to user (cross-school support)
- `DELETE /api/user/admin/users/:userId/roles/:roleId` - Remove role with safety checks

**Security Features Implemented:**
- Cross-school role assignment (e.g., educator@school1 AND educator@school2)
- Duplicate prevention at (userId, role, schoolId) level
- Last-role deletion protection
- School isolation for schoolAdmins
- Active role cleanup on deletion
- Primary role reassignment with school realignment

---

## Phase 3: Frontend Integration Plan

### Current Frontend State Analysis

#### Existing Components
1. **RoleContext** (`client/src/contexts/RoleContext.tsx`)
   - Current: Hardcoded multi-role users (`['corey@americanseekersacademy.com']`)
   - Current: Manual `availableRoles` array
   - Current: localStorage-first role management
   - **NEEDS**: Database-driven role fetching via `/api/user/roles`

2. **RoleSwitcher** (`client/src/components/RoleSwitcher.tsx`)
   - Current: Hardcoded role list and email check
   - Current: Static role definitions
   - **NEEDS**: Dynamic role loading from user's actual roles

3. **RoleManagementPage** (`client/src/pages/admin/RoleManagementPage.tsx`)
   - Current: Role invitation system (separate workflow)
   - **NEEDS**: Integration with `/api/user/admin/users/:userId/roles` endpoints

4. **SupabaseProvider** (`client/src/components/SupabaseProvider.tsx`)
   - Current: Working Supabase auth integration
   - Status: No changes needed ✅

---

## Implementation Tasks

### Task 1: Refactor RoleContext to Use Database API
**Priority**: HIGH | **Complexity**: MEDIUM

**Changes Required:**
```typescript
// Current approach (REMOVE):
const multiRoleUsers = ['corey@americanseekersacademy.com'];
const hasMultipleRoles = multiRoleUsers.includes(user?.email);

// New approach (ADD):
const { data: userRoles } = useQuery({
  queryKey: ['/api/user/roles', user?.email],
  queryFn: async () => {
    const response = await fetch('/api/user/roles');
    if (!response.ok) throw new Error('Failed to fetch roles');
    return response.json();
  },
  enabled: !!user,
});

const hasMultipleRoles = userRoles?.roles?.length > 1;
const availableRoles = userRoles?.roles || [];
```

**Key Considerations:**
- Maintain backward compatibility for single-role users
- Handle loading states appropriately
- Preserve school context during role switches
- Keep localStorage sync for UX optimization

**Testing Scenarios:**
- Single-role user should see no role switcher
- Multi-role user should see all their roles
- Role switching updates both activeRole AND schoolId
- Page refresh preserves selected role

---

### Task 2: Update RoleSwitcher Component
**Priority**: HIGH | **Complexity**: LOW

**Changes Required:**
```typescript
// Remove hardcoded email check:
- const shouldShowRoleSwitcher = user?.email === 'coreycreates@gmail.com';

// Add dynamic role fetching:
const { data: userRoles } = useQuery({
  queryKey: ['/api/user/roles'],
  enabled: !!user,
});

const shouldShowRoleSwitcher = userRoles?.roles?.length > 1;
const availableRoles = userRoles?.roles || [];
```

**Key Considerations:**
- Display role with school name (e.g., "Educator - School A")
- Show current active role clearly
- Support cross-school role switching
- Handle API errors gracefully

---

### Task 3: Integrate Role Switching with Backend API
**Priority**: HIGH | **Complexity**: MEDIUM

**Changes Required:**
```typescript
// Replace localStorage-only switching with API call:
const switchRoleMutation = useMutation({
  mutationFn: async (roleId: number) => {
    const response = await fetch('/api/user/switch-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId }),
    });
    if (!response.ok) throw new Error('Failed to switch role');
    return response.json();
  },
  onSuccess: (data) => {
    // Update local state
    setActiveRole(data.activeRole);
    // Update school context if changed
    if (data.schoolId) {
      // Trigger app-wide refresh if school changed
      queryClient.invalidateQueries();
    }
  },
});
```

**Key Considerations:**
- Backend updates both `activeRole` AND `schoolId`
- Frontend must invalidate relevant queries after school switch
- Preserve user experience with optimistic updates
- Show clear feedback on role switch

---

### Task 4: Add Admin Role Management Interface
**Priority**: MEDIUM | **Complexity**: MEDIUM

**Changes Required to RoleManagementPage:**

**New Section: "Manage User Roles"**
- Add user search/lookup
- Display user's current roles with school names
- Add role to user (with school selection for global admins)
- Remove role from user (with confirmation)
- Show primary role badge

**UI Components Needed:**
- User search input/autocomplete
- Role assignment dialog
  - Role selector dropdown
  - School selector (for global admins only)
  - Primary role checkbox
- Role list with delete buttons
- Confirmation dialogs for destructive actions

**API Integration:**
```typescript
// Get user roles
const { data: userRoles } = useQuery({
  queryKey: ['/api/user/admin/users', userId, 'roles'],
  enabled: !!userId,
});

// Add role
const addRoleMutation = useMutation({
  mutationFn: async ({ userId, role, schoolId, isPrimary }) => {
    const response = await fetch(`/api/user/admin/users/${userId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ role, schoolId, isPrimary }),
    });
    return response.json();
  },
});

// Remove role
const removeRoleMutation = useMutation({
  mutationFn: async ({ userId, roleId }) => {
    const response = await fetch(
      `/api/user/admin/users/${userId}/roles/${roleId}`,
      { method: 'DELETE' }
    );
    return response.json();
  },
});
```

---

### Task 5: Add School Context Indicator
**Priority**: LOW | **Complexity**: LOW

**Enhancement**: Show current school in header/nav when user has multi-school roles

**Implementation:**
```typescript
// In header component:
const { data: userRoles } = useQuery({
  queryKey: ['/api/user/roles'],
});

const currentRole = userRoles?.roles?.find(r => r.id === userRoles.activeRoleId);
const hasMultipleSchools = new Set(userRoles?.roles?.map(r => r.schoolId)).size > 1;

{hasMultipleSchools && (
  <Badge variant="outline">
    {currentRole?.schoolName || 'School'}
  </Badge>
)}
```

---

### Task 6: Handle Edge Cases & Error States
**Priority**: HIGH | **Complexity**: LOW

**Scenarios to Handle:**
1. User with no roles in `user_roles` (legacy user)
   - Fall back to `users.role` and `users.schoolId`
2. API failure during role fetch
   - Show error message, fall back to cached role
3. Active role deleted by admin while user is logged in
   - Backend auto-resets to primary role
   - Frontend detects mismatch and refreshes
4. Last role deletion attempt
   - Backend rejects with 400 error
   - Frontend shows clear error message

---

### Task 7: Update Documentation
**Priority**: LOW | **Complexity**: LOW

**Files to Update:**
- `replit.md` - Mark Phase 3 as complete
- Add inline code comments for multi-role patterns
- Document role switching UX patterns

---

### Task 8: End-to-End Testing
**Priority**: HIGH | **Complexity**: MEDIUM

**Test Scenarios:**
1. **Single-role user**
   - No role switcher visible
   - Standard navigation works
   
2. **Multi-role user (same school)**
   - Role switcher shows all roles
   - Switching roles updates UI instantly
   - School context remains same
   
3. **Multi-role user (cross-school)**
   - Role switcher shows roles with school names
   - Switching schools invalidates queries
   - School-specific data updates correctly
   
4. **Admin adding/removing roles**
   - Global admin can assign roles to any school
   - SchoolAdmin limited to their school
   - Cannot delete last role
   - Primary role reassignment works

5. **Edge cases**
   - Active role deleted → auto-reset to primary
   - Legacy user → falls back gracefully
   - API errors → show error, maintain state

---

## Implementation Order

### Sprint 1: Core Functionality
1. ✅ Task 1: Refactor RoleContext
2. ✅ Task 2: Update RoleSwitcher
3. ✅ Task 3: Integrate API role switching

### Sprint 2: Admin & Polish
4. ✅ Task 4: Admin role management UI
5. ✅ Task 6: Edge case handling
6. ✅ Task 5: School context indicator (optional)

### Sprint 3: Testing & Documentation
7. ✅ Task 8: End-to-end testing
8. ✅ Task 7: Documentation update

---

## Key Design Decisions

### 1. Database as Source of Truth
- **Decision**: Always fetch roles from `/api/user/roles`, not hardcoded lists
- **Rationale**: Allows dynamic role assignment without code deployment
- **Trade-off**: Additional API call on auth init (acceptable)

### 2. Backward Compatibility
- **Decision**: Preserve `users.role` and `users.schoolId` columns
- **Rationale**: Legacy code continues working, gradual migration
- **Trade-off**: Dual-source complexity (mitigated by fallback pattern)

### 3. School Context Management
- **Decision**: Backend updates `users.schoolId` on role switch
- **Rationale**: Maintains tenant isolation at database level
- **Trade-off**: Page may need refresh on school switch (acceptable UX)

### 4. Role Switcher Visibility
- **Decision**: Show role switcher ONLY if `userRoles.length > 1`
- **Rationale**: Clean UX for majority single-role users
- **Trade-off**: None - this is ideal behavior

---

## Success Criteria

### Functional Requirements
- ✅ Users can view all their assigned roles
- ✅ Users can switch between roles seamlessly
- ✅ Admins can add/remove roles for users
- ✅ School isolation maintained for schoolAdmins
- ✅ Cross-school role assignment works
- ✅ Legacy single-role users unaffected

### Non-Functional Requirements
- ✅ No page reload required for same-school role switch
- ✅ Clear visual feedback on active role
- ✅ Error messages are user-friendly
- ✅ Performance impact < 500ms for role switch
- ✅ No console errors in production

---

## Migration Path

### For Existing Users
1. All existing users automatically have entry in `user_roles` (Phase 1 migration)
2. Single-role users see no change in UX
3. Multi-role users see new role switcher appear
4. Admins can immediately start assigning additional roles

### For New Users
1. Created via Supabase auth with default role
2. Backend auto-creates `user_roles` entry on first API call
3. Admin can assign additional roles via admin panel

---

## Rollback Plan

### If Phase 3 has issues:
1. **Frontend**: Revert to hardcoded multi-role list
2. **Backend**: APIs remain available but unused (no harm)
3. **Database**: No schema changes in Phase 3 (safe)

### Emergency Rollback Steps:
```bash
# Revert frontend changes
git revert <phase-3-commits>

# Backend APIs remain functional but unused
# No database changes needed
```

---

## Open Questions

1. **Should role switching trigger page reload?**
   - Current: Yes, for simplicity
   - Alternative: Smart query invalidation (more complex)
   - **Decision**: Start with reload, optimize later if needed

2. **How to handle school selector for cross-school users?**
   - Option A: Inline in role switcher (cluttered)
   - Option B: Separate school selector (complex)
   - Option C: Show role with school name (clean)
   - **Decision**: Option C - "Educator - School A"

3. **Should primary role be editable?**
   - Current: Admin can set isPrimary on add
   - Alternative: Dedicated "Set as Primary" action
   - **Decision**: Keep simple - set on add only

---

## Related Files

### Frontend
- `client/src/contexts/RoleContext.tsx` (refactor)
- `client/src/components/RoleSwitcher.tsx` (refactor)
- `client/src/pages/admin/RoleManagementPage.tsx` (extend)

### Backend (No changes needed - Phase 2 complete)
- `server/api/user-roles.ts` ✅
- `shared/schema.ts` ✅

### Documentation
- `replit.md` (update Phase 3 status)
- This file (`PHASE_3_IMPLEMENTATION_PLAN.md`)

---

## Conclusion

Phase 3 completes the multi-role system by connecting the robust backend (Phase 2) with an intuitive frontend experience. The implementation maintains backward compatibility while enabling powerful multi-role, multi-school capabilities for the ASA Learning Platform.

**Next Steps**: Begin Task 1 (RoleContext refactor) once approved.
