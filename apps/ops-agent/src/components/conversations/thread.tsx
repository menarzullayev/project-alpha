"use client";

import { AlertCircle, Bot, Check, Headset, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";

export type ThreadMessage = {
  id: string;
  direction: "inbound" | "outbound";
  senderType: "customer" | "agent" | "operator" | "system";
  body: string;
  deliveryStatus: string;
  createdAt: string;
  intent?: string | null;
};

export function Thread({ messages, timeZone }: { messages: ThreadMessage[]; timeZone: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages.length]);
  const time = (v: string) => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(new Date(v));
  return (
    <div className="space-y-3">
      {messages.map((m) => {
        const inbound = m.direction === "inbound";
        const Icon = inbound ? User : m.senderType === "operator" ? Headset : Bot;
        return (
          <div key={m.id} className={cn("flex gap-2", inbound ? "justify-start" : "justify-end")}>
            {inbound && <Icon className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
            <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[70%]", inbound ? "bg-white ring-1 ring-slate-200" : m.senderType === "operator" ? "bg-emerald-600 text-white" : "bg-brand-600 text-white")}>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className={cn("mt-1 flex items-center gap-1 text-[11px]", inbound ? "text-slate-400" : "text-white/70")}>
                {!inbound && <span className="capitalize">{m.senderType === "agent" ? "AI agent" : "Operator"}</span>}
                {m.intent && <span>· {m.intent}</span>}
                <span>· {time(m.createdAt)}</span>
                {!inbound && m.deliveryStatus === "sent" && <Check className="h-3 w-3" aria-label="Delivered" />}
                {!inbound && m.deliveryStatus === "failed" && (
                  <span className="inline-flex items-center gap-0.5 text-red-200">
                    <AlertCircle className="h-3 w-3" /> not delivered
                  </span>
                )}
              </p>
            </div>
            {!inbound && <Icon className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

export function ReplyBox({ conversationId, status }: { conversationId: string; status: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/conversations/${conversationId}/messages`, { body: { body: text } });
      setText("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      {status !== "handoff" && <p className="text-xs text-slate-500">Sending a message takes this conversation over from the AI agent.</p>}
      {error && <Alert>{error}</Alert>}
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
          placeholder="Write a reply…"
          className="min-h-11 flex-1"
          rows={2}
          aria-label="Reply"
        />
        <Button onClick={send} loading={busy} disabled={!text.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}

/** Polls for new messages while the page is open. */
export function AutoRefresh({ intervalMs = 8000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
