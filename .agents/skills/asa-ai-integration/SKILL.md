---
name: asa-ai-integration
description: Anthropic Claude AI integration patterns, AI assistant implementations (enrollment, payment help, smart tutorial, parent concierge), content analysis, knowledge base processing, and prompt construction for the ASA Learning Platform. Use when working with AI-powered features, Claude API calls, system prompts, content generation, or any AI assistant functionality.
---

# ASA AI Integration

## Core Rules

- **Anthropic Claude only** — all AI features use Claude via the `@anthropic-ai/sdk` package
- **Model constants** — conversational assistants use `claude-sonnet-4-20250514`; content generation uses `claude-3-7-sonnet-20250219` via centralized service
- **API key**: `ANTHROPIC_API_KEY` env var — checked at initialization, features gracefully degrade if unavailable
- **Rate limiting required** on all AI endpoints — use `express-rate-limit` (typically 15–20 requests/minute per user); see `asa-auth-patterns` for general API request conventions
- **Always check `isAvailable()`** before calling the Anthropic service — return a helpful fallback message if unavailable
- **File processing** — knowledge base AI features depend on file uploads; see `asa-file-storage` for upload patterns
- **System prompts define behavior** — each assistant has a tailored system prompt with strict behavioral rules

## Anthropic Service Layer

### Centralized Service (`server/services/anthropic.ts`)
```typescript
import { anthropicService } from '../services/anthropic';

if (!anthropicService.isAvailable()) {
  return res.status(503).json({ error: 'AI service temporarily unavailable' });
}

const response = await anthropicService.generateContent(prompt, useJson, maxTokens);
```
- Singleton `AnthropicService` class wraps the Anthropic SDK
- `generateContent(prompt, useJson?, maxTokens?)` — primary method for all AI calls
- Handles initialization failures gracefully — logs warning, returns unavailable status
- Used by curriculum generation, lesson planning, student feedback, and content analysis

### Direct SDK Usage (Assistants)
Some assistants instantiate Anthropic directly for streaming or conversation history:
```typescript
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const response = await anthropic.messages.create({
  model: MODEL,
  max_tokens: 2048,
  system: SYSTEM_PROMPT,
  messages: conversationHistory,
});
```

## AI Assistants

### 1. Enrollment Assistant
- **Purpose**: Guides parents through class discovery and enrollment
- **Endpoint**: `POST /api/enrollment-assistant/message`
- **Context injected**: Parent's children (names, ages, grade levels), available classes, enrollment status
- **Conversation history**: Passed in request body as `history` array
- **Key behavior**: Recommends classes based on child age/interests, explains pricing, guides through cart flow

### 2. Payment Help Assistant
- **Purpose**: Helps parents understand billing, resolve checkout issues, answer payment questions
- **Endpoint**: `POST /api/payment-help/chat`
- **Context injected**: Membership status, outstanding balance, payment plans, upcoming scheduled payments
- **Key behavior**: Explains why totals are higher than expected (membership fee), payment plan options, next payment dates
- **Rate limit**: 15 requests/minute

### 3. Smart Tutorial System
- **Purpose**: Walks parents through platform tasks one step at a time
- **Endpoint**: `POST /api/smart-tutorial/chat`
- **Context injected**: Current page path, user role, available actions on the page
- **Key behavior**: Gives ONE step at a time (never multiple), uses bold for clickable elements, celebrates progress
- **Rate limit**: 20 requests/minute
- **Page context interface**:
  ```typescript
  interface PageContext {
    currentPath: string;
    userRole: string;
    availableActions: string[];
    pageTitle?: string;
  }
  ```

### 4. Content Analysis & Knowledge Base
- **Services**: `aiContentAnalyzer.ts`, `knowledgeBaseProcessor.ts`, `knowledgeBaseExtraction.ts`
- **Purpose**: Analyzes uploaded documents, extracts key concepts, generates summaries
- **Used by**: Knowledge base system for processing uploaded PDFs and documents
- **Content extraction priority** — see "Knowledge Base Content Extraction" section below

