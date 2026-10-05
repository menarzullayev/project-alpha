"use client";

import { Bot, RotateCcw, Send, User } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, Badge, Button, Input } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";

type Msg = { role: "user" | "agent"; text: string; meta?: string };
type Reply = { reply: string | null; intent: string | null; actions: string[]; quickReplies: string[]; handedOff: boolean; conversationId: string };

export function TestChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [quick, setQuick] = useState<string[]>(["/start"]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [handedOff, setHandedOff] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  const scroll = () => setTimeout(() => list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }), 50);

  const send = async (value: string) => {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    setError(null);
    setText("");
    setMsgs((m) => [...m, { role: "user", text: v }]);
    scroll();
    try {
      const r = await api<Reply>("/api/v1/agent/test-chat", { body: { text: v, clientMessageId: crypto.randomUUID() } });
      setConversationId(r.conversationId);
      if (r.reply) {
        const meta = [r.intent, ...r.actions].filter(Boolean).join(" · ");
        setMsgs((m) => [...m, { role: "agent", text: r.reply!, meta }]);
      } else {
        setMsgs((m) => [...m, { role: "agent", text: "(no automatic reply — the conversation is with a human operator)", meta: "handoff" }]);
      }
      setQuick(r.quickReplies);
      if (r.handedOff) setHandedOff(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      scroll();
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await api("/api/v1/agent/test-chat/reset", { body: {} });
      setMsgs([]);
      setQuick(["/start"]);
      setHandedOff(false);
      setConversationId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[560px] flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Test chat</p>
          <p className="text-xs text-slate-500">Runs the real agent pipeline. Test leads are tagged “test chat”.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} disabled={busy} aria-label="Reset test chat">
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
      </div>
      <div ref={list} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4" aria-live="polite">
        {msgs.length === 0 && <p className="mt-16 text-center text-sm text-slate-400">Say hello in Uzbek, Russian or English — e.g. “Ingliz tili narxi qancha?”</p>}
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role === "agent" && <Bot className="mt-1 h-4 w-4 shrink-0 text-brand-600" aria-hidden />}
            <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm", m.role === "user" ? "bg-brand-600 text-white" : "bg-white ring-1 ring-slate-200")}>
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              {m.meta && <p className="mt-1 text-[11px] text-slate-400">{m.meta}</p>}
            </div>
            {m.role === "user" && <User className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
          </div>
        ))}
      </div>
      {handedOff && (
        <div className="px-4 pt-3">
          <Alert tone="amber">
            Handed off to a human.{" "}
            {conversationId && (
              <a className="font-medium underline" href={`/conversations/${conversationId}`}>
                Open conversation
              </a>
            )}{" "}
            — hand it back to the AI there, or reset.
          </Alert>
        </div>
      )}
      {error && (
        <div className="px-4 pt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {quick.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {quick.map((q) => (
            <button key={q} type="button" onClick={() => send(q)} disabled={busy} className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50">
              {q}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a customer message…" aria-label="Message" maxLength={2000} />
        <Button type="submit" loading={busy} aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

export function ProviderBadge({ provider }: { provider: string }) {
  return <Badge tone={provider === "rules" ? "slate" : "green"}>{provider === "rules" ? "Grounded rules engine" : `LLM: ${provider}`}</Badge>;
}
