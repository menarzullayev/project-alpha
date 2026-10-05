"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import type { RootDict } from "@/lib/i18n/root-dict";

function CodeForm({ action, label, submit, onDone }: { action: string; label: string; submit: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api(action, { body: { code } });
          onDone();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      {error && <Alert>{error}</Alert>}
      <Field label={label} htmlFor="code">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,8}"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="text-center font-mono text-lg tracking-[0.4em]"
          autoFocus
          required
        />
      </Field>
      <Button type="submit" className="w-full" loading={busy} disabled={code.replace(/\s/g, "").length < 6}>
        {submit}
      </Button>
    </form>
  );
}

export function MfaVerify({ t }: { t: RootDict["mfa"] }) {
  const router = useRouter();
  return (
    <CodeForm
      action="/api/root/mfa/verify"
      label={t.code}
      submit={t.verify}
      onDone={() => {
        router.replace("/root");
        router.refresh();
      }}
    />
  );
}

export function MfaSetup({ t }: { t: RootDict["mfa"] }) {
  const router = useRouter();
  const [data, setData] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!data) {
    return (
      <div className="space-y-3">
        {error && <Alert>{error}</Alert>}
        <Button
          className="w-full"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              setData(await api<{ secret: string; qrSvg: string }>("/api/root/mfa/setup", { body: {} }));
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <KeyRound className="h-4 w-4" /> {t.start}
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">1. {t.step1}</p>
      {/* The SVG is generated server-side by the qrcode library from our own otpauth URI. */}
      <div className="mx-auto w-48 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: data.qrSvg }} aria-label="QR code" role="img" />
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t.manualKey}</p>
        <code className="block break-all rounded-md bg-slate-100 px-2 py-1.5 font-mono text-sm dark:bg-slate-800" data-testid="totp-secret">
          {data.secret}
        </code>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">2. {t.step2}</p>
      <CodeForm
        action="/api/root/mfa/enable"
        label={t.code}
        submit={t.enable}
        onDone={() => {
          router.replace("/root");
          router.refresh();
        }}
      />
    </div>
  );
}

export function MfaCard({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-indigo-500">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h1>
        </div>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">{intro}</p>
        {children}
      </div>
    </main>
  );
}
