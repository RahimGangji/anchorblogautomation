"use server";

import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { getDb } from "@/lib/db";
import { createSession, destroySession, getSession } from "@/lib/session";
import type {
  ActionResult,
  BlogOutline,
  BlogProjectDocument,
  ShopifyConnectionDocument,
  UserDocument,
  WordPressConnectionDocument,
} from "@/lib/types";
import {
  createOutlineSchema,
  loginSchema,
  outlineSchema,
  shopifyConnectionSchema,
  signupSchema,
  wordpressConnectionSchema,
} from "@/lib/validators";
import { createContent, createOutline, reviseContent, reviseOutline } from "@/lib/ai";
import { createShopifyDraft, validateShopifyConnection } from "@/lib/shopify";
import {
  createWordPressDraft,
  validateWordPressConnection,
} from "@/lib/wordpress";

async function requireSession() {
  const session = await getSession();

  if (!session?.userId || !ObjectId.isValid(session.userId)) {
    throw new Error("You must be logged in.");
  }

  return {
    ...session,
    objectUserId: new ObjectId(session.userId),
  };
}

function flattenError(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Check the form fields and try again.";
  }

  if (error instanceof Error) {
    const msg = error.message;
    const lower = msg.toLowerCase();

    if (
      msg.includes("querySrv") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ENOTFOUND") ||
      lower.includes("getaddrinfo") ||
      lower.includes("server selection timed out")
    ) {
      return "Could not connect to MongoDB. Check your internet connection, Atlas network access, and MongoDB URI.";
    }

    if (
      lower.includes("bad auth") ||
      lower.includes("authentication failed")
    ) {
      return "MongoDB authentication failed. Check the database username and password in MONGODB_URI.";
    }

    return error.message;
  }

  return "Something went wrong.";
}

export async function signupAction(
  _state: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid signup details." };
  }

  try {
    const db = await getDb();
    const email = parsed.data.email.toLowerCase();
    const existingUser = await db.collection<UserDocument>("users").findOne({ email });

    if (existingUser) {
      return { ok: false, error: "An account already exists for this email." };
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const result = await db.collection<UserDocument>("users").insertOne({
      name: parsed.data.name,
      email,
      passwordHash,
      createdAt: new Date(),
    });

    await createSession({ userId: result.insertedId.toString(), email });
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }

  redirect("/dashboard");
}

