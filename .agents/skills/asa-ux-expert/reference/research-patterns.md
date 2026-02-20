# UX Research Patterns — Deep Reference

Extended research backing for the asa-ux-expert skill. Read this when implementing complex UX decisions or reviewing existing patterns against industry standards.

## Nielsen Norman Group — Complex Application Heuristics (Jan 2024)

NN/g defines complex applications as those supporting "broad, unstructured goals or nonlinear workflows of highly trained users in specialized domains." ASA qualifies — school admins manage enrollments, payments, attendance, and staff across multiple sessions simultaneously.

### Key Adaptations for ASA

**Visibility of system status in multi-tenant context:**
- When a school admin switches between locations, the UI must immediately reflect the active location in the header/breadcrumb. Stale context causes data entry errors.
- Payment processing must show real-time status: "Processing..." → "Payment confirmed" → "Receipt sent". Never leave the user wondering if Stripe received the charge.

**Error prevention in financial workflows:**
- Disable the "Process Refund" button when refund amount exceeds original payment (server validates too, but the button should prevent the attempt)
- Show remaining balance in real-time as a parent selects payment plan options
- Pre-calculate proration amounts before the admin confirms mid-session enrollment

**Flexibility for expert users (school admins):**
- Keyboard-navigable data tables with column sorting
- Bulk enrollment approval (select multiple → "Approve Selected")
- Quick-search that filters across name, email, phone simultaneously
- Export to CSV for offline processing of enrollment/payment reports

## Baymard Institute — Form Usability (2024)

### Critical Statistics for ASA Forms

| Finding | Impact | ASA Application |
|---------|--------|-----------------|
| 31% of sites lack inline validation | Higher error rates | All ASA forms must validate on blur |
| 22% abandon due to checkout complexity | Lost enrollments | ASA checkout: review → discounts → payment → confirm (4 clear steps) |
| 14% abandon if phone is required without explanation | Incomplete registrations | Add helper: "For class cancellation alerts" |
| 80% don't allow spaces in card fields | Payment friction | Stripe Elements handles this — use Stripe's hosted fields |
| Average checkout has 11.3 fields | Benchmark | ASA enrollment target: <10 fields per step |
| 34% lose data on validation error | User frustration | Never clear form state on error — only highlight problems |

### Form Field Sizing Reference

| Field Type | Tailwind Width | Why |
|------------|---------------|-----|
| First name | `w-full` or `flex-1` | Names vary greatly |
| Last name | `w-full` or `flex-1` | Names vary greatly |
| Email | `w-full` | Emails can be very long |
| Phone | `w-48` or `max-w-xs` | Fixed 10-digit format |
| ZIP code | `w-24` | Fixed 5-digit format |
| State | `w-32` (dropdown) | Short selection |
| Date of birth | `w-40` | Fixed format |
| Payment amount | `w-32` | Currency format |
| Notes/comments | `w-full` + `min-h-[80px]` | Free-text needs space |

### Validation Timing Flow

```
User focuses field → No validation
User types → No validation (never validate mid-keystroke)
User leaves field (blur) → Validate
  ├─ Valid → Show green checkmark (optional positive reinforcement)
  └─ Invalid → Show red border + error message below field
User returns to errored field → Keep error visible
User corrects input → Clear error IMMEDIATELY (don't wait for blur)
User submits form → Re-validate all fields
  ├─ All valid → Submit
  └─ Errors found → Scroll to first error, show error count at top
```

## WCAG 2.2 — Focus Management for ASA (Oct 2023)

### New Criteria Most Relevant to ASA

**2.4.11 Focus Not Obscured (Level AA):**
ASA has sticky headers in both parent and educator shells. When tabbing through a long enrollment list, the focused row can scroll behind the sticky header.

Fix:
```css
html {
  scroll-padding-top: 80px; /* Match sticky header height */
}
```

