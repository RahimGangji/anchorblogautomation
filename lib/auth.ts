import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import type { UserDocument } from "@/lib/types";

export async function requireUser() {
  const session = await getSession();

  if (!session?.userId || !ObjectId.isValid(session.userId)) {
    redirect("/login");
  }

  const db = await getDb();
  const user = await db.collection<UserDocument>("users").findOne(
    { _id: new ObjectId(session.userId) },
    { projection: { passwordHash: 0 } },
  );

  if (!user?._id) {
    redirect("/login");
  }

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
}

export async function getCurrentUser() {
  const session = await getSession();

  if (!session?.userId || !ObjectId.isValid(session.userId)) {
    return null;
  }

  const db = await getDb();
  const user = await db.collection<UserDocument>("users").findOne(
    { _id: new ObjectId(session.userId) },
    { projection: { passwordHash: 0 } },
  );

  if (!user?._id) {
    return null;
  }

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
}
