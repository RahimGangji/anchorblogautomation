import { ObjectId } from "mongodb";
import Link from "next/link";
import { ArrowRight, Cable, FileText, PenLine } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type {
  BlogProjectDocument,
  ShopifyConnectionDocument,
  WordPressConnectionDocument,
} from "@/lib/types";

export default async function DashboardPage() {
  const user = await requireUser();
  const db = await getDb();
  const userId = new ObjectId(user.id);
  const [wordpressConnection, shopifyConnection, projects] = await Promise.all([
    db.collection<WordPressConnectionDocument>("wordpressConnections").findOne({ userId }),
    db.collection<ShopifyConnectionDocument>("shopifyConnections").findOne({ userId }),
    db
      .collection<BlogProjectDocument>("blogProjects")
      .find({ userId })
      .sort({ updatedAt: -1 })
      .limit(6)
      .toArray(),
  ]);
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
                Create blog briefs, generate outlines, edit content, and send finished work to
                your connected CMS as drafts.
              </p>
              {!activeConnection ? (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  You can start a brief and outline now. A CMS is only needed when you publish a
                  draft.
                </p>
              ) : null}
            </div>
            <Link
              href="/create"
              prefetch
              className="relative z-10 inline-flex w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 sm:w-auto"
            >
              <PenLine size={18} aria-hidden />
              Create blog
            </Link>
          </div>

          <div className="mt-8 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
              Recent projects
            </h2>
            {projects.length > 0 ? (
              <div className="grid gap-3">
                {projects.map((project) => (
                  <article key={project._id?.toString()} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-950">
                          {project.outline.title || project.keyword}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {project.keyword} - {project.status}
                        </p>
                      </div>
                      <FileText className="shrink-0 text-slate-400" size={20} />
                    </div>
                    {project.cmsDraftLink || project.wordpressLink ? (
                      <a
                        href={project.cmsDraftLink ?? project.wordpressLink}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex text-sm font-semibold text-emerald-700 hover:underline"
                      >
                        View {project.draftProvider === "shopify" ? "Shopify" : "WordPress"} draft
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