### 5. Curriculum & Lesson Generation
- **Functions**: `generateCurriculumPlan()`, `generateLessonPlan()`, `analyzeStudentWork()`
- **Purpose**: AI-powered curriculum planning, lesson plan creation, student work feedback
- **Max tokens**: 2048–3000 depending on generation type

### 6. CFO Insights
- **Service**: `cfoInsightsService.ts`
- **Purpose**: Financial analytics and insights for school administrators

### 7. Parent concierge (Phase 1)
- **Purpose**: Chat for enrollment questions, and for a signed-in parent's own family, published week materials, and free event RSVPs. It does not take payment, open a cart, or register a child.
- **Endpoint**: `POST /api/concierge/chat` (mounted from `server/index.ts`)
- **Model**: Vercel AI SDK `generateText` through AI Gateway. Default model id `anthropic/claude-sonnet-4.5` (`AI_GATEWAY_MODEL` overrides). `CONCIERGE_AI_MOCK=1` never calls the gateway.
- **Env names**: `AI_GATEWAY_API_KEY`, `AI_GATEWAY_MODEL`, `CONCIERGE_LEAD_EMAIL`, `CONCIERGE_AI_MOCK`. SendGrid uses the existing `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL`. Do not commit values.
- **Rate limit**: 20 requests/minute (1000 when `NODE_ENV=test`)
- **Pages**: `/concierge` is public. `/parent/concierge` is inside `ParentAppShell`.
- **Frontend**: `client/src/pages/ParentConciergePage.tsx` (plain React text, no `dangerouslySetInnerHTML`)
- **Backend**: `server/services/concierge/*` and `server/api/concierge-chat.ts`
- **Tools** (server ignores model-supplied parent, user, email, and child ids; session user and `users.school_id` only):
  1. `get_my_family` — children in that school where `parent_id` or `child_guardians.guardian_user_id` is `req.user.id`. A `childId` outside that set is refused before any family payload is returned.
  2. `get_week_materials` — published week-plan blocks for those children's enrolled classes at that school. Same `childId` check, before plans are loaded.
  3. `rsvp_event` — $0 store RSVP only when `store_products.school_id` is the parent's school. The product is not loaded by id alone. Any enabled attendee price above 0 is a handoff. No Stripe.
  4. `start_enrollment_inquiry` — SendGrid lead to Corey via `sendConciergeLeadEmail`. No Brevo fallback. No enrollment row.
- **Anonymous**: public `/concierge` posts with no session. The server answers from the enrollment corpus (and the inquiry tool). Family tools are not executed.
- **Preview demo**: `PREVIEW_DEMO_MODE` plus `VERCEL=1`. Refuse `REPLIT_DEPLOYMENT`, any `REPL_ID`-style env, and a production-looking `DATABASE_URL`. Do not require `VERCEL_ENV=preview`.
- **Sensitive text** (payment, medical, custody, enrollment change, child registration) returns a handoff and does not call the model.
- **Analytics**: `concierge_events` (`server/migrations/268-concierge-events.sql`), SQL only, after `267-platform-schools.sql`. Never `db:push`. Not `user_activity_events`.
- **Do not mount** `server/api/parent-concierge.ts`. That file is the old unmounted Anthropic router (`check_payments`, `check_credits`, `add_to_cart`, `register_child`). It is not this concierge.
- **Routing rule**: "Browse on your own" points to `/parent/home` when the parent is signed in.

### 8. Form Smart Builder
- **Purpose**: School-admin conversational form designer — proposes field drafts for review; never auto-publishes
- **Endpoint**: `POST /api/form-builder-ai/chat` (mounted in `routes.ts`)
- **Apply**: `POST /api/custom-forms/forms/:formId/apply-draft` — writes fields; does not set `isActive` / public
- **Model**: `claude-sonnet-4-20250514` (tool-use); E2E uses `FORM_BUILDER_AI_MOCK=1`
- **Rate limit**: 20/min (5 in CI via `FORM_BUILDER_AI_RATE_LIMIT`)
- **Frontend**: `FormSmartBuilderPanel` on `FormEditorPage`
- **Tools**: `list_templates`, `get_current_form`, `propose_form_draft`, `clone_template_into_draft`
- **Safety**: Draft-only until admin Apply; no MCP — in-app Claude tools like Parent Concierge

