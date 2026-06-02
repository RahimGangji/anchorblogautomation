import { ObjectId } from "mongodb";
import { AppShell } from "@/components/AppShell";
import { LandingPageWorkflow } from "@/components/LandingPageWorkflow";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { LandingPageProjectDocument, WordPressConnectionDocument } from "@/lib/types";

export default async function CreateLandingPage({
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

  const [wordpressConnections, project] = await Promise.all([
    db
      .collection<WordPressConnectionDocument>("wordpressConnections")
      .find({ userId, status: "connected" })
      .sort({ updatedAt: -1 })
      .toArray(),
    projectObjectId
      ? db.collection<LandingPageProjectDocument>("landingPageProjects").findOne({
          _id: projectObjectId,
          userId,
        })
      : Promise.resolve(null),
  ]);
  const connections = wordpressConnections
    .map((connection) => ({
      id: connection._id?.toString() ?? "",
      label: `WordPress - ${connection.siteUrl}`,
      websiteContext: connection.websiteContext,
    }))
    .filter((connection) => connection.id);
  const initialProject = project?._id
    ? {
        projectId: project._id.toString(),
        wordpressConnectionId: project.wordpressConnectionId.toString(),
        title: project.title,
        intent: project.intent,
        prompt: project.prompt,
        designInspiration: project.designInspiration,
        html: project.html,
        css: project.css,
        slug: project.slug,
        notes: project.notes,
        screenshotUsed: project.screenshotUsed,
        status: project.status,
      }
    : null;

  return (
    <AppShell user={user}>
      <LandingPageWorkflow connections={connections} initialProject={initialProject} />
    </AppShell>
  );
}
