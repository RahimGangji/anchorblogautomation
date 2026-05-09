import { ObjectId } from "mongodb";
import { AppShell } from "@/components/AppShell";
import { BlogWorkflow } from "@/components/BlogWorkflow";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { ShopifyConnectionDocument, WordPressConnectionDocument } from "@/lib/types";

export default async function CreatePage() {
  const user = await requireUser();
  const db = await getDb();
  const userId = new ObjectId(user.id);
  const [wordpressConnection, shopifyConnection] = await Promise.all([
    db.collection<WordPressConnectionDocument>("wordpressConnections").findOne({
      userId,
      status: "connected",
    }),
    db.collection<ShopifyConnectionDocument>("shopifyConnections").findOne({
      userId,
      status: "connected",
    }),
  ]);
  const connectedProvider = wordpressConnection ? "WordPress" : shopifyConnection ? "Shopify" : "";

  return (
    <AppShell user={user}>
      <BlogWorkflow hasConnection={Boolean(connectedProvider)} connectedProvider={connectedProvider} />
    </AppShell>
  );
}
