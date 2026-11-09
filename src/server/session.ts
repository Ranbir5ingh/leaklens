import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ll_session";
export const SESSION_HOURS = 8;
export type Role = "finance_exec" | "cofounder";
export interface SessionPayload {
  sub: string;
  role: Role;
  name: string;
}

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars) — see deployment.md");
  return new TextEncoder().encode(s);
}

export async function signSession(p: SessionPayload): Promise<string> {
  return new SignJWT({ role: p.role, name: p.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub || (payload.role !== "finance_exec" && payload.role !== "cofounder")) return null;
    return { sub: payload.sub, role: payload.role, name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}
