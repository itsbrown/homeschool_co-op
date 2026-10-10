import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/components/SupabaseProvider";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";

type ChatRole = "user" | "assistant";

type ChatTurn = {
  role: ChatRole;
  content: string;
  handoff?: boolean;
};

const ANON_STARTERS = [
  "How do I enroll?",
  "I don't have a school code",
];

const PARENT_STARTERS = [
  "Who is in my family?",
  "What materials are published this week?",
];

export default function ParentConciergePage() {
  const { isAuthenticated, user } = useAuth();
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const starters = isAuthenticated ? PARENT_STARTERS : ANON_STARTERS;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    const nextMessages: ChatTurn[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setDraft("");
    setPending(true);
    setError(null);
    try {
      const response = await apiRequest("POST", "/api/concierge/chat", {
        messages: nextMessages.map((message) => ({ role: message.role, content: message.content })),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "The concierge could not answer just now.");
        return;
      }
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: typeof body.reply === "string" ? body.reply : "I don't have a reply for that.",
          handoff: body.handoff === true,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The concierge could not answer just now.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col px-4 py-6 md:py-8">
      <header className="mb-6">
        <p className="text-sm font-medium text-primary">American Seekers Academy</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground md:text-3xl">Parent concierge</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAuthenticated
            ? `Signed in as ${user?.email ?? "a parent"}. I can see your own family, this week's published materials, and free event RSVPs.`
            : "Ask how enrollment works. I only use the school's published notes until you sign in."}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          I can't take payment, register a child, or change an enrollment. A reply here is not an approval or a receipt.
        </p>
      </header>

      <div
        data-testid="concierge-transcript"
        className="flex flex-1 flex-col gap-4 rounded-lg border bg-muted/40 p-4"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Try one of these, or type your own question.</p>
            <div className="flex flex-wrap gap-2">
              {starters.map((starter) => (
                <Button
                  key={starter}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => send(starter)}
                  disabled={pending}
                >
                  {starter}
                </Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={message.role === "user" ? "ml-8 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground" : "mr-8 rounded-lg bg-background px-4 py-3 text-sm text-foreground shadow-sm"}
            data-testid={message.role === "assistant" ? "concierge-reply" : "concierge-user"}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.handoff && (
              <p className="mt-2 text-xs text-muted-foreground">A person follows up on this. Nothing was enrolled or charged.</p>
            )}
          </div>
        ))}
        {pending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Thinking
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}

      <form
        className="mt-4 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <label className="sr-only" htmlFor="concierge-input">Message</label>
        <Textarea
          id="concierge-input"
          data-testid="concierge-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={isAuthenticated ? "Ask about your family or this week" : "Ask about enrollment"}
          rows={3}
          disabled={pending}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-3 text-sm">
            {isAuthenticated ? (
              <Link href="/parent/home" className="text-primary underline-offset-4 hover:underline">
                Browse on your own
              </Link>
            ) : (
              <>
                <Link href="/register" className="text-primary underline-offset-4 hover:underline">
                  Enroll with a school code
                </Link>
                <Link href="/login" className="text-primary underline-offset-4 hover:underline">
                  Parent sign in
                </Link>
              </>
            )}
          </div>
          <Button type="submit" data-testid="concierge-send" disabled={pending || draft.trim().length === 0}>
            <Send className="mr-2 h-4 w-4" />
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
