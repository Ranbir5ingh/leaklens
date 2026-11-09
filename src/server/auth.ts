import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@/db";
import { can, type Permission, type Role } from "@/lib/permissions";
import { SESSION_COOKIE, verifySession } from "./session";

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

/** Data access layer: the one place that turns a cookie into a user. Re-checks the DB each request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = await verifySession(token);
  if (!s) return null;
  const [u] = await sql<CurrentUser[]>`select id, name, email, role from users where id = ${Number(s.sub)}`;
  return u ?? null;
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export class ForbiddenError extends Error {
  constructor(p: Permission) {
    super(`Your role cannot do this (${p}).`);
  }
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function requirePermission(p: Permission): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new ForbiddenError(p);
  if (!can(u.role, p)) throw new ForbiddenError(p);
  return u;
}
