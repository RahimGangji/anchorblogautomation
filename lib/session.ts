import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

const cookieName = "anchorblog_session";
const secret = process.env.SESSION_SECRET;

export type SessionPayload = {
  userId: string;
  email: string;
};

function getEncodedSecret() {
  if (!secret) {
    throw new Error("SESSION_SECRET is required.");
  }

  return new TextEncoder().encode(secret);
}

export async function createSession(payload: SessionPayload) {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getEncodedSecret());

  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(cookieName)?.value;

  if (!token) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, getEncodedSecret());
    const payload = verified.payload;

    if (typeof payload.userId !== "string" || typeof payload.email !== "string") {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
    };
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(cookieName);
}
