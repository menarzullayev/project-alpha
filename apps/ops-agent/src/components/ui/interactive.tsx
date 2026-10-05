"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/** Lets forms rendered inside a modal close it after a successful submit. */
const ModalCloseContext = createContext<(() => void) | null>(null);
import { api } from "@/lib/api-client";
import { Alert, Button } from "./primitives";

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{open && children}</div>
    </dialog>
  );
}

export type FieldKind = "string" | "optional" | "nullable" | "number" | "numberOrNull" | "list" | "checkbox";

/** Serializable FormData → JSON mapping, usable from server components. */
export function formToBody(f: FormData, fields: Record<string, FieldKind>, extra?: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...extra };
  for (const [name, kind] of Object.entries(fields)) {
    const raw = f.get(name);
    const v = typeof raw === "string" ? raw.trim() : "";
    switch (kind) {
      case "string":
        out[name] = v;
        break;
      case "optional":
        if (v) out[name] = v;
        break;
      case "nullable":
        out[name] = v || null;
        break;
      case "number":
        out[name] = Number(v);
        break;
      case "numberOrNull":
        out[name] = v ? Number(v) : null;
        break;
      case "list":
        out[name] = v.split(",").map((x) => x.trim()).filter(Boolean);
        break;
      case "checkbox":
        out[name] = raw === "on";
        break;
    }
  }
  return out;
}

/**
 * Wraps a form that submits JSON to the API, then refreshes server data.
 * Use `fields` from server components; `toBody` only from client components.
 */
export function ApiForm({
  action,
  method = "POST",
  toBody,
  fields,
  extra,
  onDone,
  submitLabel = "Save",
  children,
  successMessage,
  className,
}: {
  action: string;
  method?: string;
  toBody?: (f: FormData) => unknown;
  fields?: Record<string, FieldKind>;
  extra?: Record<string, unknown>;
  onDone?: (data: unknown) => void;
  submitLabel?: string;
  children: ReactNode;
  successMessage?: string;
  className?: string;
}) {
  const router = useRouter();
  const closeModal = useContext(ModalCloseContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  return (
    <form
      className={className ?? "space-y-4"}
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setOk(false);
        try {
          const form = new FormData(e.currentTarget);
          const data = await api(action, { method, body: toBody ? toBody(form) : formToBody(form, fields ?? {}, extra) });
          setOk(true);
          router.refresh();
          onDone?.(data);
          if (!onDone) closeModal?.();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      {error && <Alert>{error}</Alert>}
      {ok && successMessage && <Alert tone="green">{successMessage}</Alert>}
      {children}
      <div className="flex justify-end">
        <Button type="submit" loading={loading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** A button that performs one API call and refreshes the page. */
export function ActionButton({
  action,
  method = "POST",
  body,
  children,
  variant = "secondary",
  confirm,
  size = "sm",
}: {
  action: string;
  method?: string;
  body?: unknown;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  confirm?: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        size={size}
        variant={variant}
        loading={loading}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setLoading(true);
          setError(null);
          try {
            await api(action, { method, body: body ?? {} });
            router.refresh();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        {children}
      </Button>
      {error && <span className="max-w-xs text-right text-xs text-red-600">{error}</span>}
    </span>
  );
}

/** Inline <select> that PATCHes a single field on change. */
export function InlineSelect({
  action,
  field,
  value,
  options,
  disabled,
  label,
}: {
  action: string;
  field: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  label: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <select
        aria-label={label}
        value={current}
        disabled={disabled || busy}
        onChange={async (e) => {
          const next = e.target.value;
          const prev = current;
          setCurrent(next);
          setBusy(true);
          setError(null);
          try {
            await api(action, { method: "PATCH", body: { [field]: next } });
            router.refresh();
          } catch (err) {
            setCurrent(prev);
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function ModalButton({ label, title, children, variant = "primary" }: { label: ReactNode; title: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <ModalCloseContext.Provider value={() => setOpen(false)}>{children}</ModalCloseContext.Provider>
      </Modal>
    </>
  );
}
