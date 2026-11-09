"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { sql } from "@/db";
import { audit } from "@/server/audit";
import { SESSION_COOKIE, SESSION_HOURS, signSession } from "@/server/session";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  password: z.string().min(1, "Enter your password").max(200),
  next: z.string().optional(),
});

export interface LoginState {
  error?: string;
  email?: string;
}

const MAX_FAILS = 5;
// Real bcrypt hash of a random string, compared when the email is unknown (constant-ish timing).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-account-" + Math.random(), 10);
const WINDOW_MIN = 15;

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: form.get("email"), password: form.get("password"), next: form.get("next") ?? undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email: String(form.get("email") ?? "") };
  const { email, password, next } = parsed.data;

  const [{ fails }] = await sql<{ fails: number }[]>`select count(*)::int as fails from login_attempts where email = ${email} and not ok and at > now() - make_interval(mins => ${WINDOW_MIN})`;
  if (fails >= MAX_FAILS) return { error: `Too many failed attempts. Try again in ${WINDOW_MIN} minutes.`, email };

  const [user] = await sql<{ id: number; name: string; role: "finance_exec" | "cofounder"; password_hash: string }[]>`select id, name, role, password_hash from users where email = ${email}`;
  // Compare against a dummy hash when the user does not exist, so timing does not reveal accounts.
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  await sql`insert into login_attempts (email, ok) values (${email}, ${ok && !!user})`;
  if (!user || !ok) return { error: "Email or password is incorrect.", email };

  const token = await signSession({ sub: String(user.id), role: user.role, name: user.name });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_HOURS * 3600 });
  await audit(sql, user.id, "auth.login", "user", user.id);
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
