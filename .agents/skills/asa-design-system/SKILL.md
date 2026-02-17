---
name: asa-design-system
description: Visual design system, layout patterns, component styling, page templates, micro-interactions, accessibility, and SEO for the ASA Learning Platform. Use when building new pages, styling components, creating responsive layouts, adding meta tags, or making any visual/UX decisions.
---

# ASA Design System

Inspired by best-in-class education platforms (Sawyer, Brightwheel, Enrollsy, Jackrabbit) combined with ASA's existing design language. Every page should feel clean, trustworthy, and parent-friendly.

See `asa-frontend-conventions` for Shadcn usage, TanStack Query patterns, responsive breakpoint classes, iOS/Safari workarounds, and `useToast` usage.

## Core Rules

- **Font**: Inter (400, 500, 600, 700) — loaded via Google Fonts in `client/src/index.css`
- **Primary color**: Deep blue `hsl(222 75% 33%)` — conveys trust and professionalism
- **Grid**: 8px spacing system — all spacing values should be multiples of 8 (use Tailwind `p-2`=8px, `p-4`=16px, `p-6`=24px, `p-8`=32px)
- **Border radius**: `0.5rem` (`--radius`) — consistent across all components
- **Mobile-first** — design for 375px width, enhance for tablet (768px) and desktop (1024px+)

## Color Palette & Semantic Usage

| Token | HSL | Use For |
|-------|-----|---------|
| `primary` | `222 75% 33%` | CTAs, links, active nav, primary buttons, focus rings |
| `primary/10` | — | Avatar backgrounds, subtle highlights, icon containers |
| `destructive` | `0 84% 60%` | Delete actions, error states, overdue payments, over-capacity |
| `muted` | `220 10% 94%` | Section backgrounds, disabled states, divider areas |
| `muted-foreground` | `220 10% 40%` | Secondary text, labels, timestamps, helper text |
| `green-600` | — | Success: available spots, paid status, active badges |
| `amber-500` | — | Warning: pending status, approaching capacity |

### Status Badge Colors
```
enrolled / active / paid       → bg-green-100 text-green-800
pending / pending_payment      → bg-yellow-100 text-yellow-800
waitlist                       → bg-blue-100 text-blue-800
cancelled / overdue / expired  → bg-red-100 text-red-800
completed                      → bg-gray-100 text-gray-800
```

## Typography Hierarchy

| Element | Class | Notes |
|---------|-------|-------|
| Page title | `text-2xl font-bold` or `text-3xl font-bold` | One per page |
| Section heading | `text-xl font-semibold` | Card headers, section dividers |
| Card title | `CardTitle` + `line-clamp-2` | Always clamp to prevent height variance |
| Body text | `text-sm` | Default content, form labels |
| Helper text | `text-xs text-muted-foreground` | Timestamps, metadata |
| Price | `font-semibold` | Always use `formatCurrency()` from `@/lib/utils` |

## Page Layout Templates

### Dashboard Page
- Stat cards: `grid grid-cols-2 md:grid-cols-4 gap-4` — icon in colored circle + label (muted) + value (bold)
- Content below: `grid grid-cols-1 lg:grid-cols-2 gap-6`

### List/Browse Page (Classes, Enrollments)
- Filter bar: Inside `Card` with `CardHeader` (pb-3) — search spanning 2 cols, category select in 1 col
- Card grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Each card: `flex flex-col h-full` for uniform heights

### Detail Page
- Back link: `text-sm text-muted-foreground hover:text-primary`
- Layout: `grid grid-cols-1 lg:grid-cols-3 gap-6` — details 2 cols, sidebar 1 col

### Form Page
- Max width: `max-w-2xl mx-auto` for single-column forms
- Group fields with `Card` + `CardHeader` + `CardContent`

## Card Design Patterns

### Class/Program Card
- Outer: `Card className="flex flex-col h-full hover:shadow-md transition-shadow"`
- Header: `CardTitle` + `line-clamp-2`, `Badge` for category, `CardDescription` + `line-clamp-2`
- Content: `space-y-3 text-sm` with info rows: icon (`h-4 w-4 opacity-70`) + label + right-aligned value
- Footer: Two buttons — `variant="outline"` for secondary, filled for primary CTA (`flex-1` each)

### Stat Card
- Icon container: `h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center`
- Icon: `h-6 w-6 text-primary`
- Label: `text-sm text-muted-foreground`
- Value: `text-2xl font-bold`

## Empty States & Loading

### Empty State Pattern
- Icon: `h-16 w-16 text-muted-foreground/30 mb-4`
- Title: `text-lg font-semibold mb-1`
- Description: `text-sm text-muted-foreground mb-4 max-w-md`
- CTA button when there's an action available
- Vertical padding: `py-16`

### Spinner (Inline)
- `animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full`
- Paired with `<span className="ml-2 text-muted-foreground">Loading...</span>`

### Skeleton Loading
- Use Shadcn `Skeleton` matching layout shape — render 3-6 skeleton cards in same grid

