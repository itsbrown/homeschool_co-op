---
name: asa-ai-integration
description: Anthropic Claude AI integration patterns, AI assistant implementations (enrollment, payment help, smart tutorial), content analysis, knowledge base processing, and prompt construction for the ASA Learning Platform. Use when working with AI-powered features, Claude API calls, system prompts, content generation, or any AI assistant functionality.
---

# ASA AI Integration

## Core Rules

- **Anthropic Claude only** — all AI features use Claude (`claude-3-7-sonnet-20250219`) via the `@anthropic-ai/sdk` package
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

### 5. Curriculum & Lesson Generation
- **Functions**: `generateCurriculumPlan()`, `generateLessonPlan()`, `analyzeStudentWork()`
- **Purpose**: AI-powered curriculum planning, lesson plan creation, student work feedback
- **Max tokens**: 2048–3000 depending on generation type

### 6. CFO Insights
- **Service**: `cfoInsightsService.ts`
- **Purpose**: Financial analytics and insights for school administrators

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

## Common Pitfalls

- **AI unavailable crashes endpoint** → didn't check `isAvailable()` before calling → always check and return 503 with helpful message
- **Rate limit not applied** → AI endpoint gets hammered → add `express-rate-limit` middleware to every AI route
- **Stale context in conversation** → parent's data changed mid-conversation but context wasn't refreshed → re-fetch context on each message, don't cache between turns
- **Token limit exceeded** → long conversation history causes API error → truncate history to last N messages or summarize older turns
- **Missing API key in production** → `ANTHROPIC_API_KEY` not set → graceful degradation, log warning, return user-friendly error

## Best Practices

### Do
- Always check `anthropicService.isAvailable()` or verify `anthropic` is not null before making API calls
- Always apply rate limiting on AI endpoints (15–20 req/min per user)
- Always inject fresh user context on every message — don't rely on cached data from earlier in the conversation
- Always include behavioral constraints in system prompts (one step at a time, bold buttons, etc.)
- Always handle Anthropic API errors gracefully — return a user-friendly fallback message
- Always use the centralized `anthropicService` for non-conversational AI calls (content generation, analysis)

### Don't
- Don't expose raw Anthropic errors to users — catch and return friendly messages
- Don't skip rate limiting on any AI endpoint — even internal ones
- Don't let conversation history grow unbounded — truncate or summarize after ~20 messages
- Don't hardcode the model name in multiple places — use a constant (`MODEL = 'claude-3-7-sonnet-20250219'`)
- Don't inject sensitive data (passwords, payment details, full SSNs) into AI prompts — only contextually relevant info
- Don't use AI for authoritative decisions (enrollment approval, payment processing) — AI is advisory only

## Key Files
- `server/services/anthropic.ts` — centralized AnthropicService class, `generateContent()`, availability check
- `server/services/anthropicService.ts` — additional Anthropic service utilities
- `server/services/enrollmentAI.ts` — enrollment assistant AI logic and prompt construction
- `server/api/enrollment-assistant.ts` — enrollment assistant API endpoint
- `server/api/payment-help.ts` — payment help assistant API endpoint
- `server/api/smart-tutorial.ts` — smart tutorial system API endpoint
- `server/services/aiContentAnalyzer.ts` — document content analysis
- `server/services/knowledgeBaseProcessor.ts` — knowledge base document processing
- `server/services/curriculumService.ts` — curriculum and lesson plan generation
- `server/services/cfoInsightsService.ts` — financial insights generation
