import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, Send, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export type FormDraftField = {
  fieldType: string;
  label: string;
  placeholder?: string | null;
  helpText?: string | null;
  isRequired?: boolean;
  order?: number;
  fieldConfig?: Record<string, unknown>;
  validationRules?: Record<string, unknown>;
};

export type FormDraft = {
  title?: string;
  description?: string | null;
  fields: FormDraftField[];
  settings?: Record<string, unknown>;
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type Props = {
  formId: number;
  onDraftApplied: () => void;
};

export default function FormSmartBuilderPanel({ formId, onDraftApplied }: Props) {
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest(
        'POST',
        '/api/form-builder-ai/chat',
        {
          message,
          formId,
          history,
        },
        { passthroughStatuses: [503, 429] },
      );
      const data = await response.json();
      if (!response.ok) {
        return { ...data, _status: response.status };
      }
      return data;
    },
    onSuccess: (data, message) => {
      if (data._status === 503 || data.aiAvailable === false) {
        setAiUnavailable(true);
        setHistory((prev) => [
          ...prev,
          { role: 'user', content: message },
          {
            role: 'assistant',
            content: data.fallbackResponse || data.error || 'AI unavailable',
          },
        ]);
        return;
      }
      if (data._status === 429) {
        toast({
          title: 'Slow down',
          description: data.error || 'Too many requests. Please wait a moment.',
          variant: 'destructive',
        });
        return;
      }
      setAiUnavailable(false);
      setHistory((prev) => [
        ...prev,
        { role: 'user', content: message },
        { role: 'assistant', content: data.reply || 'Draft ready.' },
      ]);
      if (data.draft?.fields?.length) {
        setDraft(data.draft);
      }
    },
    onError: (error: any) => {
      const msg = error?.message || 'Failed to chat with Smart Builder';
      if (String(msg).includes('503') || String(msg).toLowerCase().includes('unavailable')) {
        setAiUnavailable(true);
      }
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('No draft to apply');
      const response = await apiRequest('POST', `/api/custom-forms/forms/${formId}/apply-draft`, {
        title: draft.title,
        description: draft.description,
        fields: draft.fields,
        settings: draft.settings,
        replaceExisting: true,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Draft applied',
        description: `${data.fields?.length || 0} fields added. Form is not published until you set Active + Public.`,
      });
      onDraftApplied();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to apply draft',
        variant: 'destructive',
      });
    },
  });

  const send = () => {
    const message = input.trim();
    if (!message || chatMutation.isPending) return;
    setInput('');
    chatMutation.mutate(message);
  };

  return (
    <Card data-testid="form-smart-builder">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>AI Smart Builder</CardTitle>
        </div>
        <CardDescription>
          Describe the form you need. Review the draft, then apply it to the editor. Nothing is published automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {aiUnavailable && (
          <div
            className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            data-testid="smart-builder-fallback"
          >
            Smart Builder is unavailable. Use Add Field manually, or try again later.
          </div>
        )}

        <div
          className="max-h-48 space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm"
          data-testid="smart-builder-history"
        >
          {history.length === 0 && (
            <p className="text-muted-foreground">
              Example: “Fall 2026 Victor interest form — parent name, email, kids’ ages, preferred days, comments”
            </p>
          )}
          {history.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-foreground' : 'text-muted-foreground'}>
              <span className="font-medium">{m.role === 'user' ? 'You' : 'Builder'}: </span>
              {m.content}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe the form…"
            className="min-h-[72px]"
            data-testid="input-smart-builder-message"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button
            onClick={send}
            disabled={chatMutation.isPending || !input.trim()}
            data-testid="button-smart-builder-send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {draft && (
          <div className="space-y-3 rounded-md border p-3" data-testid="smart-builder-draft">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">{draft.title || 'Untitled draft'}</p>
                {draft.description && (
                  <p className="text-sm text-muted-foreground">{draft.description}</p>
                )}
              </div>
              <Badge variant="secondary">{draft.fields.length} fields</Badge>
            </div>
            <ul className="space-y-1 text-sm" data-testid="smart-builder-draft-fields">
              {draft.fields.map((f, i) => (
                <li key={i}>
                  <span className="font-medium">{f.label}</span>
                  <span className="text-muted-foreground"> · {f.fieldType}</span>
                  {f.isRequired ? <span className="text-destructive"> *</span> : null}
                </li>
              ))}
            </ul>
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
              data-testid="button-apply-draft"
            >
              <Check className="h-4 w-4 mr-2" />
              {applyMutation.isPending ? 'Applying…' : 'Apply draft'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
