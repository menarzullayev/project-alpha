"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";

function useSubmit(fn: (form: FormData) => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await fn(new FormData(e.currentTarget));
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };
  return { error, loading, onSubmit };
}

export function LoginForm() {
  const router = useRouter();
  const { error, loading, onSubmit } = useSubmit(async (f) => {
    await api("/api/v1/auth/login", { body: { email: f.get("email"), password: f.get("password") } });
    router.replace("/dashboard");
    router.refresh();
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
        <p className="text-sm text-slate-500">Welcome back to your workspace.</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" className="w-full" loading={loading}>
        Sign in
      </Button>
      <p className="text-center text-sm text-slate-500">
        New here?{" "}
        <Link href="/signup" className="font-medium text-brand-600 hover:underline">
          Create a workspace
        </Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const router = useRouter();
  const { error, loading, onSubmit } = useSubmit(async (f) => {
    await api("/api/v1/auth/signup", {
      body: { name: f.get("name"), email: f.get("email"), password: f.get("password"), organizationName: f.get("organizationName") },
    });
    router.replace("/dashboard?welcome=1");
    router.refresh();
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Create your workspace</h1>
        <p className="text-sm text-slate-500">Set up your education centre in a minute.</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <Field label="Education centre name" htmlFor="organizationName">
        <Input id="organizationName" name="organizationName" required minLength={2} placeholder="e.g. Bilim Academy" />
      </Field>
      <Field label="Your name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required />
      </Field>
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" hint="(10+ chars, letters & digits)">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Button type="submit" className="w-full" loading={loading}>
        Create workspace
      </Button>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function AcceptInviteForm({ token, email, orgName, signedInAs }: { token: string; email: string; orgName: string; signedInAs: string | null }) {
  const router = useRouter();
  const { error, loading, onSubmit } = useSubmit(async (f) => {
    await api("/api/v1/auth/accept-invite", {
      body: signedInAs ? { token } : { token, name: f.get("name"), password: f.get("password") },
    });
    router.replace("/dashboard");
    router.refresh();
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Join {orgName}</h1>
        <p className="text-sm text-slate-500">
          Invitation for <span className="font-medium text-slate-700">{email}</span>
        </p>
      </div>
      {error && <Alert>{error}</Alert>}
      {signedInAs ? (
        <p className="text-sm text-slate-600">You are signed in as {signedInAs}.</p>
      ) : (
        <>
          <Field label="Your name" htmlFor="name">
            <Input id="name" name="name" required />
          </Field>
          <Field label="Choose a password" htmlFor="password" hint="(10+ chars, letters & digits)">
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
          </Field>
        </>
      )}
      <Button type="submit" className="w-full" loading={loading}>
        Accept invitation
      </Button>
      {!signedInAs && (
        <p className="text-center text-xs text-slate-500">
          Already have an account?{" "}
          <Link href={`/login`} className="font-medium text-brand-600 hover:underline">
            Sign in
          </Link>{" "}
          first, then open this link again.
        </p>
      )}
    </form>
  );
}

export function CreateOrgForm() {
  const router = useRouter();
  const { error, loading, onSubmit } = useSubmit(async (f) => {
    await api("/api/v1/organizations", { body: { name: f.get("name") } });
    router.replace("/dashboard?welcome=1");
    router.refresh();
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <Field label="Education centre name" htmlFor="name">
        <Input id="name" name="name" required minLength={2} />
      </Field>
      <Button type="submit" className="w-full" loading={loading}>
        Create workspace
      </Button>
    </form>
  );
}
