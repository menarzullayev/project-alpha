import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium text-brand-600">404</p>
      <h1 className="text-xl font-semibold text-slate-900">Page not found</h1>
      <Link href="/dashboard" className="text-sm font-medium text-brand-600 hover:underline">
        Go to dashboard
      </Link>
    </main>
  );
}
