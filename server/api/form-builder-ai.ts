import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { jwtCheck } from '../middleware/auth0-auth';
import { getDb } from '../db';
import { customFormFields, customForms, schools } from '@shared/schema';

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.FORM_BUILDER_AI_RATE_LIMIT
    ? parseInt(process.env.FORM_BUILDER_AI_RATE_LIMIT, 10)
    : process.env.CI === 'true' || process.env.NODE_ENV === 'test'
      ? 5
      : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment before asking again.' },
});

let anthropic: Anthropic | null = null;
try {
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
} catch (error) {
  console.error('Failed to initialize Anthropic for form builder AI:', error);
}

const MODEL = 'claude-sonnet-4-20250514';

const ALLOWED_FIELD_TYPES = [
  'text', 'textarea', 'email', 'phone', 'number', 'date', 'dropdown',
  'radio', 'checkbox', 'multi_checkbox', 'file_upload',
] as const;

const draftFieldSchema = z.object({
  fieldType: z.enum(ALLOWED_FIELD_TYPES),
  label: z.string().min(1),
  placeholder: z.string().nullable().optional(),
  helpText: z.string().nullable().optional(),
  isRequired: z.boolean().optional(),
  order: z.number().optional(),
  fieldConfig: z.record(z.any()).optional(),
  validationRules: z.record(z.any()).optional(),
});

export const formDraftSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  fields: z.array(draftFieldSchema).min(1),
  settings: z
    .object({
      confirmationMessage: z.string().optional(),
      allowMultipleSubmissions: z.boolean().optional(),
      notifyOnSubmission: z.boolean().optional(),
    })
    .optional(),
});

export type FormDraft = z.infer<typeof formDraftSchema>;

const FORM_BUILDER_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_templates',
    description: 'List available form templates for this school platform (title, slug, form type).',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_current_form',
    description: 'Load the current form being edited, including existing fields.',
    input_schema: {
      type: 'object' as const,
      properties: {
        formId: { type: 'number', description: 'Form ID currently open in the editor' },
      },
      required: ['formId'],
    },
  },
  {
    name: 'propose_form_draft',
    description:
      'Propose a complete form draft for admin review. Does NOT save or publish. Prefer email, phone, and name fields for contact/interest forms. Use only allowed field types.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        confirmationMessage: { type: 'string' },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fieldType: { type: 'string', enum: [...ALLOWED_FIELD_TYPES] },
              label: { type: 'string' },
              placeholder: { type: 'string' },
              helpText: { type: 'string' },
              isRequired: { type: 'boolean' },
              options: {
                type: 'array',
                items: { type: 'string' },
                description: 'For dropdown/radio/multi_checkbox',
              },
            },
            required: ['fieldType', 'label'],
          },
        },
      },
      required: ['fields'],
    },
  },
  {
    name: 'clone_template_into_draft',
    description: 'Seed a draft from an existing template slug (fields copied into draft only).',
    input_schema: {
      type: 'object' as const,
      properties: {
        templateSlug: { type: 'string' },
      },
      required: ['templateSlug'],
    },
  },
];

function buildSystemPrompt(schoolName: string): string {
  return `You are the Form Smart Builder for ${schoolName} on the ASA Learning Platform.

You help school admins design custom forms via conversation. You propose drafts for review — you never publish or set forms active/public.

Rules:
- Ask clarifying questions when the request is vague
- Prefer practical field types: text, email, phone, textarea, dropdown, checkbox, file_upload
- Always include an email field when collecting contact info
- Keep labels clear and parent-friendly
- When ready, call propose_form_draft with the full field list
- Do not invent field types outside the allowed list
- Do not claim the form was saved or published

Allowed field types: ${ALLOWED_FIELD_TYPES.join(', ')}`;
}

