import { ObjectId } from "mongodb";
import { AppShell } from "@/components/AppShell";
import { BlogWorkflow } from "@/components/BlogWorkflow";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { WordPressConnectionDocument } from "@/lib/types";

export default async function CreatePage() {
  const user = await requireUser();
  const db = await getDb();
  const connection = await db.collection<WordPressConnectionDocument>("wordpressConnections").findOne({
    userId: new ObjectId(user.id),
    status: "connected",
  });

  return (
    <AppShell user={user}>
      <BlogWorkflow hasConnection={Boolean(connection)} />
    </AppShell>
  );
}
