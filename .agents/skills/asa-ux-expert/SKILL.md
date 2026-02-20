---
name: asa-ux-expert
description: Expert-level UX design and frontend interaction patterns grounded in NN/g heuristics, Baymard form research, WCAG 2.2, and Fitts' Law. Use when building new pages, redesigning workflows, reviewing UI decisions, optimizing forms, improving accessibility, or making any user experience decision for the ASA Learning Platform.
---

# ASA UX Expert

Expert-level UX guidance for the ASA Learning Platform. Every decision here is backed by peer-reviewed research (Nielsen Norman Group, Baymard Institute, W3C) and mapped to real ASA pages. See `asa-design-system` for visual tokens/templates; this skill covers the experience design layer.

See `reference/research-patterns.md` for deep-dive research backing and extended examples.

## Core Rules / Conventions

- **Parent mental model** — Use school-office language ("Enroll", "Tuition", "Class") not developer language ("Create Record", "Payment Amount", "Program"). Every label should match what a parent would hear at the front desk.
- **Recognition over recall on payments** — Always show child name + class name on payment screens, scheduled payment rows, and billing history. Parents must never see "Payment #4823" without context. Use `enrollmentDetails` array from the payment-history API.
- **Error prevention on financial actions** — Disable buttons when the action would fail: "Enroll" when class is full, "Pay" when amount exceeds balance, "Refund" when amount exceeds original charge. Server validates too, but the UI should prevent the attempt.
- **Two-audience flexibility** — School admins managing 200+ students need table views, bulk actions, and keyboard navigation (`UsersPage.tsx`). Parents enrolling one child need card-based flows with minimal choices (`ProgramsParentPage.tsx`). Same data, different presentation.
- **Exit without data loss** — Every multi-step flow (checkout, registration, enrollment) needs back-navigation that preserves entered data. Cart state persists via TanStack Query cache; form state via `react-hook-form` controlled values.
- **4-6 stat cards max** — Dashboards with 12 stat cards overwhelm. Each card must drive a decision or action — if clicking it doesn't lead somewhere useful, remove it.

## Cognitive Load Management

### Miller's Law — Chunk Information
- **7±2 rule**: Group navigation items into 5-7 top-level categories max. ASA sidebar should have 5-7 primary nav items; nest sub-items under expandable sections.
- **Card grids**: Show 6-9 class cards per viewport, not 20. Use pagination or "Load More" after the first meaningful set.
- **Form sections**: Group related fields into labeled sections (Card + CardHeader). "Child Information" → "Emergency Contact" → "Medical Notes". Never present 15 ungrouped fields.

### Hick's Law — Reduce Decisions
- **Progressive disclosure**: Show the simple path first, reveal complexity on demand. Enrollment form shows required fields; "Additional Options" expands for scholarships, dietary notes, etc.
- **Smart defaults**: Pre-select the most common payment plan. Pre-fill parent's phone from their profile. Default to the school's primary location.
- **Decision reduction**: "Pay in Full" vs "Biweekly Plan" — two clear options, not five plan variations. Binary choices convert 30% better than multi-option selectors (Baymard).

### Gestalt Principles — Visual Grouping
- **Proximity**: Related fields (First Name, Last Name) should be closer together than unrelated groups (Name fields vs Address fields). Use `space-y-4` within groups, `space-y-8` between groups.
- **Similarity**: All actionable buttons look like buttons (filled or outlined). All status indicators use the same badge pattern. Don't mix link-style actions with button-style actions in the same row.
- **Enclosure**: Wrap related content in `Card` components. A payment summary in a card signals "this is one logical unit" — especially important in checkout flows.

## Multi-Step Workflow Design

### When to Use Multi-Step vs Single Page
| Scenario | Pattern | Why |
|----------|---------|-----|
| <5 fields, one topic | Single page | No need for steps overhead |
| 5-12 fields, 2-3 topics | Accordion sections | Fields visible, collapsible |
| 12+ fields, 3+ topics | Multi-step wizard | Reduces perceived complexity |
| High-stakes (payment) | Multi-step with review | Users need confirmation before commit |

