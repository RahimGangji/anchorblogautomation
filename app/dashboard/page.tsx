import { ObjectId } from "mongodb";
import Link from "next/link";
import { ArrowRight, Cable, FileText, PenLine } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type {
  BlogProjectDocument,
  LandingPageProjectDocument,
  ShopifyConnectionDocument,
  WordPressConnectionDocument,
} from "@/lib/types";

export default async function DashboardPage() {
  const user = await requireUser();
  const db = await getDb();
  const userId = new ObjectId(user.id);
  const [wordpressConnection, shopifyConnection, projects, landingPages] = await Promise.all([
    db.collection<WordPressConnectionDocument>("wordpressConnections").findOne({ userId }),
    db.collection<ShopifyConnectionDocument>("shopifyConnections").findOne({ userId }),
    db
      .collection<BlogProjectDocument>("blogProjects")
      .find({ userId })
      .sort({ updatedAt: -1 })
      .limit(6)
      .toArray(),
    db
      .collection<LandingPageProjectDocument>("landingPageProjects")
      .find({ userId })
      .sort({ updatedAt: -1 })
      .limit(6)
      .toArray(),
  ]);
  const recentProjects = [
    ...projects.map((project) => ({
      id: project._id?.toString() ?? "",
      type: "blog" as const,
      title: project.outline.title || project.keyword,
      detail: `Primary keyword: ${project.keyword}`,
      status: project.status,
      href: `/create?projectId=${project._id?.toString()}`,
      draftLink: project.cmsDraftLink ?? project.wordpressLink ?? "",
      draftLabel: project.draftProvider === "shopify" ? "Shopify" : "WordPress",
      updatedAt: project.updatedAt,
    })),
    ...landingPages.map((project) => ({
      id: project._id?.toString() ?? "",
      type: "landing page" as const,
      title: project.title,
      detail: `Intent: ${project.intent}`,
      status: project.status,
      href: `/create-landing-page?projectId=${project._id?.toString()}`,
      draftLink: project.wordpressLink ?? "",
      draftLabel: "WordPress page",
      updatedAt: project.updatedAt,
    })),
  ]
    .filter((project) => project.id)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 6);
  const activeConnection = wordpressConnection?.status === "connected"
    ? { provider: "WordPress", detail: wordpressConnection.siteUrl }
    : shopifyConnection?.status === "connected"
      ? { provider: "Shopify", detail: `${shopifyConnection.shopDomain} / ${shopifyConnection.blogTitle}` }
      : null;

  return (
    <AppShell user={user}>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold text-slate-950">Dashboard</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Create blog briefs and landing pages, preview AI-generated content, and send
                finished work to your connected CMS as drafts.
              </p>
              {!activeConnection ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  You can start a brief and outline now. A CMS is only needed when you publish a
                  draft.
                </p>
              ) : null}
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
              <Link
                href="/create"
                prefetch
                className="relative z-10 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
              >
                <PenLine size={18} aria-hidden />
                Create blog
              </Link>
              <Link
                href="/create-landing-page"
                prefetch
                className="relative z-10 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
              >
                <FileText size={18} aria-hidden />
                Create landing page
              </Link>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
              Recent projects
            </h2>
            {recentProjects.length > 0 ? (
              <div className="grid gap-3">
                {recentProjects.map((project) => (
                  <article key={`${project.type}-${project.id}`} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-950">
                          {project.title}
                        </h3>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                          <span>{project.detail}</span>
                          <span aria-hidden className="text-slate-300">-</span>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-bold uppercase text-slate-800">
                            {project.status}
                          </span>
                          <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-bold uppercase text-emerald-800">
                            {project.type}
                          </span>
                        </p>
                      </div>
                      <Link
                        href={project.href}
                        prefetch
                        aria-label="Edit project"
                        title="Edit project"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                      >
                        <PenLine size={17} aria-hidden />
                      </Link>
                    </div>
                    {project.draftLink ? (
                      <a
                        href={project.draftLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex text-sm font-semibold text-emerald-700 hover:underline"
                      >
                        View {project.draftLabel} draft
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">
                No projects yet. Create your first AI-assisted blog draft.
              </p>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <Cable className="text-emerald-700" size={22} />
            <h2 className="mt-4 text-lg font-semibold text-slate-950">CMS connection</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {activeConnection
                ? `${activeConnection.provider} connected to ${activeConnection.detail}`
                : "Connect WordPress or Shopify to send finished posts as drafts."}
            </p>
            <Link
              href="/connect"
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-950 hover:underline"
            >
              Manage connection
              <ArrowRight size={16} />
            </Link>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