**2.5.8 Target Size Minimum (Level AA):**
All interactive targets must be at least 24×24 CSS pixels. ASA standard: 48×48px for primary actions, 44×44px for secondary. Small icon buttons (like table row actions) must have expanded hit areas:
```css
.icon-action {
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

**3.3.7 Redundant Entry (Level A):**
Don't ask users for the same information twice. If a parent enters their address during registration, pre-fill it for enrollment forms. If a child's medical info is on file, don't ask again — show a "Confirm existing info" checkbox.

**3.3.8 Accessible Authentication (Level A):**
Don't require users to memorize or transcribe passwords/codes to log in. ASA uses Supabase auth with email magic links and Google OAuth — both comply. Never add CAPTCHA without an accessible alternative.

### Focus Management Patterns for ASA

**Modal dialogs (AlertDialog, Dialog, Sheet):**
```
1. User clicks trigger button → Store reference to trigger
2. Modal opens → Focus first focusable element inside
3. Tab cycles within modal only (focus trap)
4. ESC or close button → Close modal
5. Focus returns to original trigger button
```
Shadcn's Dialog and AlertDialog handle this automatically. Custom overlays must implement it manually.

**Route transitions in SPA:**
```
1. User clicks nav link → Route changes
2. New page renders → Focus moves to <h1> or <main>
3. Screen reader announces new page title
```
Implementation: In page components, use `useEffect` with `document.title` update and optionally focus the heading:
```typescript
useEffect(() => {
  document.title = 'Enrollment Details - American Seekers Academy';
  // Optionally focus the main heading for screen reader announcement
  const heading = document.querySelector('h1');
  heading?.focus();
}, []);
```

**Dynamic content (accordion, collapsible, tab panels):**
- When expanding: Focus stays on the trigger, content appears below
- When loading async content: Use `aria-busy="true"` on the container, switch to `false` when loaded
- New content announced via `aria-live="polite"` region (not "assertive" — that interrupts)

## Fitts' Law — Touch Target Research (2024)

### Thumb Zone Map for Mobile (375px width)

```
┌─────────────────────────────┐
│    HARD TO REACH            │  ← Secondary nav, settings
│                             │
│    COMFORTABLE              │  ← Content, scrollable lists
│                             │
│                             │
│    NATURAL                  │  ← Primary actions
│                             │
│  [Tab] [Tab] [Tab] [Tab]    │  ← Bottom nav (ideal zone)
└─────────────────────────────┘
```

### ASA Mobile Action Placement

| Action | Priority | Placement | Rationale |
|--------|----------|-----------|-----------|
| Pay Now / Enroll | Primary | Sticky bottom bar | Must be instantly reachable |
| Add to Cart | Primary | Inline card button (bottom) | Contextual to the class card |
| View Details | Secondary | Card body (tap entire card) | Full card as touch target |
| Cancel Enrollment | Destructive | Behind dropdown menu (top) | Requires deliberate reach = natural friction |
| Delete Account | Destructive | Settings page, behind confirm dialog | Maximum friction appropriate |
| Filter/Search | Utility | Top of list (below header) | Used before scanning, appropriate at top |
| Back / Navigation | Utility | Top-left (standard pattern) | OS convention, users expect it there |

### Touch Target Checklist for ASA Components

- [ ] All buttons: minimum `h-11` (44px), prefer `h-12` (48px) for primary CTAs
- [ ] Table row actions (DropdownMenuTrigger): minimum 44×44px tap area
- [ ] Checkbox/Radio inputs: 44×44px touch area (Shadcn default handles this)
- [ ] Close buttons on modals: minimum 44×44px (Shadcn X button may need padding)
- [ ] Tab switches: minimum 44px height, adequate horizontal padding
- [ ] Pagination controls: minimum 44×44px per page button
- [ ] Icon-only actions: expand hit area with padding, add `aria-label`

## Education Platform Benchmarks

### Enrollment Flow Comparison

| Platform | Steps to Enroll | Key UX Feature |
|----------|----------------|----------------|
| Sawyer | 3 (select → child info → pay) | Inline class availability, instant booking |
| Brightwheel | 4 (apply → review → documents → pay) | Document upload in flow, status tracking |
| Enrollsy | 3 (select → family info → pay) | Family-centric (enroll siblings together) |
| ASA Target | 4 (browse → select class → review/discounts → pay) | Credit system integration, consolidated family payments |

### Dashboard Design Comparison

| Platform | Stat Cards | Key Insight |
|----------|-----------|-------------|
| Sawyer | 4 (revenue, bookings, capacity, waitlist) | Focused on actionable metrics only |
| Brightwheel | 3 (attendance, billing, messages) | Activity-feed primary, stats secondary |
| Enrollsy | 5 (enrollment, revenue, capacity, upcoming, alerts) | Alert-driven — surfaces items needing attention |
| ASA Target | 4-6 (enrollment, revenue, attendance, upcoming) | Alert-driven for admins, activity-feed for parents |

### Key Takeaways from Benchmarks
1. **Fewer steps convert better** — every additional step loses 10-15% of users
2. **Show availability inline** — "3 spots left" on the class card, not after clicking "Enroll"
3. **Family-centric flows** — parents enroll multiple children at once, not one at a time
4. **Status transparency** — show enrollment status (pending → approved → enrolled) with visual progress
5. **Mobile-first billing** — parents check balances and make payments primarily on phones