### Step Indicator Requirements
- Show total steps and current position: "Step 2 of 4"
- Show step labels, not just numbers: "Child Info → Class Selection → Payment → Confirm"
- Allow clicking completed steps to go back (never lose entered data)
- Validate current step before allowing "Next" — inline errors, not post-submit

### ASA Checkout Flow (Reference Implementation)
`CartCheckout.tsx` → review cart → apply discounts/credits → payment method → confirm
- Cart items show child name + class name + price (recognition over recall)
- Discount section uses progressive disclosure — collapsed unless discounts are available
- Payment step shows running total with line-item breakdown
- Confirmation shows everything before the final "Pay" button

## Form UX (Baymard Research-Backed)

### Inline Validation Timing
- **Validate on blur** (when user leaves field), never on every keystroke — premature red errors cause 22% higher abandonment (Baymard)
- **Clear errors immediately** when user corrects the input — don't wait for re-blur
- **Positive validation**: Show green checkmark on valid fields (email format, phone format) — confirms "you got it right" without requiring mental verification

### Field Design Rules
- **Single column** on all form layouts — multi-column forms increase errors by 16% (Baymard)
- **Labels above fields** (never to the left) — mandatory on mobile, best practice on desktop
- **Field width matches expected input**: ZIP code → narrow (`w-24`), email → full width, phone → medium (`w-48`)
- **Required vs optional**: Mark required with `*` AND mark optional with "(Optional)" label — 86% of sites fail this (Baymard), causing user confusion
- **Helper text**: Below field, `text-xs text-muted-foreground` — explain WHY a field is needed ("We'll text class cancellation alerts to this number")

### Error Recovery
- **Never clear the form** on validation failure — retain all user input (34% of sites lose sensitive field data on error — Baymard)
- **Adaptive error messages**: "Please enter a valid email" not "Invalid input". "Phone must be 10 digits" not "Validation failed"
- **Scroll to first error** on form submit with `element.scrollIntoView({ behavior: 'smooth', block: 'center' })`
- **Error count summary** at top of long forms: "Please fix 2 errors below"

## Feedback & Messaging

See `asa-frontend-conventions` for `isPending`/`isLoading` patterns and `asa-design-system` for toast styling. This section covers ASA-specific message content and feedback decisions.

### ASA Toast Copywriting Rules
- **Enrollment toasts**: Include child name + class — "Maya is enrolled in Arabic 101" not "Enrollment created"
- **Payment toasts**: Include amount + context — "Payment of $150.00 for Maya's Arabic 101 confirmed" not "Payment succeeded"
- **Error toasts**: Include recovery action — "Payment failed — please check your card details and try again" not "Error processing payment"
- **Capacity warnings**: Include count + class — "Only 2 spots remaining in Arabic 101" not "Class is almost full"

### Long-Running Operations in ASA
- **AI content generation** (`KnowledgeBase.tsx`): Show progress bar with "Analyzing document..." — AI processing can take 10-30s
- **Stripe payment processing**: Show spinner with "Processing payment..." — never let parent wonder if the charge went through. Confirm with success toast including amount.
- **Bulk enrollment approval**: Show "Approving 12 enrollments..." with progress count — admins processing batch operations need to know it's working

## Accessibility Deep-Dive (WCAG 2.2)

### Focus Management in ASA Shells
- **Route changes in `ParentAppShell` / `EducatorAppShell`**: After wouter navigation, focus the new page's `<h1>` — screen readers don't announce SPA route changes otherwise. Set `document.title` in `useEffect` on every page component.
- **Enrollment modals**: `Dialog` and `AlertDialog` from Shadcn handle focus trapping automatically. Custom overlays (like `FileUploadModal.tsx`) must trap focus manually and return it to the trigger on close.
- **Sticky educator sidebar**: `EducatorAppShell` has a fixed sidebar. Add `scroll-padding-top: 80px` to prevent focused elements from hiding behind it when tabbing through long enrollment lists (WCAG 2.4.11).
- **Collapsible sections**: When expanding enrollment details or payment breakdowns via `Collapsible`, keep focus on the trigger — content appears below. Use `aria-expanded` on the trigger.

