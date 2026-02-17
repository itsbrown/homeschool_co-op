---
name: asa-skill-standards
description: Quality standards and required structure for all ASA Learning Platform agent skills. Use when creating or updating any skill in the .agents/skills/ directory to ensure consistency, completeness, and best practices across all skills.
---

# ASA Skill Quality Standards

This is a meta-skill that defines the required structure, writing style, and checklist for every ASA Learning Platform skill. Follow these standards when creating or updating any skill.

## Required Structure

Every ASA skill must follow this template:

```
---
name: asa-{topic-name}
description: {What it covers}. {When to use it — specific trigger phrases}.
---

# {Title}

## Core Rules / Conventions
Top-level rules that apply broadly to this domain.

## {Domain-Specific Sections}
Detailed patterns, schemas, workflows, data models — whatever is relevant.

## Common Pitfalls
Known mistakes and how to avoid them.

## Best Practices
### Do
- Actionable "always do this" items
### Don't
- Specific anti-patterns to avoid

## Key Files
- Bulleted list of the most important files with brief descriptions
```

## Frontmatter Rules

- **`name`**: Lowercase, hyphens only, prefixed with `asa-`. Max 64 chars.
  - Good: `asa-frontend-conventions`
  - Bad: `ASA_Frontend`, `frontend-conventions`
- **`description`**: Max 1024 chars. Must include:
  1. WHAT the skill covers (comma-separated topics)
  2. WHEN to use it (specific trigger scenarios)
  - Good: `"Stripe payment integration, payment plan types, and billing patterns. Use when working with checkout flows, payment plans, or any financial logic."`
  - Bad: `"Handles payments"` (too vague, no triggers)

## Section Requirements

### Core Rules (Required)
- 3–6 bullet points covering the most critical, non-obvious rules
- Each rule should prevent a real mistake or enforce a real convention
- Keep brief — one line per rule with bold key term

### Domain-Specific Sections (Required, 2+ sections)
- Cover the actual patterns, schemas, workflows, or data models
- Use code blocks for schemas, data structures, and flow diagrams
- Use tables for mappings, enums, or quick reference
- Include inline code for field names, function names, file paths

### Common Pitfalls (Required)
- At least 3 pitfalls that have actually caused bugs or confusion
- Format: **Bold symptom** → cause → fix (one line each)

### Best Practices (Required)
- Split into **Do** and **Don't** subsections
- At least 5 items in each
- Every item must be actionable (start with a verb)
- Items should be specific to this project, not generic advice
  - Good: "Always use `authData.dbUserId` (integer) for database queries"
  - Bad: "Always write clean code"

### Key Files (Required)
- List the 5–10 most important files for this domain
- Format: `` `path/to/file.ts` — brief purpose ``
- Files must actually exist in the codebase

## Writing Style

- **Concise**: One idea per bullet point. No filler words.
- **Specific**: Use actual field names, function names, file paths from this project.
- **Imperative**: "Use X" not "You should use X" or "It is recommended to use X."
- **No generic advice**: Every line should be specific to the ASA Learning Platform. If it could apply to any project, it probably doesn't belong.
- **Use em dashes** (—) for inline explanations, not parenthetical asides.
- **Bold key terms** at the start of bullet points for scannability.
- **Code references**: Use inline code for field names (`parentId`), function names (`apiRequest`), and file paths (`server/storage.ts`).

## Content Rules

- **Only document what's non-obvious** — skip things any developer would know
- **Document project-specific conventions** — naming, patterns, architectural decisions unique to ASA
- **Include the "why"** for rules that seem arbitrary
- **Keep under 250 lines** per skill — if longer, split into sub-files in the skill directory
- **No duplicating content across skills** — reference other skills instead (e.g., "See asa-auth-patterns for API request conventions")
- **Update, don't append** — when patterns change, update the existing content rather than adding contradictory new sections

## Pre-Publish Checklist

Before finalizing any skill, verify:

- [ ] Frontmatter has valid `name` (asa- prefix, lowercase-hyphens) and descriptive `description` with triggers
- [ ] Has Core Rules section with 3–6 critical rules
- [ ] Has at least 2 domain-specific sections with real patterns/schemas
- [ ] Has Common Pitfalls section with 3+ real pitfalls
- [ ] Has Best Practices with Do (5+) and Don't (5+) subsections
- [ ] Has Key Files section listing 5–10 actual project files
- [ ] All file paths, function names, and field names are accurate
- [ ] No generic advice — every line is ASA-specific
- [ ] Under 250 lines
- [ ] No content duplicated from other skills

## Existing Skills Reference

| Skill | Domain |
|-------|--------|
| `asa-database-patterns` | Schema, storage interface, dates, migrations |
| `asa-auth-patterns` | Supabase auth, multi-role, API requests, multi-tenant security |
| `asa-payment-patterns` | Stripe, payment plans, cart pricing, discounts, refunds |
| `asa-frontend-conventions` | UI components, TanStack Query, forms, iOS/Safari, layout shells |
| `asa-testing-deployment` | Workflows, port binding, testing patterns, deployment |
