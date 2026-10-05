"use client";

import { Copy, KeyRound, LogOut, Pause, Play, Plus, ShieldOff, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiForm, Modal } from "@/components/ui/interactive";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import type { RootDict } from "@/lib/i18n/root-dict";

function SecretReveal({ value, label, hint, t }: { value: string; label: string; hint: string; t: RootDict }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <Alert tone="green">{hint}</Alert>
      <Field label={label}>
        <div className="flex gap-2">
          <Input readOnly value={value} className="font-mono" onFocus={(e) => e.currentTarget.select()} data-testid="temp-password" />
          <Button
            variant="secondary"
            type="button"
            onClick={async () => {
              await navigator.clipboard?.writeText(value).catch(() => {});
              setCopied(true);
            }}
          >
            <Copy className="h-4 w-4" /> {copied ? t.common.copied : t.common.copy}
          </Button>
        </div>
      </Field>
    </div>
  );
}

export function AddUserButton({ t, orgs, canAssignRoles }: { t: RootDict; orgs: { id: string; name: string }[]; canAssignRoles: boolean }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ temporaryPassword: string; user: { id: string } } | null>(null);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => { setResult(null); setOpen(true); }}>
        <UserPlus className="h-4 w-4" /> {t.users.add}
      </Button>
      <Modal open={open} onClose={() => { setOpen(false); if (result) router.push(`/root/users/${result.user.id}`); }} title={t.users.add}>
        {result ? (
          <SecretReveal value={result.temporaryPassword} label={t.users.temporaryPassword} hint={t.users.tempPasswordHint} t={t} />
        ) : (
          <ApiForm
            action="/api/root/users"
            submitLabel={t.common.create}
            toBody={(f) => ({
              email: f.get("email"),
              name: f.get("name"),
              platformRole: f.get("platformRole") || null,
              organizationId: f.get("organizationId") || undefined,
              organizationRole: f.get("organizationRole") || "admin",
            })}
            onDone={(d) => setResult(d as { temporaryPassword: string; user: { id: string } })}
          >
            <Field label={t.common.name} htmlFor="name"><Input id="name" name="name" required /></Field>
            <Field label={t.common.email} htmlFor="email"><Input id="email" name="email" type="email" required /></Field>
            {canAssignRoles && (
              <Field label={t.users.platformRole} htmlFor="platformRole">
                <Select id="platformRole" name="platformRole" defaultValue="">
                  <option value="">{t.roles.none}</option>
                  <option value="support">{t.roles.support}</option>
                  <option value="admin">{t.roles.admin}</option>
                  <option value="superadmin">{t.roles.superadmin}</option>
                </Select>
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.users.addToOrganization} htmlFor="organizationId">
                <Select id="organizationId" name="organizationId" defaultValue="">
                  <option value="">—</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </Select>
              </Field>
              <Field label={t.users.organizationRole} htmlFor="organizationRole">
                <Select id="organizationRole" name="organizationRole" defaultValue="admin">
                  {(["owner", "admin", "operator", "viewer"] as const).map((r) => <option key={r} value={r}>{t.orgRoles[r]}</option>)}
                </Select>
              </Field>
            </div>
          </ApiForm>
        )}
      </Modal>
    </>
  );
}

export function SuspendButton({ action, title, hint, label, t }: { action: string; title: string; hint: string; label: string; t: RootDict }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Pause className="h-4 w-4" /> {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">{hint}</p>
        <ApiForm action={action} submitLabel={t.common.confirm} fields={{ reason: "string" }} extra={{ status: "suspended" }} onDone={() => setOpen(false)}>
          <Field label={t.common.reason} htmlFor="reason"><Textarea id="reason" name="reason" required minLength={3} rows={3} /></Field>
        </ApiForm>
      </Modal>
    </>
  );
}

