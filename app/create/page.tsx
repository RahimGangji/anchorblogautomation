import { ObjectId } from "mongodb";
import { AppShell } from "@/components/AppShell";
import { BlogWorkflow } from "@/components/BlogWorkflow";
import { requireUser } from "@/lib/auth";
import { getActiveAiSettings, getAiSettings } from "@/lib/aiSettings";
import { imageModelForProvider } from "@/lib/aiModels";
import { getDb } from "@/lib/db";
import type { ShopifyConnectionDocument, WordPressConnectionDocument } from "@/lib/types";

export default async function CreatePage() {
  const user = await requireUser();
  const db = await getDb();
  const userId = new ObjectId(user.id);
  const [wordpressConnection, shopifyConnection, aiSettings] = await Promise.all([
    db.collection<WordPressConnectionDocument>("wordpressConnections").findOne({
      userId,
      status: "connected",
    }),
    db.collection<ShopifyConnectionDocument>("shopifyConnections").findOne({
      userId,
      status: "connected",
    }),
    getAiSettings(userId),
  ]);
  const connectedProvider = wordpressConnection ? "WordPress" : shopifyConnection ? "Shopify" : "";
  const activeAiSettings = getActiveAiSettings(aiSettings);

  return (
    <AppShell user={user}>
      <BlogWorkflow
        hasConnection={Boolean(connectedProvider)}
        connectedProvider={connectedProvider}
        imageModel={imageModelForProvider(activeAiSettings?.provider, activeAiSettings?.model)}
        imageProvider={activeAiSettings?.provider ?? ""}
        canGenerateImage={Boolean(activeAiSettings && activeAiSettings.provider !== "claude")}
      />
    </AppShell>
  );
}