export async function loginAction(
  _state: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid login details." };
  }

  try {
    const db = await getDb();
    const email = parsed.data.email.toLowerCase();
    const user = await db.collection<UserDocument>("users").findOne({ email });

    if (!user?._id) {
      return { ok: false, error: "Invalid email or password." };
    }

    const passwordMatches = await bcrypt.compare(parsed.data.password, user.passwordHash);

    if (!passwordMatches) {
      return { ok: false, error: "Invalid email or password." };
    }

    await createSession({ userId: user._id.toString(), email });
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function saveWordPressConnectionAction(
  _state: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const parsed = wordpressConnectionSchema.parse({
      siteUrl: formData.get("siteUrl"),
      wpUsername: formData.get("wpUsername"),
      wpApplicationPassword: formData.get("wpApplicationPassword"),
    });

    const validated = await validateWordPressConnection(parsed.siteUrl, {
      wpUsername: parsed.wpUsername,
      wpApplicationPassword: parsed.wpApplicationPassword,
    });

    const db = await getDb();
    const now = new Date();
    await db.collection<ShopifyConnectionDocument>("shopifyConnections").deleteMany({
      userId: session.objectUserId,
    });
    await db.collection<WordPressConnectionDocument>("wordpressConnections").updateOne(
      { userId: session.objectUserId },
      {
        $set: {
          siteUrl: validated.siteUrl,
          wpUsername: validated.wpUsername,
          wpApplicationPassword: parsed.wpApplicationPassword,
          status: "connected",
          lastValidatedAt: now,
          updatedAt: now,
        },
        $unset: { token: "" },
        $setOnInsert: {
          userId: session.objectUserId,
          createdAt: now,
        },
      },
      { upsert: true },
    );

    return { ok: true, data: { connected: true } };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function saveShopifyConnectionAction(
  _state: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const parsed = shopifyConnectionSchema.parse({
      shopDomain: formData.get("shopDomain"),
      accessToken: formData.get("accessToken"),
      blogId: formData.get("blogId"),
      authorName: formData.get("authorName"),
    });

    const validated = await validateShopifyConnection({
      shopDomain: parsed.shopDomain,
      accessToken: parsed.accessToken,
      blogId: parsed.blogId,
    });

    const db = await getDb();
    const now = new Date();
    await db.collection<WordPressConnectionDocument>("wordpressConnections").deleteMany({
      userId: session.objectUserId,
    });
    await db.collection<ShopifyConnectionDocument>("shopifyConnections").updateOne(
      { userId: session.objectUserId },
      {
        $set: {
          shopDomain: validated.shopDomain,
          accessToken: parsed.accessToken,
          blogId: validated.blogId,
          blogTitle: validated.blogTitle,
          authorName: parsed.authorName,
          status: "connected",
          lastValidatedAt: now,
          updatedAt: now,
        },
        $setOnInsert: {
          userId: session.objectUserId,
          createdAt: now,
        },
      },
      { upsert: true },
    );

    return { ok: true, data: { connected: true } };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function removeCmsConnectionAction(): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const db = await getDb();

    await Promise.all([
      db.collection<WordPressConnectionDocument>("wordpressConnections").deleteMany({
        userId: session.objectUserId,
      }),
      db.collection<ShopifyConnectionDocument>("shopifyConnections").deleteMany({
        userId: session.objectUserId,
      }),
    ]);

    return { ok: true, data: { removed: true } };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function generateOutlineAction(input: {
  keyword: string;
  prompt: string;
}): Promise<ActionResult<{ projectId: string; outline: BlogOutline }>> {
  try {
    const session = await requireSession();
    const parsed = createOutlineSchema.parse(input);
    const outline = await createOutline(parsed.keyword, parsed.prompt);
    const now = new Date();

    const db = await getDb();
    const result = await db.collection<BlogProjectDocument>("blogProjects").insertOne({
      userId: session.objectUserId,
      keyword: parsed.keyword,
      prompt: parsed.prompt,
      outline,
      contentHtml: "",
      metaTitle: "",
      metaDescription: "",
      status: "outline",
      createdAt: now,
      updatedAt: now,
    });

    return { ok: true, data: { projectId: result.insertedId.toString(), outline } };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function refineOutlineAction(input: {
  projectId: string;
  outline: BlogOutline;
  instruction: string;
}): Promise<ActionResult<{ outline: BlogOutline }>> {
  try {
    const session = await requireSession();

    if (!ObjectId.isValid(input.projectId)) {
      throw new Error("Invalid project.");
    }

    const outline = outlineSchema.parse(input.outline);

    if (input.instruction.trim().length < 5) {
      throw new Error("Tell AI what to change in the outline.");
    }

    const revisedOutline = await reviseOutline(outline, input.instruction);
    const db = await getDb();
    await db.collection<BlogProjectDocument>("blogProjects").updateOne(
      { _id: new ObjectId(input.projectId), userId: session.objectUserId },
      { $set: { outline: revisedOutline, updatedAt: new Date() } },
    );

    return { ok: true, data: { outline: revisedOutline } };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function generateContentAction(input: {
  projectId: string;
  outline: BlogOutline;
}): Promise<
  ActionResult<{
    title: string;
    contentHtml: string;
    metaTitle: string;
    metaDescription: string;
  }>
> {
  try {
    const session = await requireSession();

    if (!ObjectId.isValid(input.projectId)) {
      throw new Error("Invalid project.");
    }

    const db = await getDb();
    const project = await db.collection<BlogProjectDocument>("blogProjects").findOne({
      _id: new ObjectId(input.projectId),
      userId: session.objectUserId,
    });

    if (!project) {
      throw new Error("Project not found.");
    }

    const outline = outlineSchema.parse(input.outline);
    const content = await createContent(project.keyword, project.prompt, outline);

    await db.collection<BlogProjectDocument>("blogProjects").updateOne(
      { _id: project._id, userId: session.objectUserId },
      {
        $set: {
          outline,
          contentHtml: content.contentHtml,
          metaTitle: content.metaTitle,
          metaDescription: content.metaDescription,
          status: "content",
          updatedAt: new Date(),
        },
      },
    );

    return { ok: true, data: content };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function refineContentAction(input: {
  projectId: string;
  outline: BlogOutline;
  contentHtml: string;
  metaTitle: string;
  metaDescription: string;
  instruction: string;
}): Promise<
  ActionResult<{
    title: string;
    contentHtml: string;
    metaTitle: string;
    metaDescription: string;
  }>
> {
  try {
    const session = await requireSession();

    if (!ObjectId.isValid(input.projectId)) {
      throw new Error("Invalid project.");
    }

    if (input.instruction.trim().length < 5) {
      throw new Error("Tell AI what to change in the content.");
    }

    const db = await getDb();
    const project = await db.collection<BlogProjectDocument>("blogProjects").findOne({
      _id: new ObjectId(input.projectId),
      userId: session.objectUserId,
    });

    if (!project) {
      throw new Error("Project not found.");
    }

    const outline = outlineSchema.parse(input.outline);
    const content = await reviseContent({
      keyword: project.keyword,
      outline,
      contentHtml: input.contentHtml,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      instruction: input.instruction,
    });

    await db.collection<BlogProjectDocument>("blogProjects").updateOne(
      { _id: project._id, userId: session.objectUserId },
      {
        $set: {
          outline,
          contentHtml: content.contentHtml,
          metaTitle: content.metaTitle,
          metaDescription: content.metaDescription,
          status: "content",
          updatedAt: new Date(),
        },
      },
    );

    return { ok: true, data: content };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function publishDraftAction(input: {
  projectId: string;
  title: string;
  outline: BlogOutline;
  contentHtml: string;
  metaTitle: string;
  metaDescription: string;
}): Promise<ActionResult<{ provider: "wordpress" | "shopify"; draftId: string; draftLink: string }>> {
  try {
    const session = await requireSession();

    if (!ObjectId.isValid(input.projectId)) {
      throw new Error("Invalid project.");
    }

    if (!input.title.trim() || input.contentHtml.trim().length < 100) {
      throw new Error("Add a title and complete article content before drafting.");
    }

    const db = await getDb();
    const [project, wordpressConnection, shopifyConnection] = await Promise.all([
      db.collection<BlogProjectDocument>("blogProjects").findOne({
        _id: new ObjectId(input.projectId),
        userId: session.objectUserId,
      }),
      db.collection<WordPressConnectionDocument>("wordpressConnections").findOne({
        userId: session.objectUserId,
        status: "connected",
      }),
      db.collection<ShopifyConnectionDocument>("shopifyConnections").findOne({
        userId: session.objectUserId,
        status: "connected",
      }),
    ]);

    if (!project) {
      throw new Error("Project not found.");
    }

    if (wordpressConnection && shopifyConnection) {
      throw new Error("Only one CMS can be connected at a time. Remove one connection before drafting.");
    }

    if (!wordpressConnection && !shopifyConnection) {
      throw new Error("Connect WordPress or Shopify before drafting.");
    }

    const provider = wordpressConnection ? "wordpress" : "shopify";
    const draft = wordpressConnection
      ? await createWordPressDraft(wordpressConnection, input.title, input.contentHtml)
      : await createShopifyDraft(
          shopifyConnection as ShopifyConnectionDocument,
          input.title,
          input.contentHtml,
          input.metaDescription,
        );

    await db.collection<BlogProjectDocument>("blogProjects").updateOne(
      { _id: project._id, userId: session.objectUserId },
      {
        $set: {
          outline: outlineSchema.parse(input.outline),
          contentHtml: input.contentHtml,
          metaTitle: input.metaTitle,
          metaDescription: input.metaDescription,
          draftProvider: provider,
          cmsDraftId: String(draft.id),
          cmsDraftLink: draft.link,
          status: "drafted",
          ...(wordpressConnection
            ? {
                wordpressPostId: Number(draft.id),
                wordpressLink: draft.link,
              }
            : {}),
          updatedAt: new Date(),
        },
        ...(wordpressConnection
          ? {}
          : { $unset: { wordpressPostId: "", wordpressLink: "" } }),
      },
    );

    return {
      ok: true,
      data: {
        provider,
        draftId: String(draft.id),
        draftLink: draft.link,
      },
    };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}
