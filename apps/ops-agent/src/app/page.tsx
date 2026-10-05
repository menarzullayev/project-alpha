import { Bot, CalendarCheck, Headset, LineChart, MessageCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageSession } from "@/server/http/page-auth";

export const dynamic = "force-dynamic";

const features = [
  { icon: MessageCircle, title: "Answers on Telegram 24/7", text: "Courses, prices, schedules and FAQs in Uzbek, Russian and English — only from data you approved." },
  { icon: CalendarCheck, title: "Books trial lessons", text: "Offers real open slots, collects name and phone, and books without double-booking." },
  { icon: LineChart, title: "Built-in CRM", text: "Every chat becomes a lead with a pipeline: new → contacted → qualified → trial booked → won." },
  { icon: Headset, title: "Human handoff", text: "Complaints, unclear questions and requests for a person go straight to your team." },
  { icon: ShieldCheck, title: "Multi-tenant & audited", text: "Isolated workspaces, role-based access and a full audit trail." },
  { icon: Bot, title: "Bring your own LLM", text: "Runs on a grounded rules engine out of the box; plug in Anthropic or OpenAI any time." },
];

export default async function Home() {
  const session = await getPageSession().catch(() => null);
  if (session) redirect("/dashboard");
  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Bot className="h-5 w-5" />
          </span>
          OpsAgent
        </div>
        <nav className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Sign in
          </Link>
          <Link href="/signup" className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Start free
          </Link>
        </nav>
      </header>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 text-center sm:px-6 sm:pt-20">
        <p className="mx-auto mb-4 inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">For education centres</p>
        <h1 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          Your AI operations agent on Telegram — from first message to booked trial lesson
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-slate-600 sm:text-lg">
          OpsAgent replies to every student instantly, captures leads into your CRM, books trial lessons into real time slots and hands tricky
          conversations to your team.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/signup" className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-medium text-white hover:bg-brand-700">
            Create your workspace
          </Link>
          <Link href="/login" className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Sign in
          </Link>
        </div>
      </section>
      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-5">
              <f.icon className="h-5 w-5 text-brand-600" />
              <h3 className="mt-3 text-sm font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="py-8 text-center text-xs text-slate-400">© {new Date().getFullYear()} OpsAgent</footer>
    </main>
  );
}
