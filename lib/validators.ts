import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export const wordpressConnectionSchema = z.object({
  siteUrl: z.string().trim().url("Enter a valid WordPress site URL."),
  wpUsername: z.string().trim().min(1, "Enter your WordPress username."),
  wpApplicationPassword: z
    .string()
    .trim()
    .refine(
      (s) => s.replace(/\s+/g, "").length >= 24,
      "Paste the full WordPress application password (24 characters, with or without spaces).",
    ),
});

export const shopifyConnectionSchema = z.object({
  shopDomain: z
    .string()
    .trim()
    .min(3, "Enter your Shopify store domain.")
    .transform((value) =>
      value
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "")
        .trim()
        .toLowerCase(),
    )
    .refine((value) => /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(value), {
      message: "Enter a valid Shopify domain, like your-store.myshopify.com.",
    }),
  accessToken: z.string().trim().min(20, "Enter your Shopify Admin API access token."),
  blogId: z
    .string()
    .trim()
    .min(1, "Enter the Shopify Blog ID.")
    .transform((value) =>
      /^\d+$/.test(value) ? `gid://shopify/Blog/${value}` : value,
    )
    .refine((value) => value.startsWith("gid://shopify/Blog/"), {
      message: "Use a Shopify Blog GID, or paste the numeric Blog ID.",
    }),
  authorName: z.string().trim().min(2, "Enter the article author name."),
});

export const outlineSchema = z.object({
  title: z.string().trim().min(5),
  sections: z
    .array(
      z.object({
        heading: z.string().trim().min(2),
        bullets: z.array(z.string().trim().min(2)).min(1),
      }),
    )
    .min(3),
});

export const slugSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .transform((value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  )
  .refine((value) => value.length >= 3, "Slug must include at least 3 letters or numbers.");

export const contentSchema = z.object({
  title: z.string().trim().min(5),
  slug: slugSchema,
  contentHtml: z.string().trim().min(100),
  metaTitle: z.string().trim().min(10).max(80),
  metaDescription: z.string().trim().min(40).max(180),
});

export const createOutlineSchema = z.object({
  keyword: z.string().trim().min(2, "Keyword is required."),
  secondaryKeywords: z.string().trim().optional().default(""),
  seoEntities: z.string().trim().optional().default(""),
  prompt: z.string().trim().min(10, "Prompt must describe the blog goal."),
});

export const aiSettingsSchema = z.object({
  activeProvider: z.enum(["gpt", "claude", "gemini"]),
  gptApiKey: z.string().trim().optional().default(""),
  gptModel: z.enum(["gpt-5.4", "gpt-5.5"]),
  claudeApiKey: z.string().trim().optional().default(""),
  claudeModel: z.enum(["claude-sonnet-4.6", "claude-haiku-4.5", "claude-opus-4.7"]),
  geminiApiKey: z.string().trim().optional().default(""),
  geminiModel: z.enum(["gemini-3.0", "gemini-3.1"]),
});
