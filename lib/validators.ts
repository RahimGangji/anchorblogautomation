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

export const contentSchema = z.object({
  title: z.string().trim().min(5),
  contentHtml: z.string().trim().min(100),
  metaTitle: z.string().trim().min(10).max(80),
  metaDescription: z.string().trim().min(40).max(180),
});

export const createOutlineSchema = z.object({
  keyword: z.string().trim().min(2, "Keyword is required."),
  prompt: z.string().trim().min(10, "Prompt must describe the blog goal."),
});
