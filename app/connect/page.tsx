import { ObjectId } from "mongodb";
import { AppShell } from "@/components/AppShell";
import { CmsConnectionSwitcher } from "@/components/CmsConnectionSwitcher";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { ShopifyConnectionDocument, WordPressConnectionDocument } from "@/lib/types";

export default async function ConnectPage() {
  const user = await requireUser();
  const db = await getDb();
  const userId = new ObjectId(user.id);
  const [wordpressConnections, shopifyConnections] = await Promise.all([
    db
      .collection<WordPressConnectionDocument>("wordpressConnections")
      .find({ userId, status: "connected" })
      .sort({ updatedAt: -1 })
      .toArray(),
    db
      .collection<ShopifyConnectionDocument>("shopifyConnections")
      .find({ userId, status: "connected" })
      .sort({ updatedAt: -1 })
      .toArray(),
  ]);
  const connections = [
    ...wordpressConnections.map((connection) => ({
      id: connection._id?.toString() ?? "",
      provider: "wordpress" as const,
      title: "WordPress",
      detail: connection.siteUrl,
      websiteContext: connection.websiteContext,
    })),
    ...shopifyConnections.map((connection) => ({
      id: connection._id?.toString() ?? "",
      provider: "shopify" as const,
      title: connection.blogTitle,
      detail: `${connection.shopDomain} / ${connection.blogId}`,
      websiteContext: connection.websiteContext,
    })),
  ].filter((connection) => connection.id);

  return (
    <AppShell user={user}>
      <section className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Connect CMS</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Connect up to 3 WordPress or Shopify projects. Choose the target project when creating a blog.
        </p>

        <CmsConnectionSwitcher connections={connections} />
      </section>
    </AppShell>
  );
}
