import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { Permission } from "@/lib/permissions";
import { ForbiddenError, requirePermission, type CurrentUser } from "./auth";

/** Wrap a route handler: permission check, JSON errors, never leak stack traces. */
export function route<C>(perm: Permission, fn: (req: Request, user: CurrentUser, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    let user: CurrentUser;
    try {
      user = await requirePermission(perm);
    } catch (e) {
      return NextResponse.json({ error: e instanceof ForbiddenError ? e.message : "Not signed in" }, { status: 403 });
    }
    try {
      return await fn(req, user, ctx);
    } catch (e) {
      if (e instanceof ZodError) return NextResponse.json({ error: "Invalid request", issues: e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: "Something went wrong on our side. Nothing was saved from this step." }, { status: 500 });
    }
  };
}
