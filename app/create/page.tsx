import { ObjectId } from "mongodb";
import { AppShell } from "@/components/AppShell";
import { BlogWorkflow } from "@/components/BlogWorkflow";
import { requireUser } from "@/lib/auth";
import { getActiveAiSettings, getAiSettings } from "@/lib/aiSettings";
import { imageModelForProvider } from "@/lib/aiModels";
import { getDb } from "@/lib/db";
import type {
  BlogProjectDocument,
  ShopifyConnectionDocument,
  WordPressConnectionDocument,
} from "@/lib/types";

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string | string[] }>;
}) {
  const user = await requireUser();
  const db = await getDb();
  const userId = new ObjectId(user.id);
  const query = await searchParams;
  const requestedProjectId = Array.isArray(query.projectId) ? query.projectId[0] : query.projectId;
  const projectObjectId =
    requestedProjectId && ObjectId.isValid(requestedProjectId)
      ? new ObjectId(requestedProjectId)
      : null;
  const [wordpressConnections, shopifyConnections, aiSettings, project] = await Promise.all([
    db.collection<WordPressConnectionDocument>("wordpressConnections").find({
      userId,
      status: "connected",
    }).sort({ updatedAt: -1 }).toArray(),
    db.collection<ShopifyConnectionDocument>("shopifyConnections").find({
      userId,
      status: "connected",
    }).sort({ updatedAt: -1 }).toArray(),
    getAiSettings(userId),
    projectObjectId
      ? db.collection<BlogProjectDocument>("blogProjects").findOne({
          _id: projectObjectId,
          userId,
        })
      : Promise.resolve(null),
  ]);
  const cmsConnections = [
    ...wordpressConnections.map((connection) => ({
      id: connection._id?.toString() ?? "",
      provider: "wordpress" as const,
      label: `WordPress - ${connection.siteUrl}`,
      websiteContext: connection.websiteContext,
    })),
    ...shopifyConnections.map((connection) => ({
      id: connection._id?.toString() ?? "",
      provider: "shopify" as const,
      label: `Shopify - ${connection.shopDomain} / ${connection.blogTitle}`,
      websiteContext: connection.websiteContext,
    })),
  ].filter((connection) => connection.id);
  const selectedConnection = project?.cmsConnectionId
    ? cmsConnections.find((connection) => connection.id === project.cmsConnectionId?.toString())
    : cmsConnections[0];
  const connectedProvider = selectedConnection
    ? selectedConnection.provider === "wordpress"
      ? "WordPress"
      : "Shopify"
    : "";
  const activeAiSettings = getActiveAiSettings(aiSettings);
  const initialProject = project?._id
    ? {
        projectId: project._id.toString(),
        keyword: project.keyword,
        secondaryKeywords: project.secondaryKeywords,
        seoEntities: project.seoEntities,
        prompt: project.prompt,
        cmsProvider: project.cmsProvider,
        cmsConnectionId: project.cmsConnectionId?.toString(),
        websiteContext: project.websiteContext,
        outline: project.outline,
        title: project.title,
        contentHtml: project.contentHtml,
        slug: project.slug,
        metaTitle: project.metaTitle,
        metaDescription: project.metaDescription,
        aiReport: project.aiReport,
        status: project.status,
      }
    : null;

  return (
    <AppShell user={user}>
      <BlogWorkflow
        hasConnection={Boolean(connectedProvider)}
        connectedProvider={connectedProvider}
        cmsConnections={cmsConnections}
        imageModel={imageModelForProvider(activeAiSettings?.provider, activeAiSettings?.model)}
        imageProvider={activeAiSettings?.provider ?? ""}
        initialProject={initialProject}
        canGenerateImage={Boolean(activeAiSettings && activeAiSettings.provider !== "claude")}
      />
    </AppShell>
  );
}
