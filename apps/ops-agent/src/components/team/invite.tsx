"use client";

import { Copy, UserPlus } from "lucide-react";
import { useState } from "react";
import { ApiForm, Modal } from "@/components/ui/interactive";
import { Alert, Button, Field, Input, Select } from "@/components/ui/primitives";

export function InviteButton({ roles }: { roles: string[] }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <>
      <Button onClick={() => { setLink(null); setCopied(false); setOpen(true); }}>
        <UserPlus className="h-4 w-4" /> Invite member
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Invite a team member">
        {link ? (
          <div className="space-y-3">
            <Alert tone="green">Invitation created. Share this one-time link with your colleague (valid 7 days):</Alert>
            <div className="flex gap-2">
              <Input readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(link).catch(() => {});
                  setCopied(true);
                }}
              >
                <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        ) : (
          <ApiForm
            action="/api/v1/team/invitations"
            submitLabel="Create invitation"
            toBody={(f) => ({ email: f.get("email"), role: f.get("role") })}
            onDone={(d) => setLink((d as { inviteUrl: string }).inviteUrl)}
          >
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" required />
            </Field>
            <Field label="Role" htmlFor="role">
              <Select id="role" name="role" defaultValue="operator">
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r[0].toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <ul className="space-y-0.5 text-xs text-slate-500">
              <li><b>Admin</b> — configure courses, knowledge, agent, Telegram and team.</li>
              <li><b>Operator</b> — handle conversations, leads and bookings.</li>
              <li><b>Viewer</b> — read-only access to dashboards and CRM.</li>
            </ul>
          </ApiForm>
        )}
      </Modal>
    </>
  );
}