## Micro-Interactions

- **Card hover**: `hover:shadow-md transition-shadow` on all browsable cards
- **Focus ring**: `ring-ring` (matches primary) — never remove
- **Disabled**: `opacity-50 cursor-not-allowed` — built into Shadcn
- **Toasts**: Top-right, auto-dismiss 5s — see `asa-frontend-conventions` for usage

## Mobile-Specific Rules

- Navigation: Sidebar → `Sheet` hamburger (`lg:hidden` / `hidden lg:flex`)
- Tables: `overflow-x-auto` wrapper or convert to stacked cards
- Card footer buttons: `flex-col sm:flex-row` stacking
- Touch targets: Minimum 44x44px — prefer `h-11` for primary CTAs
- Forms: Single column, full-width inputs

## Accessibility

- **Contrast**: WCAG AA — 4.5:1 normal text, 3:1 large text
- **Focus**: Never remove focus rings — `ring-ring` on all interactive elements
- **Semantic HTML**: Use `<main>`, `<nav>`, `<section>`, `<article>`, `<aside>` landmarks
- **Alt text**: Descriptive on content images, `alt=""` on decorative only
- **Icon-only buttons**: Must have `aria-label`
- **Form labels**: Every input needs visible `<Label>` or `aria-label`
- **Screen reader**: `sr-only` class for visually hidden but announced text
- **Keyboard**: All elements reachable via Tab, activatable via Enter/Space
- **Heading order**: `h1` → `h2` → `h3` — never skip levels

## SEO

### Page Titles
Set via `document.title` in `useEffect` on every page:
```
Home:         American Seekers Academy - Adaptive Learning Platform
Class List:   Browse Classes - American Seekers Academy
Class Detail: {Class Name} - {Category} | American Seekers Academy
Dashboard:    Dashboard - American Seekers Academy
Login:        Sign In - American Seekers Academy
```

### Meta Tags (in `index.html`)
```html
<meta name="description" content="American Seekers Academy offers personalized learning programs for children. Browse classes, enroll online, and track your child's progress." />
<meta property="og:title" content="American Seekers Academy" />
<meta property="og:description" content="Personalized learning programs for children" />
<meta property="og:type" content="website" />
<meta property="og:image" content="/og-image.png" />
```

### Semantic Structure
- One `<h1>` per page, headings in order (never skip levels)
- Descriptive link text — avoid "click here"
- `loading="lazy"` on below-the-fold images
- Lazy-load pages with `lazy(() => import(...))` + `Suspense`

## Common Pitfalls

- **Inconsistent card heights** → cards in a grid have different heights → use `flex flex-col h-full` on every card, `flex-1` on `CardContent`
- **Text overflow on titles** → long titles push layout → use `line-clamp-2` on all `CardTitle` and `CardDescription`
- **Missing loading states** → page flashes empty then populated → always check `isLoading` and render skeleton or spinner
- **Price formatting inconsistency** → some show $9, others $9.00 → always use `formatCurrency()` from `@/lib/utils`
- **Buttons too small on mobile** → tap targets under 44px → ensure minimum `h-10`, prefer `h-11` for primary CTAs
- **Hardcoded colors** → color doesn't adapt to theme → use CSS variables or Tailwind tokens, never raw hex/hsl

## Best Practices

### Do
- Use `hover:shadow-md transition-shadow` on all browsable cards
- Use `space-y-3 text-sm` for info rows inside cards (icon + label + value)
- Use `line-clamp-2` on titles and descriptions to prevent height variance
- Use `flex flex-col h-full` on cards in grids for uniform heights
- Use semantic status badge colors (green=active, yellow=pending, red=error)
- Use `py-16` and large faded icons for empty states
- Set `document.title` on every page for SEO and browser tab clarity
- Use semantic HTML landmarks on every page
- Provide `aria-label` on icon-only buttons

### Don't
- Don't use custom CSS when Tailwind utility or Shadcn component exists
- Don't hardcode colors — use CSS variables or Tailwind tokens
- Don't use stock photos as full-width section backgrounds — use gradients or solid colors
- Don't remove focus rings — required for keyboard accessibility
- Don't skip heading levels — maintain `h1` → `h2` → `h3` order
- Don't show empty pages without feedback — always render empty state with icon + message
- Don't use generic link text ("click here") — use descriptive text

## Key Files
- `client/src/index.css` — CSS variables, color tokens, 8px grid, Radix z-index fixes
- `client/src/components/ui/` — All Shadcn components
- `client/src/components/layout/ParentAppShell.tsx` — Parent navigation shell
- `client/src/components/layout/EducatorAppShell.tsx` — Educator navigation shell
- `client/src/lib/utils.ts` — `formatCurrency()`, `formatDate()`, `cn()` utility
- `client/src/pages/ProgramsParentPage.tsx` — Reference for class card grid pattern
- `client/src/pages/BillingPage.tsx` — Reference for data display with tables and stat cards
- `tailwind.config.ts` — Tailwind theme extensions, font configuration