### ARIA Patterns for ASA Widgets
- **Enrollment data tables** (`UsersPage.tsx`, `BillingPage.tsx`): Add `aria-sort` to sortable column headers. Use `aria-label` on action dropdown triggers: "Actions for Maya Al-Rashid" not "Actions".
- **Role switcher** in `EducatorAppShell`: Uses dropdown — needs `aria-label="Switch role"` and `aria-current="true"` on active role.
- **Payment plan selector**: Radio group selecting "Pay in Full" vs "Biweekly" — use native `<input type="radio">` with `<fieldset>` + `<legend>`, not custom div-based selectors.
- **Notification bell**: Badge count needs `aria-label="3 unread notifications"` not just a visual badge.

### Keyboard Patterns for ASA
- **Admin tables**: Tab enters the table, arrow keys move between rows. Enter on a row opens detail. Escape returns focus to the table container.
- **Checkout flow**: Tab moves between form fields. Enter on "Next" advances step. Shift+Tab goes back. Escape on payment modal cancels without losing cart.
- **Custom overlays** (not using Shadcn Dialog): Must handle Escape to close and return focus — use `useEffect` with `keydown` listener for `Escape` key.

## Mobile UX (Fitts' Law Applied)

See `asa-design-system` for touch target minimums (`h-11`/`h-12`) and `asa-frontend-conventions` for iOS Safari workarounds (`fontSize: 16px`, `100dvh`).

