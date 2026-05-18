import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Cable, FileText, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-sm font-bold tracking-wide">
          AnchorBlog Automation
        </Link>
        <nav className="flex items-center gap-2">
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
            AI assisted CMS drafting
          </p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-tight text-slate-950">
            Create editable blog outlines and draft polished posts to your CMS.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            Connect Your CMS and guide AI with primary and secondary keywords, revise
            every step, and send the final article as a draft when it is ready.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={user ? "/create" : "/signup"}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Start creating
              <ArrowRight size={18} aria-hidden />
            </Link>
            <Link
              href={user ? "/connect" : "/login"}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Connect CMS
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 shadow-sm">
          <div className="space-y-3">
            <Feature icon={<Cable size={20} />} title="Connect" text="Use either WordPress or Shopify as the active CMS." />
            <Feature icon={<Sparkles size={20} />} title="Outline" text="Generate and refine an SEO-aware article plan." />
            <Feature icon={<FileText size={20} />} title="Draft" text="Edit rich content and publish it as a CMS draft." />
          </div>
        </div>
      </section>
    </main>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{text}</p>
        </div>
      </div>
    </div>
  );
}