## Knowledge Base Content Extraction

### Priority Chain for `extractContextFromKnowledgeBases()`
The `knowledgeBaseProcessor.extractContextFromKnowledgeBases()` method extracts content for AI context (used by the concierge's `search_knowledge_base` tool). It follows this priority order:

1. **`aiInsights`** (best quality) — pre-processed summaries, topics, concepts from AI analysis during upload. Contains `fileAnalyses[]` with per-file summaries, `combinedTopics`, `primarySubjects`, `suggestedGradeLevel`
2. **`aiAnalysis`** — older AI analysis format with `summary`, `keyTopics`, `extractedText`
3. **`files[].extractedText`** — text previously extracted and stored in the file record
4. **Raw file extraction** (fallback) — reads file content directly:
   - `/uploads/*.txt` → read as UTF-8 text
   - `/uploads/*.pdf` → parse with `pdf-parse` library
   - `data:application/pdf;base64,...` → decode base64, parse with `pdf-parse`
   - `data:text/*;base64,...` → decode base64, read as UTF-8
   - Object Storage paths (`/objects/.private/...`) → **cannot be read from disk** — these require the Object Storage sidecar API

### Current Reality
- Most knowledge bases have `aiProcessed=false` and no `aiInsights` populated
- The raw file extraction fallback is therefore **critical** for content access
- KB files exist in three storage formats (see `asa-file-storage` skill for details):
  - Base64 data URIs in the `files` JSON column
  - Local paths in `/uploads/`
  - Object Storage paths (less common for KBs)
- Per-file content is capped at 3000 characters to keep AI context manageable

### pdf-parse Library Gotcha
The `pdf-parse` npm package has a known ESM/tsx compatibility bug:
```typescript
// BAD — crashes at import time in tsx/ESM environments
import pdfParse from 'pdf-parse';

// GOOD — dynamic import of internal module avoids the startup crash
const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
```
The root cause: `pdf-parse/index.js` checks `!module.parent` to detect "debug mode" and tries to read a test PDF file from disk. In ESM/tsx environments `module.parent` is null, so it always triggers.

## System Prompt Patterns

All AI assistants follow a consistent prompt structure:
1. **Role definition** — who the AI is and what platform it serves
2. **Context injection** — actual user data (children, payments, classes) inserted into the prompt
3. **Critical rules** — numbered behavioral constraints (one step at a time, use bold for buttons, etc.)
4. **Common scenarios** — pre-defined Q&A patterns for frequent questions
5. **Tone guidance** — warm, encouraging, simple language, no jargon

### Context Injection Pattern
```typescript
const contextBlock = `
PARENT'S CONTEXT:
- Children: ${children.map(c => `${c.name} (age ${c.age})`).join(', ')}
- Membership: ${membership.status}
- Outstanding balance: $${(balance / 100).toFixed(2)}
`;

const messages = [
  { role: 'user', content: `${contextBlock}\n\nUser question: ${userMessage}` }
];
```

## Parent concierge (Phase 1, not the Anthropic router)

Implemented: `docs/parent-concierge/ADR-001.md`. Express route `POST /api/concierge/chat`. Vercel AI SDK and AI Gateway (this repo is Vite + Express, not Next.js). Tools are only `get_my_family`, `get_week_materials`, `rsvp_event`, and `start_enrollment_inquiry`. Leads go to Corey via SendGrid (`sendConciergeLeadEmail`). No Stripe, no cart, no child marketing profile. Local fake seed: `npx tsx scripts/seed-concierge-local.ts` with `CONCIERGE_LOCAL_DATABASE_URL`.

`server/api/parent-concierge.ts` is **not mounted** and does not follow that ADR (direct Anthropic, payment and cart tools). Do not mount it. Other assistants stay on `@anthropic-ai/sdk` until an ADR moves them.

Vercel preview only: `docs/parent-concierge/preview.md`. `PREVIEW_DEMO_MODE=1` uses in-memory fake families and does not call Supabase. Do not set that flag on the Replit production VM. Do not change `npm run build` or `npm start` for the preview; those remain the Replit scripts.

## Common Pitfalls

- **AI unavailable crashes endpoint** → didn't check `isAvailable()` before calling → always check and return 503 with helpful message
- **Rate limit not applied** → AI endpoint gets hammered → add `express-rate-limit` middleware to every AI route
- **Stale context in conversation** → parent's data changed mid-conversation but context wasn't refreshed → re-fetch context on each message, don't cache between turns
- **Token limit exceeded** → long conversation history causes API error → truncate history to last N messages or summarize older turns
- **Missing API key in production** → `ANTHROPIC_API_KEY` not set → graceful degradation, log warning, return user-friendly error
- **KB content empty despite files existing** → `aiProcessed` is false and file extraction not handling the storage format → ensure `extractContentFromFile` handles data URIs, PDFs, and `/uploads/` paths
- **pdf-parse crashes server on startup** → top-level import triggers test file read → use dynamic import of `pdf-parse/lib/pdf-parse.js` (see Knowledge Base section)
- **XSS from AI content** → used `dangerouslySetInnerHTML` with AI-generated text → use safe React rendering, never trust AI output as raw HTML
- **Concierge routing loop** → "Browse on your own" links point to `/dashboard` which is the concierge itself → always link to `/parent/home` for the legacy dashboard
- **Mounting `parent-concierge.ts` to ship ADR-001** → that router is unmounted, calls Anthropic, and exposes payments → new Express route, AI Gateway, tools in the ADR only

## Best Practices

### Do
- Always check `anthropicService.isAvailable()` or verify `anthropic` is not null before making API calls
- Always apply rate limiting on AI endpoints (15–20 req/min per user)
- Always inject fresh user context on every message — don't rely on cached data from earlier in the conversation
- Always include behavioral constraints in system prompts (one step at a time, bold buttons, etc.)
- Always handle Anthropic API errors gracefully — return a user-friendly fallback message
- Always use the centralized `anthropicService` for non-conversational AI calls (content generation, analysis)
- Always use dynamic import for `pdf-parse` — `(await import('pdf-parse/lib/pdf-parse.js')).default`
- Always sanitize AI-generated content before rendering — never use `dangerouslySetInnerHTML`

### Don't
- Don't expose raw Anthropic errors to users — catch and return friendly messages
- Don't skip rate limiting on any AI endpoint — even internal ones
- Don't let conversation history grow unbounded — truncate or summarize after ~20 messages
- Don't hardcode the model name in multiple places — use a constant (e.g., `MODEL = 'claude-sonnet-4-20250514'`)
- Don't inject sensitive data (passwords, payment details, full SSNs) into AI prompts — only contextually relevant info
- Don't use AI for authoritative decisions (enrollment approval, payment processing) — AI is advisory only
- Don't import `pdf-parse` at the top level — it crashes in ESM/tsx environments
- Don't assume KBs have `aiInsights` populated — always implement the full fallback chain

## Key Files
- `server/services/anthropic.ts` — centralized AnthropicService class, `generateContent()`, availability check
- `server/services/anthropicService.ts` — additional Anthropic service utilities
- `server/services/enrollmentAI.ts` — enrollment assistant AI logic and prompt construction
- `server/api/enrollment-assistant.ts` — enrollment assistant API endpoint
- `server/api/payment-help.ts` — payment help assistant API endpoint
- `server/api/smart-tutorial.ts` — smart tutorial system API endpoint
- `server/api/concierge-chat.ts` — Phase 1 parent concierge route
- `server/services/concierge/` — tools, guardrails, gateway/mock chat, analytics
- `server/api/parent-concierge.ts` — unmounted Anthropic router; do not mount
- `client/src/pages/ParentConciergePage.tsx` — chat-first concierge page
- `server/services/aiContentAnalyzer.ts` — document content analysis
- `server/services/knowledgeBaseProcessor.ts` — knowledge base document processing, content extraction
- `server/services/knowledgeBaseExtraction.ts` — knowledge base extraction utilities
- `server/services/curriculumService.ts` — curriculum and lesson plan generation
- `server/services/cfoInsightsService.ts` — financial insights generation
