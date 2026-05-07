import type { ObjectId } from "mongodb";

export type UserDocument = {
  _id?: ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
};

export type WordPressConnectionDocument = {
  _id?: ObjectId;
  userId: ObjectId;
  siteUrl: string;
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

export type OutlineSection = {
  heading: string;
  bullets: string[];
};

export type BlogOutline = {
  title: string;
  sections: OutlineSection[];
};

export type BlogProjectDocument = {
  _id?: ObjectId;
  userId: ObjectId;
  keyword: string;
  prompt: string;
  outline: BlogOutline;
  contentHtml: string;
  metaTitle: string;
  metaDescription: string;
  status: "outline" | "content" | "drafted";
  wordpressPostId?: number;
  wordpressLink?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };
