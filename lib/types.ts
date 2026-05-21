import type { ObjectId } from "mongodb";

export type UserDocument = {
  _id?: ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
};

export type AiProvider = "gpt" | "claude" | "gemini";

export type AiSettingsDocument = {
  _id?: ObjectId;
  userId: ObjectId;
  activeProvider: AiProvider;
  gptApiKey?: string;
  gptModel: string;
  claudeApiKey?: string;
  claudeModel: string;
  geminiApiKey?: string;
  geminiModel: string;
  createdAt: Date;
  updatedAt: Date;
};

export type WordPressConnectionDocument = {
  _id?: ObjectId;
  userId: ObjectId;
  siteUrl: string;
  websiteContext?: string;
  /** Legacy JWT / plugin Bearer token (still honored if set). */
  token?: string;
  /** WordPress username for Application Password (HTTP Basic) auth. */
  wpUsername?: string;
  /** Application password as shown in WordPress (spaces optional). */
  wpApplicationPassword?: string;
  status: "connected" | "error";
  lastValidatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type ShopifyConnectionDocument = {
  _id?: ObjectId;
  userId: ObjectId;
  shopDomain: string;
  websiteContext?: string;
  accessToken: string;
  blogId: string;
  blogTitle: string;
  authorName: string;
  status: "connected" | "error";
  lastValidatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type OutlineSection = {
  heading: string;
  bullets: string[];
};

export type BlogOutline = {
  title: string;
  sections: OutlineSection[];
};

export type AiContentIssue = {
  severity: "good" | "warning" | "error";
  location: string;
  issue: string;
  recommendation: string;
};

export type AiContentReportDocument = {
  seoScore: number;
  readabilityScore: number;
  summary: string;
  seoAnalysis: AiContentIssue[];
  readabilityAnalysis: AiContentIssue[];
};

export type BlogProjectDocument = {
  _id?: ObjectId;
  userId: ObjectId;
  keyword: string;
  secondaryKeywords?: string;
  seoEntities?: string;
  prompt: string;
  cmsProvider?: "wordpress" | "shopify";
  cmsConnectionId?: ObjectId;
  websiteContext?: string;
  outline: BlogOutline;
  title?: string;
  contentHtml: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  aiReport?: AiContentReportDocument;
  status: "outline" | "content" | "drafted";
  draftProvider?: "wordpress" | "shopify";
  cmsDraftId?: string;
  cmsDraftLink?: string;
  wordpressPostId?: number;
  wordpressLink?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };
