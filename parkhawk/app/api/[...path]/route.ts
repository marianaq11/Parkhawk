import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import { apiUser } from "@/lib/auth";
import { admin, feedback, login, logout, snapshot, submit } from "@/lib/data";
import { dashboard } from "@/lib/view";
import { AppError } from "@/lib/authorization";
import {
  adminSchema,
  feedbackSchema,
  loginSchema,
  reportSchema,
} from "@/lib/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await context.params).path.join("/");
    if (request.method === "POST") {
      const origin = request.headers.get("origin");
      const expectedOrigin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
      if (!origin || origin !== expectedOrigin)
        throw new AppError("Invalid request origin.", 403);
      if (!request.headers.get("content-type")?.includes("application/json"))
        throw new AppError("Expected JSON.", 415);
      const raw = await request.text();
      if (raw.length > 5000) throw new AppError("Request too large.", 413);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new AppError("Invalid JSON.");
      }
      if (path === "login") {
        const credentials = loginSchema.parse(body),
          result = await login(
            credentials.email.toLowerCase(),
            credentials.password,
          );
        (await cookies()).set("parkhawk_session", result.token, {
          httpOnly: true,
          secure: request.nextUrl.protocol === "https:",
          sameSite: "lax",
          path: "/",
          maxAge: result.expiresIn,
        });
        return NextResponse.json({ ok: true });
      }
      const user = await apiUser(path === "admin");
      if (path === "logout") {
        const token = (await cookies()).get("parkhawk_session")?.value;
        if (token) await logout(token);
        (await cookies()).delete("parkhawk_session");
      } else if (path === "reports")
        await submit(user.id, reportSchema.parse(body));
      else if (path === "feedback") {
        const input = feedbackSchema.parse(body);
        await feedback(user.id, input.report_id, input.feedback_type);
      } else if (path === "admin")
        await admin(user.id, adminSchema.parse(body));
      else throw new AppError("Not found.", 404);
      return NextResponse.json({ ok: true });
    }
    if (path === "dashboard") {
      const user = await apiUser();
      return NextResponse.json(dashboard(await snapshot(), user), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (path === "admin") {
      await apiUser(true);
      return NextResponse.json(await snapshot(), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    throw new AppError("Not found.", 404);
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid input." },
        { status: 400 },
      );
    if (error instanceof AppError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error(
      "ParkHawk request failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
export const GET = handle;
export const POST = handle;