export function ReactivateButton({ action, label }: { action: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        variant="secondary"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api(action, { body: { status: "active" } });
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Play className="h-4 w-4" /> {label}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function ResetPasswordButton({ userId, t }: { userId: string; t: RootDict }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button variant="secondary" onClick={() => { setPw(null); setError(null); setOpen(true); }}>
        <KeyRound className="h-4 w-4" /> {t.users.resetPassword}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t.users.resetPassword}>
        {pw ? (
          <SecretReveal value={pw} label={t.users.temporaryPassword} hint={t.users.tempPasswordHint} t={t} />
        ) : (
          <div className="space-y-3">
            {error && <Alert>{error}</Alert>}
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setPw((await api<{ temporaryPassword: string }>(`/api/root/users/${userId}/password-reset`, { body: {} })).temporaryPassword);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t.common.confirm}
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}

export function SimpleAction({ action, method, label, icon, confirm, variant = "secondary" }: { action: string; method: string; label: string; icon: "logout" | "shield"; confirm: string; variant?: "secondary" | "danger" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const Icon = icon === "logout" ? LogOut : ShieldOff;
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        variant={variant}
        loading={busy}
        onClick={async () => {
          if (!window.confirm(confirm)) return;
          setBusy(true);
          setMsg(null);
          try {
            await api(action, { method, body: {} });
            router.refresh();
          } catch (e) {
            setMsg((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon className="h-4 w-4" /> {label}
      </Button>
      {msg && <span className="text-xs text-red-600">{msg}</span>}
    </span>
  );
}

export function AddMembershipForm({ userId, orgs, t }: { userId: string; orgs: { id: string; name: string }[]; t: RootDict }) {
  return (
    <ApiForm action={`/api/root/users/${userId}/memberships`} submitLabel={t.users.addMembership} fields={{ organizationId: "string", role: "string" }} className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
      <Field label={t.nav.organizations} htmlFor="m-org">
        <Select id="m-org" name="organizationId" required defaultValue="">
          <option value="" disabled>—</option>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      </Field>
      <Field label={t.common.role} htmlFor="m-role">
        <Select id="m-role" name="role" defaultValue="operator">
          {(["owner", "admin", "operator", "viewer"] as const).map((r) => <option key={r} value={r}>{t.orgRoles[r]}</option>)}
        </Select>
      </Field>
    </ApiForm>
  );
}

export function NewAnnouncementButton({ t }: { t: RootDict }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {t.announcements.new}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t.announcements.new}>
        <ApiForm
          action="/api/root/announcements"
          submitLabel={t.common.create}
          toBody={(f) => ({
            title: f.get("title"),
            body: f.get("body") ?? "",
            severity: f.get("severity"),
            audience: f.get("audience"),
            startsAt: f.get("startsAt") ? new Date(String(f.get("startsAt"))).toISOString() : undefined,
            endsAt: f.get("endsAt") ? new Date(String(f.get("endsAt"))).toISOString() : null,
          })}
          onDone={() => setOpen(false)}
        >
          <Field label={t.announcements.titleField} htmlFor="a-title"><Input id="a-title" name="title" required minLength={3} maxLength={140} /></Field>
          <Field label={t.announcements.body} htmlFor="a-body"><Textarea id="a-body" name="body" rows={4} maxLength={2000} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.announcements.severity} htmlFor="a-sev">
              <Select id="a-sev" name="severity" defaultValue="info">
                {(["info", "warning", "critical"] as const).map((s) => <option key={s} value={s}>{t.announcements.severities[s]}</option>)}
              </Select>
            </Field>
            <Field label={t.announcements.audience} htmlFor="a-aud">
              <Select id="a-aud" name="audience" defaultValue="all">
                <option value="all">{t.announcements.audienceAll}</option>
                <option value="owners">{t.announcements.audienceOwners}</option>
              </Select>
            </Field>
            <Field label={t.announcements.startsAt} htmlFor="a-start"><Input id="a-start" name="startsAt" type="datetime-local" /></Field>
            <Field label={t.announcements.endsAt} htmlFor="a-end"><Input id="a-end" name="endsAt" type="datetime-local" /></Field>
          </div>
        </ApiForm>
      </Modal>
    </>
  );
}