### ASA Mobile Action Placement (Fitts' Law)
- **"Enroll Now" / "Pay" / "Add to Cart"** — sticky bottom bar (`sticky bottom-0 p-4 bg-white border-t`). Parents on phones must reach primary CTAs without scrolling back up.
- **"Cancel Enrollment" / "Delete" / "Process Refund"** — behind `DropdownMenu` or at page top. Destructive actions in the hard-to-reach zone adds natural friction (Fitts' Law).
- **Parent bottom nav** (`ParentAppShell`): 4-5 items max in thumb zone. More items → use "More" overflow menu, not smaller tap targets.

### ASA Mobile Form Patterns
- **Use `inputmode`**: `inputmode="numeric"` on phone and ZIP fields (shows number pad), `inputmode="email"` on email (shows @ key). Reduces keystrokes for parents filling enrollment forms.
- **Single-field phone/date**: Never split into area code + number. Single input with masking — split fields increase mobile errors by 40% (Baymard).
- **Sticky submit** on enrollment and payment forms: Submit button visible without scrolling. Use `sticky bottom-0` on the button container so parents always see "Submit" or "Pay Now".

## Data Display Decision Framework

| Data Characteristics | Pattern | ASA Example |
|---------------------|---------|-------------|
| <10 items, visual browsing | Card grid | Class catalog (`ProgramsParentPage`) |
| 10-50 items, comparison | Data table | Enrollment list, user management |
| 50-200 items, scanning | Table + search + filters | Admin payment history |
| 200+ items | Table + server-side pagination | Platform-wide reporting |
| Single item, detailed | Detail page (2-col layout) | Student profile, class detail |
| Status-driven data | Kanban or status-grouped list | Enrollment approvals |
| Time-series | Timeline or chronological list | Payment history, activity log |

### Table vs Card Decision
- **Tables** when users need to compare values across rows (prices, dates, statuses) — sortable columns help
- **Cards** when each item is a self-contained unit with rich content (image, description, multiple actions)
- **On mobile**: Tables with 4+ columns → convert to stacked cards or use horizontal scroll with `overflow-x-auto`

## Common Pitfalls

- **Registration form loses child medical notes on validation error** → `ChildRegistrationPage` re-renders and clears uncontrolled fields → ensure all fields use `react-hook-form` controlled values with `defaultValues` so data persists through validation cycles
- **Parent sees "$150.00" on billing page with no context** → `BillingPage` displays `payment.amount` without enrollment details → always render `enrollmentDetails[].childName` + `className` alongside every payment amount
- **Checkout traps parent after entering payment info** → `CartCheckout.tsx` step navigation only goes forward → add back-navigation on every step that preserves cart state and entered discount codes
- **School admin accidentally deletes enrollment** → delete button fires immediately without confirmation → wrap all enrollment/payment destructive actions in `AlertDialog` from `@/components/ui/alert-dialog`
- **Parent can't find October's payment in scrolling history** → `PaymentHistoryPage` uses chronological list with no search → add date range filter and pagination for financial data (not infinite scroll)
- **Action dropdown says "Actions" to screen readers** → `UsersPage.tsx` table row dropdown has no context → add `aria-label={`Actions for ${user.firstName} ${user.lastName}`}` on each `DropdownMenuTrigger`
- **Parent taps "Enroll" but class was already full** → enrollment button stays enabled after capacity reached → check class `availableSpots` and disable button with tooltip "Class is full — join waitlist" when capacity is 0

## Best Practices

### Do
- Use `AlertDialog` for all destructive enrollment/payment actions — cancel enrollment, process refund, delete user, unenroll child
- Pre-fill enrollment forms from parent profile (`useAuth()` user data) — name, phone, email, default school location
- Show child name + class name on every payment-related screen — `PaymentHistoryPage`, `BillingPage`, scheduled payment rows
- Use `inputmode="numeric"` on phone/ZIP fields and `inputmode="email"` on email fields in registration and enrollment forms
- Show step indicators with labels on checkout (`CartCheckout.tsx`) and registration (`ChildRegistrationPage.tsx`) flows
- Add `aria-label` with context on action dropdowns: "Actions for Maya Al-Rashid" not "Actions" in `UsersPage.tsx` tables
- Add `scroll-padding-top` in educator/parent shells to prevent sticky header from obscuring focused table rows
- Show "X spots remaining" inline on class cards in `ProgramsParentPage.tsx` — surface availability before click, not after
- Use `Collapsible` with `aria-expanded` for payment detail breakdowns in `PaymentHistoryPage.tsx`
- Match field widths to expected ASA input: ZIP → `w-24`, phone → `w-48`, email → full width, amount → `w-32`

### Don't
- Don't validate enrollment form fields on keystroke — wait for blur to avoid premature error display that causes 22% higher abandonment
- Don't use multi-column layouts in enrollment or registration forms — single column reduces errors by 16% (Baymard)
- Don't show technical error messages to parents — "Error 422" → "We couldn't process your enrollment — the class may be full"
- Don't auto-dismiss payment error toasts — parents need time to read the recovery suggestion before it disappears
- Don't put "Enroll Now" or "Pay" behind hamburger menus on mobile — keep primary CTAs in the thumb zone with sticky bottom bar
- Don't show payment amounts without child/class context — parents seeing "$150.00" without knowing which enrollment it's for will call support
- Don't use infinite scroll on payment history — parents looking for a specific past transaction need pagination with date filters
- Don't clear enrollment forms on validation error — retain all entered child info, medical notes, and emergency contacts
- Don't show more than 6 stat cards on school admin dashboard — each card must link to an actionable page
- Don't use `<div onClick>` for enrollment/payment actions — use `<button>` for proper keyboard access and screen reader announcement

## Key Files
- `client/src/pages/CartCheckout.tsx` — Multi-step checkout flow, reference for progressive disclosure and payment UX
- `client/src/pages/ChildRegistrationPage.tsx` — Multi-step registration wizard with form validation
- `client/src/pages/schools/UsersPage.tsx` — Data table with search, filters, and bulk actions
- `client/src/pages/ProgramsParentPage.tsx` — Card grid pattern for browsing classes
- `client/src/pages/PaymentHistoryPage.tsx` — Chronological data display with expandable details
- `client/src/pages/BillingPage.tsx` — Dashboard with stat cards and data tables
- `client/src/components/ui/alert-dialog.tsx` — Destructive action confirmation pattern
- `client/src/components/layout/ParentAppShell.tsx` — Parent navigation shell with mobile patterns
- `client/src/components/layout/EducatorAppShell.tsx` — Educator sidebar with role switching
- `client/src/hooks/use-toast.ts` — Toast notification system for feedback hierarchy