async function executeTool(
  name: string,
  input: any,
  ctx: { schoolId: number; formId?: number },
): Promise<{ result: unknown; draft?: FormDraft }> {
  const db = await getDb();

  if (name === 'list_templates') {
    const templates = await db
      .select({
        id: customForms.id,
        title: customForms.title,
        slug: customForms.slug,
        formType: customForms.formType,
        description: customForms.description,
      })
      .from(customForms)
      .where(eq(customForms.isTemplate, true))
      .orderBy(desc(customForms.createdAt))
      .limit(20);
    return { result: { templates } };
  }

  if (name === 'get_current_form') {
    const formId = Number(input.formId || ctx.formId);
    const [form] = await db.select().from(customForms).where(eq(customForms.id, formId));
    if (!form || (form.schoolId !== ctx.schoolId && !form.isTemplate)) {
      return { result: { error: 'Form not found' } };
    }
    const fields = await db
      .select()
      .from(customFormFields)
      .where(eq(customFormFields.formId, formId))
      .orderBy(customFormFields.order);
    return {
      result: {
        id: form.id,
        title: form.title,
        description: form.description,
        accessLevel: form.accessLevel,
        isActive: form.isActive,
        fields: fields.map((f: typeof fields[number]) => ({
          id: f.id,
          fieldType: f.fieldType,
          label: f.label,
          isRequired: f.isRequired,
          order: f.order,
        })),
      },
    };
  }

  if (name === 'propose_form_draft') {
    const fields = (input.fields || []).map((f: any, index: number) => ({
      fieldType: f.fieldType,
      label: f.label,
      placeholder: f.placeholder ?? null,
      helpText: f.helpText ?? null,
      isRequired: f.isRequired ?? false,
      order: index,
      fieldConfig: f.options?.length ? { options: f.options } : {},
      validationRules: {},
    }));
    const draft = formDraftSchema.parse({
      title: input.title,
      description: input.description ?? null,
      fields,
      settings: input.confirmationMessage
        ? { confirmationMessage: input.confirmationMessage }
        : undefined,
    });
    return { result: { ok: true, draft }, draft };
  }

  if (name === 'clone_template_into_draft') {
    const [template] = await db
      .select()
      .from(customForms)
      .where(and(eq(customForms.slug, input.templateSlug), eq(customForms.isTemplate, true)));
    if (!template) return { result: { error: 'Template not found' } };
    const fields = await db
      .select()
      .from(customFormFields)
      .where(eq(customFormFields.formId, template.id))
      .orderBy(customFormFields.order);
    const draft = formDraftSchema.parse({
      title: template.title,
      description: template.description,
      fields: fields.map((f: typeof fields[number], index: number) => ({
        fieldType: f.fieldType as any,
        label: f.label,
        placeholder: f.placeholder,
        helpText: f.helpText,
        isRequired: f.isRequired,
        order: index,
        fieldConfig: (f.fieldConfig as object) || {},
        validationRules: (f.validationRules as object) || {},
      })),
    });
    return { result: { ok: true, draft }, draft };
  }

  return { result: { error: `Unknown tool: ${name}` } };
}

/** Test-only: when FORM_BUILDER_AI_MOCK=1, return a deterministic draft without Claude. */
function mockDraftResponse(message: string): { reply: string; draft: FormDraft } {
  const draft = formDraftSchema.parse({
    title: 'Interest Form',
    description: `Draft from: ${message.slice(0, 80)}`,
    fields: [
      { fieldType: 'text', label: 'Parent Name', isRequired: true, order: 0 },
      { fieldType: 'email', label: 'Email', isRequired: true, order: 1 },
      { fieldType: 'phone', label: 'Phone', isRequired: false, order: 2 },
      {
        fieldType: 'dropdown',
        label: 'Preferred Days',
        isRequired: false,
        order: 3,
        fieldConfig: { options: ['Monday', 'Wednesday', 'Friday'] },
      },
      { fieldType: 'textarea', label: 'Comments', isRequired: false, order: 4 },
    ],
    settings: { confirmationMessage: 'Thanks for your interest!' },
  });
  return {
    reply: 'Here is a draft interest form for your review. Click **Apply draft** to add these fields to the editor. The form will not be published until you set it Active and Public.',
    draft,
  };
}

router.post('/chat', chatLimiter, jwtCheck, async (req: any, res) => {
  try {
    const schoolId = req.auth?.schoolId;
    if (!schoolId) {
      return res.status(400).json({ error: 'No school associated with user' });
    }

    const bodySchema = z.object({
      message: z.string().min(1).max(2000),
      formId: z.number().optional(),
      history: z
        .array(
          z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string(),
          }),
        )
        .max(20)
        .optional(),
    });
    const { message, formId, history = [] } = bodySchema.parse(req.body);

    if (process.env.FORM_BUILDER_AI_MOCK === '1' || process.env.FORM_BUILDER_AI_MOCK === 'true') {
      const mocked = mockDraftResponse(message);
      return res.json({
        reply: mocked.reply,
        draft: mocked.draft,
        aiAvailable: true,
        mocked: true,
      });
    }

    if (!anthropic) {
      return res.status(503).json({
        error: 'AI service temporarily unavailable',
        aiAvailable: false,
        fallbackResponse:
          'The Form Smart Builder is unavailable right now. Use Add Field in the editor, or try again later.',
      });
    }

    const db = await getDb();
    const [school] = await db
      .select({ name: schools.name })
      .from(schools)
      .where(eq(schools.id, schoolId));
    const schoolName = school?.name || 'your school';

    const systemPrompt = buildSystemPrompt(schoolName);
    const messages: Anthropic.MessageParam[] = [
      ...history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: message },
    ];

    let draft: FormDraft | undefined;
    let response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools: FORM_BUILDER_TOOLS,
      messages,
    });

    let iterations = 0;
    const maxIterations = 5;
    while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
      iterations += 1;
      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const { result, draft: toolDraft } = await executeTool(toolUse.name, toolUse.input, {
          schoolId,
          formId,
        });
        if (toolDraft) draft = toolDraft;
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        tools: FORM_BUILDER_TOOLS,
        messages,
      });
    }

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    res.json({
      reply: reply || 'Draft ready for your review.',
      draft: draft ?? null,
      aiAvailable: true,
    });
  } catch (error) {
    console.error('Form builder AI error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    if ((error as any)?.status === 429) {
      return res.status(429).json({ error: 'AI rate limited. Please try again shortly.' });
    }
    res.status(500).json({ error: 'Failed to process form builder chat' });
  }
});

export default router;
