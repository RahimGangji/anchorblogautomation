"use server";

import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { getDb } from "@/lib/db";
import { createSession, destroySession, getSession } from "@/lib/session";
import type {
  AiSettingsDocument,
  ActionResult,
  BlogOutline,
  BlogProjectDocument,
  LandingPageProjectDocument,
  ShopifyConnectionDocument,
  UserDocument,
  WordPressConnectionDocument,
} from "@/lib/types";
import {
  aiSettingsSchema,
  createOutlineSchema,
  landingPageContentSchema,
  landingPageInputSchema,
  loginSchema,
  outlineSchema,
  shopifyConnectionSchema,
  slugSchema,
  signupSchema,
  wordpressConnectionSchema,
} from "@/lib/validators";
import {
  analyzeContentWithAi,
  createContent,
  createLandingPage,
  createOutline,
  reviseContent,
  reviseLandingPage,
  reviseOutline,
} from "@/lib/ai";
import type { AiContentReport } from "@/lib/ai";
import { getActiveAiSettings, getAiSettings } from "@/lib/aiSettings";
import { generateImageWithAi } from "@/lib/imageAi";
import type { GeneratedImage, ImageSize } from "@/lib/imageAi";
import { createShopifyDraft, validateShopifyConnection } from "@/lib/shopify";
import {
  createWordPressPageDraft,
  createWordPressDraft,
  updateWordPressPageDraft,
  validateWordPressConnection,
} from "@/lib/wordpress";

