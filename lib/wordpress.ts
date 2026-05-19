import { Buffer } from "node:buffer";

import type { WordPressConnectionDocument } from "@/lib/types";

export function normalizeSiteUrl(siteUrl: string) {
  return siteUrl.trim().replace(/\/+$/, "");
}

/**
 * LiteSpeed (and similar CDNs) may cache unauthenticated 401 JSON for REST URLs. A unique query
 * param bypasses a cache key that ignores the Authorization header so app-password auth succeeds.
 */
function usersMeContextEditUrl(baseUrl: string): string {
  const u = new URL(`${normalizeSiteUrl(baseUrl)}/wp-json/wp/v2/users/me`);
  u.searchParams.set("context", "edit");
  u.searchParams.set(
    "_anchor_req",
    `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
  );
  return u.href;
}

function postsCreateUrl(baseUrl: string): string {
  const u = new URL(`${normalizeSiteUrl(baseUrl)}/wp-json/wp/v2/posts`);
  u.searchParams.set(
    "_anchor_req",
    `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
  );
  return u.href;
}

function mediaCreateUrl(baseUrl: string): string {
  const u = new URL(`${normalizeSiteUrl(baseUrl)}/wp-json/wp/v2/media`);
  u.searchParams.set(
    "_anchor_req",
    `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
  );
  return u.href;
}

/**
 * Follows redirects that commonly break Basic auth (www → apex, http → https).
 * Node fetch often drops Authorization on cross-URL redirects.
 */
export async function resolveWordPressBaseUrl(initial: string): Promise<string> {
  let current = normalizeSiteUrl(initial);
  const seen = new Set<string>();

  for (let hop = 0; hop < 12; hop++) {
    if (seen.has(current)) break;
    seen.add(current);

    const wpJsonUrl = `${current}/wp-json/`;
    const res = await fetch(wpJsonUrl, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      const next = new URL(loc, wpJsonUrl);
      const path = next.pathname.replace(/\/+$/, "");
      if (path.endsWith("/wp-json")) {
        const prefix = path.slice(0, -"/wp-json".length);
        current = normalizeSiteUrl(`${next.origin}${prefix}`);
      } else {
        current = normalizeSiteUrl(`${next.origin}${path}`);
      }
      continue;
    }

    if (res.status === 200 || res.status === 404) {
      break;
    }
    break;
  }

  return current;
}

/** WordPress shows app passwords with spaces; REST accepts them without. */
function normalizeApplicationPassword(value: string) {
  return value.replace(/\s+/g, "");
}

export function authorizationHeaderForWordPress(connection: WordPressConnectionDocument): string {
  const user = connection.wpUsername?.trim();
  const app = connection.wpApplicationPassword;
  if (user && typeof app === "string" && normalizeApplicationPassword(app).length > 0) {
    const encoded = Buffer.from(
      `${user.toLowerCase()}:${normalizeApplicationPassword(app)}`,
      "utf8",
    ).toString("base64");
    return `Basic ${encoded}`;
  }
  const token = connection.token?.trim();
  if (token) {
    return `Bearer ${token}`;
  }
  throw new Error("WordPress credentials are missing.");
}

export async function validateWordPressConnection(
  siteUrl: string,
  credentials: { wpUsername: string; wpApplicationPassword: string },
): Promise<{ siteUrl: string; wpUsername: string }> {
  const baseUrl = await resolveWordPressBaseUrl(normalizeSiteUrl(siteUrl));
  const appSecret = normalizeApplicationPassword(credentials.wpApplicationPassword);

  const encoded = (user: string) =>
    Buffer.from(`${user}:${appSecret}`, "utf8").toString("base64");

  const tryUser = async (username: string) => {
    return await fetch(usersMeContextEditUrl(baseUrl), {
      headers: {
        Authorization: `Basic ${encoded(username)}`,
        Accept: "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      cache: "no-store",
    });
  };

  const trimmedUser = credentials.wpUsername.trim();
  let response = await tryUser(trimmedUser);
  let resolvedUsername = trimmedUser;

  if (response.status === 401 && trimmedUser !== trimmedUser.toLowerCase()) {
    response = await tryUser(trimmedUser.toLowerCase());
    if (response.ok) {
      resolvedUsername = trimmedUser.toLowerCase();
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "WordPress returned 401 (unauthorized). Check username and application password. If both are correct, your host may cache REST responses without the Authorization header (LiteSpeed/CDN); this app adds a cache-bypass on validate—try again, or exclude /wp-json/* from cache in your host panel.",
      );
    }
    throw new Error(
      `WordPress rejected the credentials (HTTP ${response.status}). Check username and application password.`,
    );
  }

  await response.json().catch(() => null);

  return { siteUrl: baseUrl, wpUsername: resolvedUsername };
}

export async function createWordPressDraft(
  connection: WordPressConnectionDocument,
  title: string,
  contentHtml: string,
  slug: string,
  featuredImage?: { dataUrl: string; fileName: string; mimeType: string } | null,
) {
  const baseUrl = await resolveWordPressBaseUrl(normalizeSiteUrl(connection.siteUrl));
  const featuredMediaId = featuredImage
    ? await uploadWordPressMedia(connection, baseUrl, featuredImage)
    : undefined;
  const response = await fetch(postsCreateUrl(baseUrl), {
    method: "POST",
    headers: {
      Authorization: authorizationHeaderForWordPress(connection),
      "Content-Type": "application/json",
      Accept: "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    body: JSON.stringify({
      title,
      slug,
      content: contentHtml,
      status: "draft",
      ...(featuredMediaId ? { featured_media: featuredMediaId } : {}),
    }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof body?.message === "string"
        ? body.message
        : `WordPress returned status ${response.status}.`;
    throw new Error(message);
  }

  return {
    id: Number(body.id),
    link: typeof body.link === "string" ? body.link : "",
  };
}

async function uploadWordPressMedia(
  connection: WordPressConnectionDocument,
  baseUrl: string,
  image: { dataUrl: string; fileName: string; mimeType: string },
) {
  const bytes = dataUrlToBytes(image.dataUrl);
  const response = await fetch(mediaCreateUrl(baseUrl), {
    method: "POST",
    headers: {
      Authorization: authorizationHeaderForWordPress(connection),
      "Content-Type": image.mimeType,
      "Content-Disposition": `attachment; filename="${sanitizeFilename(image.fileName)}"`,
      Accept: "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    body: bytes,
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof body?.message === "string"
        ? body.message
        : `WordPress media upload returned status ${response.status}.`;
    throw new Error(message);
  }

  if (typeof body?.id !== "number") {
    throw new Error("WordPress uploaded the featured image but did not return a media ID.");
  }

  return body.id;
}

function dataUrlToBytes(dataUrl: string) {
  const [, base64] = dataUrl.split(",");
  if (!base64) throw new Error("Featured image data is invalid.");
  return Buffer.from(base64, "base64");
}

function sanitizeFilename(fileName: string) {
  return fileName.trim().replace(/[^a-zA-Z0-9._-]/g, "-") || "featured-image.png";
}