const MAX_CMS_CONNECTIONS = 3;
const MAX_LANDING_SCREENSHOT_DATA_URL_LENGTH = 1_600_000;

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
      websiteContext: formData.get("websiteContext"),
      wpUsername: formData.get("wpUsername"),
      wpApplicationPassword: formData.get("wpApplicationPassword"),
    });

    const validated = await validateWordPressConnection(parsed.siteUrl, {
      wpUsername: parsed.wpUsername,
      wpApplicationPassword: parsed.wpApplicationPassword,
    });

    const db = await getDb();
    const now = new Date();
    const existingConnection = await db
      .collection<WordPressConnectionDocument>("wordpressConnections")
      .findOne({ userId: session.objectUserId, siteUrl: validated.siteUrl });

    if (!existingConnection) {
      const totalConnections = await countCmsConnections(session.objectUserId);
      if (totalConnections >= MAX_CMS_CONNECTIONS) {
        throw new Error("You can connect up to 3 CMS projects at a time.");
      }
    }

    await db.collection<WordPressConnectionDocument>("wordpressConnections").updateOne(
      { userId: session.objectUserId, siteUrl: validated.siteUrl },
      {
        $set: {
          siteUrl: validated.siteUrl,
          websiteContext: parsed.websiteContext,
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

    revalidatePath("/connect");
    revalidatePath("/create");

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
      websiteContext: formData.get("websiteContext"),
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
    const existingConnection = await db.collection<ShopifyConnectionDocument>("shopifyConnections").findOne({
      userId: session.objectUserId,
      shopDomain: validated.shopDomain,
      blogId: validated.blogId,
    });

    if (!existingConnection) {
      const totalConnections = await countCmsConnections(session.objectUserId);
      if (totalConnections >= MAX_CMS_CONNECTIONS) {
        throw new Error("You can connect up to 3 CMS projects at a time.");
      }
    }

    await db.collection<ShopifyConnectionDocument>("shopifyConnections").updateOne(
      { userId: session.objectUserId, shopDomain: validated.shopDomain, blogId: validated.blogId },
      {
        $set: {
          shopDomain: validated.shopDomain,
          websiteContext: parsed.websiteContext,
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

    revalidatePath("/connect");
    revalidatePath("/create");

    return { ok: true, data: { connected: true } };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function removeCmsConnectionAction(formData?: FormData): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const db = await getDb();
    const provider = formData?.get("provider");
    const connectionId = String(formData?.get("connectionId") ?? "");

    if (provider && connectionId) {
      if (!ObjectId.isValid(connectionId)) {
        throw new Error("Invalid CMS project.");
      }

      const collection =
        provider === "wordpress"
          ? db.collection<WordPressConnectionDocument>("wordpressConnections")
          : provider === "shopify"
            ? db.collection<ShopifyConnectionDocument>("shopifyConnections")
            : null;

      if (!collection) {
        throw new Error("Choose a valid CMS project to remove.");
      }

      await collection.deleteOne({
        _id: new ObjectId(connectionId),
        userId: session.objectUserId,
      });

      revalidatePath("/connect");
      revalidatePath("/create");

      return { ok: true, data: { removed: true } };
    }

    await Promise.all([
      db.collection<WordPressConnectionDocument>("wordpressConnections").deleteMany({
        userId: session.objectUserId,
      }),
      db.collection<ShopifyConnectionDocument>("shopifyConnections").deleteMany({
        userId: session.objectUserId,
      }),
    ]);

    revalidatePath("/connect");
    revalidatePath("/create");

    return { ok: true, data: { removed: true } };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function saveAiSettingsAction(
  _state: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  try {
    const session = await requireSession();
    const parsed = aiSettingsSchema.parse({
      activeProvider: formData.get("activeProvider"),
      gptApiKey: formData.get("gptApiKey"),
      gptModel: formData.get("gptModel"),
      claudeApiKey: formData.get("claudeApiKey"),
      claudeModel: formData.get("claudeModel"),
      geminiApiKey: formData.get("geminiApiKey"),
      geminiModel: formData.get("geminiModel"),
    });
    const now = new Date();
    const $set: Partial<AiSettingsDocument> = {
      activeProvider: parsed.activeProvider,
      gptModel: parsed.gptModel,
      claudeModel: parsed.claudeModel,
      geminiModel: parsed.geminiModel,
      updatedAt: now,
    };

    if (parsed.gptApiKey) $set.gptApiKey = parsed.gptApiKey;
    if (parsed.claudeApiKey) $set.claudeApiKey = parsed.claudeApiKey;
    if (parsed.geminiApiKey) $set.geminiApiKey = parsed.geminiApiKey;

    const db = await getDb();
    await db.collection<AiSettingsDocument>("aiSettings").updateOne(
      { userId: session.objectUserId },
      {
        $set,
        $setOnInsert: {
          userId: session.objectUserId,
          createdAt: now,
        },
      },
      { upsert: true },
    );

    revalidatePath("/api-keys");
    revalidatePath("/create");
    revalidatePath("/create-image");

    return { ok: true, data: { saved: true } };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function disconnectAiProviderAction(formData: FormData) {
  const provider = formData.get("provider");
  if (provider !== "gpt" && provider !== "claude" && provider !== "gemini") {
    throw new Error("Choose a valid AI provider to disconnect.");
  }

  const session = await requireSession();
  const db = await getDb();
  const keyField = `${provider}ApiKey`;
  const now = new Date();

  await db.collection<AiSettingsDocument>("aiSettings").updateOne(
    { userId: session.objectUserId },
    {
      $unset: { [keyField]: "" },
      $set: { updatedAt: now },
    },
  );

  revalidatePath("/api-keys");
  revalidatePath("/create");
  revalidatePath("/create-image");
  redirect("/api-keys");
}

export async function generateImageAction(
  _state: ActionResult<GeneratedImage> | undefined,
  formData: FormData,
): Promise<ActionResult<GeneratedImage>> {
  try {
    const session = await requireSession();
    const prompt = String(formData.get("prompt") ?? "").trim();

    if (prompt.length < 10) {
      throw new Error("Describe the image you want in at least 10 characters.");
    }

    const settings = getActiveAiSettings(await getAiSettings(session.objectUserId));

    if (!settings) {
      throw new Error("Add an API key for GPT or Gemini and select it as active before creating images.");
    }

    const size = parseImageSize(formData.get("size"));
    const image = await generateImageWithAi(settings, prompt, size);

    return { ok: true, data: image };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function generateBlogImageAction(input: {
  prompt: string;
  size: ImageSize;
}): Promise<ActionResult<GeneratedImage>> {
  try {
    const session = await requireSession();
    const prompt = input.prompt.trim();

    if (prompt.length < 10) {
      throw new Error("Describe the image you want in at least 10 characters.");
    }

    const settings = getActiveAiSettings(await getAiSettings(session.objectUserId));

    if (!settings) {
      throw new Error("Add an API key for GPT or Gemini and select it as active before creating images.");
    }

    const image = await generateImageWithAi(settings, prompt, parseImageSize(input.size));

    return { ok: true, data: image };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

function parseImageSize(value: unknown): ImageSize {
  if (value === "1024x1536" || value === "1536x1024") return value;
  return "1024x1024";
}

function validateLandingScreenshotSize(
  screenshot: { dataUrl: string; fileName: string; mimeType: string } | null | undefined,
) {
  if (screenshot && screenshot.dataUrl.length > MAX_LANDING_SCREENSHOT_DATA_URL_LENGTH) {
    throw new Error("Screenshot is too large. Upload a smaller screenshot under about 1 MB.");
  }
}

function landingPagePreviewHtml(html: string, css: string) {
  return `<style data-anchor-landing>${scopeLandingCss(css)}</style>\n${html}`;
}

function scopeLandingCss(css: string) {
  const cleaned = css
    .replace(/<style\b[^>]*>/gi, "")
    .replace(/<\/style>/gi, "")
    .trim();

  if (!cleaned) return "";

  return cleaned.replace(/(^|})\s*([^@{}][^{}]*)\{/g, (match, close: string, selectorGroup: string) => {
    const scopedSelectors = selectorGroup
      .split(",")
      .map((selector) => {
        const trimmed = selector.trim();
        if (!trimmed) return "";
        if (
          trimmed.startsWith(".anchor-landing-page") ||
          trimmed.startsWith("html") ||
          trimmed.startsWith("body") ||
          trimmed.startsWith("*")
        ) {
          return trimmed;
        }
        return `.anchor-landing-page ${trimmed}`;
      })
      .filter(Boolean)
      .join(", ");

    return `${close} ${scopedSelectors} {`;
  });
}

function extractFirstSection(value: string) {
  const start = value.search(/<section\b/i);
  if (start === -1) return "";

  const fromSection = value.slice(start);
  const end = fromSection.search(/<\/section>/i);
  if (end === -1) return "";

  return fromSection
    .slice(0, end + "</section>".length)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .trim();
}

function replaceFirstLandingSection(html: string, sectionHtml: string) {
  const wrapperMatch = html.match(/<main\b[^>]*class=(["'])[^"']*\banchor-landing-page\b[^"']*\1[^>]*>([\s\S]*)<\/main>/i);
  const bodyHtml = wrapperMatch?.[2] ?? html;
  const firstSection = bodyHtml.match(/<section\b[\s\S]*?<\/section>/i);

  if (firstSection) {
    const replaced = `${bodyHtml.slice(0, firstSection.index)}${sectionHtml}${bodyHtml.slice((firstSection.index ?? 0) + firstSection[0].length)}`;
    return `<main class="anchor-landing-page">${replaced}</main>`;
  }

  return `<main class="anchor-landing-page">${sectionHtml}${bodyHtml}</main>`;
}

function landingUtilityCss() {
  return `
.anchor-landing-page [class~="relative"] { position: relative; }
.anchor-landing-page [class~="absolute"] { position: absolute; }
.anchor-landing-page [class~="inset-0"] { inset: 0; }
.anchor-landing-page [class~="-inset-1"] { inset: -0.25rem; }
.anchor-landing-page [class~="-z-10"] { z-index: -10; }
.anchor-landing-page [class~="overflow-hidden"] { overflow: hidden; }
.anchor-landing-page [class~="transform-gpu"] { transform: translateZ(0); }
.anchor-landing-page [class~="blur-3xl"] { filter: blur(64px); }
.anchor-landing-page [class~="blur-lg"] { filter: blur(16px); }
.anchor-landing-page [class~="rotate-[30deg]"] { transform: rotate(30deg); }
.anchor-landing-page [class~="-translate-x-1/12"] { transform: translateX(-8.333333%); }
.anchor-landing-page [class~="left-[calc(50%-11rem)]"] { left: calc(50% - 11rem); }
.anchor-landing-page [class~="aspect-[1155/678]"] { aspect-ratio: 1155 / 678; }
.anchor-landing-page [class~="w-[36.125rem]"] { width: 36.125rem; }
.anchor-landing-page [class~="w-full"] { width: 100%; }
.anchor-landing-page [class~="w-fit"] { width: fit-content; }
.anchor-landing-page [class~="h-2"] { height: 0.5rem; }
.anchor-landing-page [class~="w-2"] { width: 0.5rem; }
.anchor-landing-page [class~="h-2.5"] { height: 0.625rem; }
.anchor-landing-page [class~="w-2.5"] { width: 0.625rem; }
.anchor-landing-page [class~="h-24"] { height: 6rem; }
.anchor-landing-page [class~="h-64"] { height: 16rem; }
.anchor-landing-page [class~="w-auto"] { width: auto; }
.anchor-landing-page [class~="max-w-xl"] { max-width: 36rem; }
.anchor-landing-page [class~="max-w-md"] { max-width: 28rem; }
.anchor-landing-page [class~="max-w-7xl"] { max-width: 80rem; }
.anchor-landing-page [class~="mx-auto"] { margin-left: auto; margin-right: auto; }
.anchor-landing-page [class~="mt-1"] { margin-top: 0.25rem; }
.anchor-landing-page [class~="mt-4"] { margin-top: 1rem; }
.anchor-landing-page [class~="mt-6"] { margin-top: 1.5rem; }
.anchor-landing-page [class~="mt-10"] { margin-top: 2.5rem; }
.anchor-landing-page [class~="mt-12"] { margin-top: 3rem; }
.anchor-landing-page [class~="mt-16"] { margin-top: 4rem; }
.anchor-landing-page [class~="mb-4"] { margin-bottom: 1rem; }
.anchor-landing-page [class~="mb-6"] { margin-bottom: 1.5rem; }
.anchor-landing-page [class~="ml-2"] { margin-left: 0.5rem; }
.anchor-landing-page [class~="px-4"] { padding-left: 1rem; padding-right: 1rem; }
.anchor-landing-page [class~="px-6"] { padding-left: 1.5rem; padding-right: 1.5rem; }
.anchor-landing-page [class~="px-8"] { padding-left: 2rem; padding-right: 2rem; }
.anchor-landing-page [class~="py-1.5"] { padding-top: 0.375rem; padding-bottom: 0.375rem; }
.anchor-landing-page [class~="py-4"] { padding-top: 1rem; padding-bottom: 1rem; }
.anchor-landing-page [class~="py-24"] { padding-top: 6rem; padding-bottom: 6rem; }
.anchor-landing-page [class~="p-4"] { padding: 1rem; }
.anchor-landing-page [class~="p-6"] { padding: 1.5rem; }
.anchor-landing-page [class~="pb-4"] { padding-bottom: 1rem; }
.anchor-landing-page [class~="pt-8"] { padding-top: 2rem; }
.anchor-landing-page [class~="flex"] { display: flex; }
.anchor-landing-page [class~="inline-flex"] { display: inline-flex; }
.anchor-landing-page [class~="grid"] { display: grid; }
.anchor-landing-page [class~="flex-col"] { flex-direction: column; }
.anchor-landing-page [class~="items-center"] { align-items: center; }
.anchor-landing-page [class~="justify-center"] { justify-content: center; }
.anchor-landing-page [class~="grid-cols-3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.anchor-landing-page [class~="gap-1.5"] { gap: 0.375rem; }
.anchor-landing-page [class~="gap-4"] { gap: 1rem; }
.anchor-landing-page [class~="gap-x-2"] { column-gap: 0.5rem; }
.anchor-landing-page [class~="rounded-full"] { border-radius: 9999px; }
.anchor-landing-page [class~="rounded-lg"] { border-radius: 0.5rem; }
.anchor-landing-page [class~="rounded-xl"] { border-radius: 0.75rem; }
.anchor-landing-page [class~="rounded-2xl"] { border-radius: 1rem; }
.anchor-landing-page [class~="border"] { border-width: 1px; border-style: solid; }
.anchor-landing-page [class~="border-t"] { border-top-width: 1px; border-top-style: solid; }
.anchor-landing-page [class~="border-b"] { border-bottom-width: 1px; border-bottom-style: solid; }
.anchor-landing-page [class~="border-slate-800"] { border-color: #1e293b; }
.anchor-landing-page [class~="border-slate-900"] { border-color: #0f172a; }
.anchor-landing-page [class~="border-slate-800/80"] { border-color: rgba(30, 41, 59, 0.8); }
.anchor-landing-page [class~="bg-slate-950"] { background-color: #020617; }
.anchor-landing-page [class~="bg-slate-900/50"] { background-color: rgba(15, 23, 42, 0.5); }
.anchor-landing-page [class~="bg-indigo-600"] { background-color: #4f46e5; }
.anchor-landing-page [class~="bg-indigo-500/10"] { background-color: rgba(99, 102, 241, 0.1); }
.anchor-landing-page [class~="bg-emerald-400"] { background-color: #34d399; }
.anchor-landing-page [class~="bg-rose-500/40"] { background-color: rgba(244, 63, 94, 0.4); }
.anchor-landing-page [class~="bg-amber-500/40"] { background-color: rgba(245, 158, 11, 0.4); }
.anchor-landing-page [class~="bg-emerald-500/40"] { background-color: rgba(16, 185, 129, 0.4); }
.anchor-landing-page [class~="bg-gradient-to-b"] { background-image: linear-gradient(to bottom, #0f172a, #0f172a, #020617); }
.anchor-landing-page [class~="bg-gradient-to-tr"] { background-image: linear-gradient(to top right, #6366f1, #34d399); }
.anchor-landing-page [class~="bg-gradient-to-r"] { background-image: linear-gradient(to right, #818cf8, #38bdf8, #34d399); }
.anchor-landing-page [class~="bg-clip-text"] { -webkit-background-clip: text; background-clip: text; }
.anchor-landing-page [class~="text-transparent"] { color: transparent; }
.anchor-landing-page [class~="opacity-20"] { opacity: 0.2; }
.anchor-landing-page [class~="opacity-30"] { opacity: 0.3; }
.anchor-landing-page [class~="text-center"] { text-align: center; }
.anchor-landing-page [class~="text-white"] { color: #fff; }
.anchor-landing-page [class~="text-indigo-400"] { color: #818cf8; }
.anchor-landing-page [class~="text-emerald-400/80"] { color: rgba(52, 211, 153, 0.8); }
.anchor-landing-page [class~="text-slate-300"] { color: #cbd5e1; }
.anchor-landing-page [class~="text-slate-400"] { color: #94a3b8; }
.anchor-landing-page [class~="text-slate-500"] { color: #64748b; }
.anchor-landing-page [class~="text-slate-600"] { color: #475569; }
.anchor-landing-page [class~="text-[10px]"] { font-size: 10px; }
.anchor-landing-page [class~="text-xs"] { font-size: 0.75rem; line-height: 1rem; }
.anchor-landing-page [class~="text-sm"] { font-size: 0.875rem; line-height: 1.25rem; }
.anchor-landing-page [class~="text-lg"] { font-size: 1.125rem; line-height: 1.75rem; }
.anchor-landing-page [class~="text-2xl"] { font-size: 1.5rem; line-height: 2rem; }
.anchor-landing-page [class~="text-4xl"] { font-size: 2.25rem; line-height: 2.5rem; }
.anchor-landing-page [class~="font-mono"] { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.anchor-landing-page [class~="font-medium"] { font-weight: 500; }
.anchor-landing-page [class~="font-semibold"] { font-weight: 600; }
.anchor-landing-page [class~="font-bold"] { font-weight: 700; }
.anchor-landing-page [class~="font-extrabold"] { font-weight: 800; }
.anchor-landing-page [class~="tracking-tight"] { letter-spacing: -0.025em; }
.anchor-landing-page [class~="leading-none"] { line-height: 1; }
.anchor-landing-page [class~="leading-8"] { line-height: 2rem; }
.anchor-landing-page [class~="shadow-lg"] { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.18), 0 4px 6px -2px rgba(0, 0, 0, 0.12); }
.anchor-landing-page [class~="shadow-2xl"] { box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
.anchor-landing-page [class~="shadow-indigo-600/30"] { box-shadow: 0 18px 30px rgba(79, 70, 229, 0.3); }
.anchor-landing-page [class~="ring-1"] { box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2); }
.anchor-landing-page [class~="transition-all"] { transition-property: all; }
.anchor-landing-page [class~="duration-200"] { transition-duration: 200ms; }
.anchor-landing-page [class~="hover:bg-indigo-500"]:hover { background-color: #6366f1; }
.anchor-landing-page [class~="animate-pulse"] { animation: anchorLandingPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
@keyframes anchorLandingPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@media (min-width: 640px) {
  .anchor-landing-page [class~="sm:py-32"] { padding-top: 8rem; padding-bottom: 8rem; }
  .anchor-landing-page [class~="sm:w-[72.1875rem]"] { width: 72.1875rem; }
  .anchor-landing-page [class~="sm:left-[calc(50%-30rem)]"] { left: calc(50% - 30rem); }
  .anchor-landing-page [class~="sm:flex-row"] { flex-direction: row; }
  .anchor-landing-page [class~="sm:items-center"] { align-items: center; }
  .anchor-landing-page [class~="sm:text-left"] { text-align: left; }
  .anchor-landing-page [class~="sm:text-6xl"] { font-size: 3.75rem; line-height: 1; }
  .anchor-landing-page [class~="sm:mt-24"] { margin-top: 6rem; }
}
@media (min-width: 1024px) {
  .anchor-landing-page [class~="lg:grid"] { display: grid; }
  .anchor-landing-page [class~="lg:grid-cols-12"] { grid-template-columns: repeat(12, minmax(0, 1fr)); }
  .anchor-landing-page [class~="lg:gap-x-8"] { column-gap: 2rem; }
  .anchor-landing-page [class~="lg:px-8"] { padding-left: 2rem; padding-right: 2rem; }
  .anchor-landing-page [class~="lg:col-span-7"] { grid-column: span 7 / span 7; }
  .anchor-landing-page [class~="lg:col-span-5"] { grid-column: span 5 / span 5; }
  .anchor-landing-page [class~="lg:mt-0"] { margin-top: 0; }
  .anchor-landing-page [class~="lg:max-w-none"] { max-width: none; }
}
`;
}

function fallbackLandingPageRefine(input: {
  title: string;
  slug: string;
  html: string;
  css: string;
  instruction: string;
  screenshotUsed: boolean;
}) {
  const section = extractFirstSection(input.instruction);
  if (!section) return null;

  const css = input.css.includes("anchorLandingPulse")
    ? input.css
    : `${input.css.trim()}\n\n${landingUtilityCss()}`;

  return landingPageContentSchema.parse({
    title: input.title,
    slug: input.slug,
    html: replaceFirstLandingSection(input.html, section),
    css,
    notes: "Applied the pasted hero section directly after the AI provider failed to return valid JSON.",
  });
}

async function getWordPressConnectionForLandingPage(
  userId: ObjectId,
  wordpressConnectionId: ObjectId,
) {
  const db = await getDb();
  const connection = await db.collection<WordPressConnectionDocument>("wordpressConnections").findOne({
    _id: wordpressConnectionId,
    userId,
    status: "connected",
  });

  if (!connection) {
    throw new Error("Choose a connected WordPress project for this landing page.");
  }

  return connection;
}

function parseWordPressConnectionId(value: string) {
  if (!ObjectId.isValid(value)) {
    throw new Error("Choose a valid WordPress project.");
  }

  return new ObjectId(value);
}

export async function generateLandingPageAction(input: {
  wordpressConnectionId: string;
  title: string;
  intent: string;
  prompt: string;
  designInspiration?: string;
  screenshot?: {
    dataUrl: string;
    fileName: string;
    mimeType: string;
  } | null;
}): Promise<
  ActionResult<{
    projectId: string;
    title: string;
    slug: string;
    html: string;
    css: string;
    notes: string;
    screenshotUsed: boolean;
  }>
> {
  try {
    const session = await requireSession();
    const parsed = landingPageInputSchema.parse(input);
    validateLandingScreenshotSize(parsed.screenshot);

    const wordpressConnectionId = parseWordPressConnectionId(parsed.wordpressConnectionId);
    const connection = await getWordPressConnectionForLandingPage(
      session.objectUserId,
      wordpressConnectionId,
    );
    const settings = getActiveAiSettings(await getAiSettings(session.objectUserId));
    const page = await createLandingPage(
      {
        title: parsed.title,
        intent: parsed.intent,
        prompt: parsed.prompt,
        designInspiration: parsed.designInspiration,
        screenshot: parsed.screenshot,
        websiteContext: connection.websiteContext,
      },
      settings,
    );
    const now = new Date();
    const db = await getDb();
    const result = await db.collection<LandingPageProjectDocument>("landingPageProjects").insertOne({
      userId: session.objectUserId,
      wordpressConnectionId,
      websiteContext: connection.websiteContext ?? "",
      prompt: parsed.prompt,
      intent: parsed.intent,
      designInspiration: parsed.designInspiration,
      screenshot: parsed.screenshot ?? null,
      title: page.title,
      html: page.html,
      css: page.css,
      slug: page.slug,
      notes: page.notes,
      screenshotUsed: page.screenshotUsed,
      status: "content",
      createdAt: now,
      updatedAt: now,
    });

    revalidatePath("/dashboard");

    return {
      ok: true,
      data: {
        projectId: result.insertedId.toString(),
        title: page.title,
        slug: page.slug,
        html: page.html,
        css: page.css,
        notes: page.notes,
        screenshotUsed: page.screenshotUsed,
      },
    };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function refineLandingPageAction(input: {
  projectId: string;
  title: string;
  intent: string;
  prompt: string;
  designInspiration?: string;
  screenshot?: {
    dataUrl: string;
    fileName: string;
    mimeType: string;
  } | null;
  html: string;
  css: string;
  slug: string;
  instruction: string;
}): Promise<ActionResult<{
  title: string;
  slug: string;
  html: string;
  css: string;
  notes: string;
  screenshotUsed: boolean;
}>> {
  try {
    const session = await requireSession();

    if (!ObjectId.isValid(input.projectId)) {
      throw new Error("Invalid landing page project.");
    }

    if (input.instruction.trim().length < 5) {
      throw new Error("Tell AI what to change in the landing page.");
    }
    validateLandingScreenshotSize(input.screenshot);

    const db = await getDb();
    const project = await db.collection<LandingPageProjectDocument>("landingPageProjects").findOne({
      _id: new ObjectId(input.projectId),
      userId: session.objectUserId,
    });

    if (!project) {
      throw new Error("Landing page project not found.");
    }

    const settings = getActiveAiSettings(await getAiSettings(session.objectUserId));
    const screenshot = input.screenshot ?? project.screenshot ?? null;
    let page: {
      title: string;
      slug: string;
      html: string;
      css: string;
      notes: string;
      screenshotUsed: boolean;
    };

    try {
      page = await reviseLandingPage({
        title: input.title,
        intent: input.intent,
        prompt: input.prompt,
        designInspiration: input.designInspiration,
        websiteContext: project.websiteContext,
        screenshot,
        html: input.html,
        css: input.css,
        slug: input.slug,
        instruction: input.instruction,
        settings,
      });
    } catch (error) {
      const fallback = fallbackLandingPageRefine({
        title: input.title,
        slug: input.slug,
        html: input.html,
        css: input.css,
        instruction: input.instruction,
        screenshotUsed: project.screenshotUsed,
      });

      if (!fallback) {
        throw error;
      }

      page = {
        ...fallback,
        screenshotUsed: project.screenshotUsed,
      };
    }

    await db.collection<LandingPageProjectDocument>("landingPageProjects").updateOne(
      { _id: project._id, userId: session.objectUserId },
      {
        $set: {
          title: page.title,
          html: page.html,
          css: page.css,
          slug: page.slug,
          notes: page.notes,
          screenshotUsed: page.screenshotUsed,
          screenshot,
          prompt: input.prompt.trim(),
          intent: input.intent.trim(),
          designInspiration: input.designInspiration?.trim() ?? "",
          status: "content",
          updatedAt: new Date(),
        },
      },
    );

    revalidatePath("/dashboard");
    revalidatePath("/create-landing-page");

    return { ok: true, data: page };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function saveLandingPageChangesAction(input: {
  projectId: string;
  title: string;
  intent: string;
  prompt: string;
  designInspiration?: string;
  html: string;
  css: string;
  slug: string;
  notes?: string;
}): Promise<ActionResult<{ saved: true }>> {
  try {
    const session = await requireSession();

    if (!ObjectId.isValid(input.projectId)) {
      throw new Error("Invalid landing page project.");
    }

    const content = landingPageContentSchema.parse({
      title: input.title,
      html: input.html,
      css: scopeLandingCss(input.css),
      slug: input.slug,
      notes: input.notes ?? "",
    });
    const db = await getDb();
    const result = await db.collection<LandingPageProjectDocument>("landingPageProjects").updateOne(
      { _id: new ObjectId(input.projectId), userId: session.objectUserId },
      {
        $set: {
          title: content.title,
          html: content.html,
          css: content.css,
          slug: content.slug,
          notes: content.notes,
          prompt: input.prompt.trim(),
          intent: input.intent.trim(),
          designInspiration: input.designInspiration?.trim() ?? "",
          status: "content",
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      throw new Error("Landing page project not found.");
    }

    revalidatePath("/dashboard");
    revalidatePath("/create-landing-page");

    return { ok: true, data: { saved: true } };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function publishLandingPageDraftAction(input: {
  projectId: string;
  title: string;
  html: string;
  css: string;
  slug: string;
}): Promise<ActionResult<{ provider: "wordpress"; draftId: string; draftLink: string }>> {
  try {
    const session = await requireSession();

    if (!ObjectId.isValid(input.projectId)) {
      throw new Error("Invalid landing page project.");
    }

    const content = landingPageContentSchema.parse({
      title: input.title,
      html: input.html,
      css: scopeLandingCss(input.css),
      slug: input.slug,
      notes: "",
    });
    const db = await getDb();
    const project = await db.collection<LandingPageProjectDocument>("landingPageProjects").findOne({
      _id: new ObjectId(input.projectId),
      userId: session.objectUserId,
    });

    if (!project) {
      throw new Error("Landing page project not found.");
    }

    const connection = await getWordPressConnectionForLandingPage(
      session.objectUserId,
      project.wordpressConnectionId,
    );
    const draft = project.wordpressPageId
      ? await updateWordPressPageDraft(
          connection,
          project.wordpressPageId,
          content.title,
          landingPagePreviewHtml(content.html, content.css),
          content.slug,
        )
      : await createWordPressPageDraft(
          connection,
          content.title,
          landingPagePreviewHtml(content.html, content.css),
          content.slug,
        );

    await db.collection<LandingPageProjectDocument>("landingPageProjects").updateOne(
      { _id: project._id, userId: session.objectUserId },
      {
        $set: {
          title: content.title,
          html: content.html,
          css: content.css,
          slug: content.slug,
          wordpressPageId: Number(draft.id),
          wordpressLink: draft.link,
          status: "drafted",
          updatedAt: new Date(),
        },
      },
    );

    revalidatePath("/dashboard");
    revalidatePath("/create-landing-page");

    return {
      ok: true,
      data: {
        provider: "wordpress",
        draftId: String(draft.id),
        draftLink: draft.link,
      },
    };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function generateOutlineAction(input: {
  cmsProvider: "wordpress" | "shopify";
  cmsConnectionId: string;
  keyword: string;
  secondaryKeywords?: string;
  seoEntities?: string;
  prompt: string;
}): Promise<ActionResult<{ projectId: string; outline: BlogOutline }>> {
  try {
    const session = await requireSession();
    const parsed = createOutlineSchema.parse(input);
    const cmsConnectionId = parseCmsConnectionId(parsed.cmsConnectionId);
    const settings = getActiveAiSettings(await getAiSettings(session.objectUserId));
    const db = await getDb();
    const cmsConnection = await getCmsConnection(
      db,
      session.objectUserId,
      parsed.cmsProvider,
      cmsConnectionId,
    );
    const websiteContext = cmsConnection.websiteContext ?? "";
    const outline = await createOutline({ ...parsed, websiteContext }, settings);
    const now = new Date();

    const result = await db.collection<BlogProjectDocument>("blogProjects").insertOne({
      userId: session.objectUserId,
      keyword: parsed.keyword,
      secondaryKeywords: parsed.secondaryKeywords,
      seoEntities: parsed.seoEntities,
      prompt: parsed.prompt,
      cmsProvider: parsed.cmsProvider,
      cmsConnectionId,
      websiteContext,
      outline,
      contentHtml: "",
      slug: "",
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

    const db = await getDb();
    const project = await db.collection<BlogProjectDocument>("blogProjects").findOne({
      _id: new ObjectId(input.projectId),
      userId: session.objectUserId,
    });

    if (!project) {
      throw new Error("Project not found.");
    }

    const outline = outlineSchema.parse(input.outline);

    if (input.instruction.trim().length < 5) {
      throw new Error("Tell AI what to change in the outline.");
    }

    const settings = getActiveAiSettings(await getAiSettings(session.objectUserId));
    const revisedOutline = await reviseOutline(
      {
        keyword: project.keyword,
        secondaryKeywords: project.secondaryKeywords,
        seoEntities: project.seoEntities,
        prompt: project.prompt,
        websiteContext: project.websiteContext,
      },
      outline,
      input.instruction,
      settings,
    );
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
    slug: string;
    contentHtml: string;
    metaTitle: string;
    metaDescription: string;
    aiReport: AiContentReport;
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
    const settings = getActiveAiSettings(await getAiSettings(session.objectUserId));
    const content = await createContent(
      {
        keyword: project.keyword,
        secondaryKeywords: project.secondaryKeywords,
        seoEntities: project.seoEntities,
        prompt: project.prompt,
        websiteContext: project.websiteContext,
      },
      outline,
      settings,
    );
    const aiReport = await analyzeContentWithAi(
      {
        keyword: project.keyword,
        secondaryKeywords: project.secondaryKeywords,
        seoEntities: project.seoEntities,
        prompt: project.prompt,
        websiteContext: project.websiteContext,
      },
      content,
      settings,
    );

    await db.collection<BlogProjectDocument>("blogProjects").updateOne(
      { _id: project._id, userId: session.objectUserId },
      {
        $set: {
          outline,
          title: content.title,
          contentHtml: content.contentHtml,
          slug: content.slug,
          metaTitle: content.metaTitle,
          metaDescription: content.metaDescription,
          aiReport,
          status: "content",
          updatedAt: new Date(),
        },
      },
    );

    return { ok: true, data: { ...content, aiReport } };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function refineContentAction(input: {
  projectId: string;
  outline: BlogOutline;
  contentHtml: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  instruction: string;
}): Promise<
  ActionResult<{
    title: string;
    slug: string;
    contentHtml: string;
    metaTitle: string;
    metaDescription: string;
    aiReport: AiContentReport;
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
    const settings = getActiveAiSettings(await getAiSettings(session.objectUserId));
    const content = await reviseContent({
      keyword: project.keyword,
      secondaryKeywords: project.secondaryKeywords,
      seoEntities: project.seoEntities,
      prompt: project.prompt,
      websiteContext: project.websiteContext,
      outline,
      contentHtml: input.contentHtml,
      slug: input.slug,
      metaTitle: input.metaTitle,
      metaDescription: input.metaDescription,
      instruction: input.instruction,
      settings,
    });
    const aiReport = await analyzeContentWithAi(
      {
        keyword: project.keyword,
        secondaryKeywords: project.secondaryKeywords,
        seoEntities: project.seoEntities,
        prompt: project.prompt,
        websiteContext: project.websiteContext,
      },
      {
        title: content.title,
        slug: content.slug,
        contentHtml: content.contentHtml,
        metaTitle: content.metaTitle,
        metaDescription: content.metaDescription,
      },
      settings,
    );

    await db.collection<BlogProjectDocument>("blogProjects").updateOne(
      { _id: project._id, userId: session.objectUserId },
      {
        $set: {
          outline,
          title: content.title,
          contentHtml: content.contentHtml,
          slug: content.slug,
          metaTitle: content.metaTitle,
          metaDescription: content.metaDescription,
          aiReport,
          status: "content",
          updatedAt: new Date(),
        },
      },
    );

    return { ok: true, data: { ...content, aiReport } };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function saveContentChangesAction(input: {
  projectId: string;
  title: string;
  outline: BlogOutline;
  contentHtml: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
}): Promise<ActionResult<{ saved: true }>> {
  try {
    const session = await requireSession();

    if (!ObjectId.isValid(input.projectId)) {
      throw new Error("Invalid project.");
    }

    const outline = outlineSchema.parse(input.outline);
    const slug = input.slug.trim() ? slugSchema.parse(input.slug) : "";
    const now = new Date();
    const db = await getDb();
    const result = await db.collection<BlogProjectDocument>("blogProjects").updateOne(
      { _id: new ObjectId(input.projectId), userId: session.objectUserId },
      {
        $set: {
          outline,
          title: input.title.trim(),
          contentHtml: input.contentHtml,
          slug,
          metaTitle: input.metaTitle.trim(),
          metaDescription: input.metaDescription.trim(),
          status: "content",
          updatedAt: now,
        },
      },
    );

    if (result.matchedCount === 0) {
      throw new Error("Project not found.");
    }

    revalidatePath("/dashboard");
    revalidatePath("/create");

    return { ok: true, data: { saved: true } };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function analyzeContentAction(input: {
  projectId: string;
  title: string;
  contentHtml: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
}): Promise<ActionResult<AiContentReport>> {
  try {
    const session = await requireSession();

    if (!ObjectId.isValid(input.projectId)) {
      throw new Error("Invalid project.");
    }

    if (!input.title.trim() || input.contentHtml.trim().length < 100) {
      throw new Error("Add a title and complete article content before checking it.");
    }

    const db = await getDb();
    const project = await db.collection<BlogProjectDocument>("blogProjects").findOne({
      _id: new ObjectId(input.projectId),
      userId: session.objectUserId,
    });

    if (!project) {
      throw new Error("Project not found.");
    }

    const settings = getActiveAiSettings(await getAiSettings(session.objectUserId));
    const report = await analyzeContentWithAi(
      {
        keyword: project.keyword,
        secondaryKeywords: project.secondaryKeywords,
        seoEntities: project.seoEntities,
        prompt: project.prompt,
        websiteContext: project.websiteContext,
      },
      {
        title: input.title,
        slug: input.slug,
        contentHtml: input.contentHtml,
        metaTitle: input.metaTitle,
        metaDescription: input.metaDescription,
      },
      settings,
    );

    await db.collection<BlogProjectDocument>("blogProjects").updateOne(
      { _id: project._id, userId: session.objectUserId },
      {
        $set: {
          title: input.title.trim(),
          contentHtml: input.contentHtml,
          slug: input.slug,
          metaTitle: input.metaTitle,
          metaDescription: input.metaDescription,
          aiReport: report,
          updatedAt: new Date(),
        },
      },
    );

    return { ok: true, data: report };
  } catch (error) {
    return { ok: false, error: flattenError(error) };
  }
}

export async function publishDraftAction(input: {
  projectId: string;
  title: string;
  outline: BlogOutline;
  contentHtml: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  featuredImage?: {
    dataUrl: string;
    fileName: string;
    mimeType: string;
  } | null;
}): Promise<ActionResult<{ provider: "wordpress" | "shopify"; draftId: string; draftLink: string }>> {
  try {
    const session = await requireSession();

    if (!ObjectId.isValid(input.projectId)) {
      throw new Error("Invalid project.");
    }

    if (!input.title.trim() || input.contentHtml.trim().length < 100) {
      throw new Error("Add a title and complete article content before drafting.");
    }

    const slug = slugSchema.parse(input.slug);

    const db = await getDb();
    const project = await db.collection<BlogProjectDocument>("blogProjects").findOne({
      _id: new ObjectId(input.projectId),
      userId: session.objectUserId,
    });

    if (!project) {
      throw new Error("Project not found.");
    }

    if (!project.cmsProvider || !project.cmsConnectionId) {
      throw new Error("This blog does not have a selected CMS project. Create a new blog and choose one before generating the outline.");
    }

    const cmsConnection = await getCmsConnection(
      db,
      session.objectUserId,
      project.cmsProvider,
      project.cmsConnectionId,
    );
    const provider = project.cmsProvider;
    const draft = provider === "wordpress"
      ? await createWordPressDraft(
          cmsConnection as WordPressConnectionDocument,
          input.title,
          input.contentHtml,
          slug,
          input.featuredImage,
        )
      : await createShopifyDraft(
          cmsConnection as ShopifyConnectionDocument,
          input.title,
          input.contentHtml,
          input.metaDescription,
          input.featuredImage,
        );

    await db.collection<BlogProjectDocument>("blogProjects").updateOne(
      { _id: project._id, userId: session.objectUserId },
      {
        $set: {
          outline: outlineSchema.parse(input.outline),
          title: input.title,
          contentHtml: input.contentHtml,
          slug,
          metaTitle: input.metaTitle,
          metaDescription: input.metaDescription,
          draftProvider: provider,
          cmsDraftId: String(draft.id),
          cmsDraftLink: draft.link,
          status: "drafted",
          ...(provider === "wordpress"
            ? {
                wordpressPostId: Number(draft.id),
                wordpressLink: draft.link,
              }
            : {}),
          updatedAt: new Date(),
        },
        ...(provider === "wordpress"
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

async function countCmsConnections(userId: ObjectId) {
  const db = await getDb();
  const [wordpressCount, shopifyCount] = await Promise.all([
    db.collection<WordPressConnectionDocument>("wordpressConnections").countDocuments({
      userId,
      status: "connected",
    }),
    db.collection<ShopifyConnectionDocument>("shopifyConnections").countDocuments({
      userId,
      status: "connected",
    }),
  ]);

  return wordpressCount + shopifyCount;
}

function parseCmsConnectionId(value: string) {
  if (!ObjectId.isValid(value)) {
    throw new Error("Choose a valid CMS project.");
  }

  return new ObjectId(value);
}

async function getCmsConnection(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: ObjectId,
  provider: "wordpress" | "shopify",
  connectionId: ObjectId,
) {
  const collection =
    provider === "wordpress"
      ? db.collection<WordPressConnectionDocument>("wordpressConnections")
      : db.collection<ShopifyConnectionDocument>("shopifyConnections");
  const connection = await collection.findOne({
    _id: connectionId,
    userId,
    status: "connected",
  });

  if (!connection) {
    throw new Error("Selected CMS project was not found. Connect it again or choose another project.");
  }

  return connection;
}
