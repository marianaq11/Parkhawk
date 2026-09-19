import { createClient } from "@supabase/supabase-js";
import type { Profile, Snapshot } from "./types";
import { AppError } from "./authorization";
import type { AdminInput, ReportInput } from "./validation";
export const isSupabase = () => process.env.DATA_BACKEND === "supabase";
export function supabase(service = false) {
  const url = process.env.SUPABASE_URL,
    key = service
      ? process.env.SUPABASE_SERVICE_ROLE_KEY
      : process.env.SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new AppError(
      "Supabase is not configured. Check the server environment variables.",
      503,
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function snapshot(): Promise<Snapshot> {
  if (!isSupabase()) return (await import("./sqlite")).localSnapshot();
  const client = supabase(true);
  // PostgREST limits responses; fetch explicit pages so older rows cannot hide
  // active reports after the demo has been used for a while.
  async function allRows(table: string) {
    const rows: Record<string, unknown>[] = [];
    for (let start = 0; ; start += 500) {
      const result = await client
        .from(table)
        .select("*")
        .order("id")
        .range(start, start + 499);
      if (result.error) return { data: rows, error: result.error };
      rows.push(...result.data);
      if (result.data.length < 500) return { data: rows, error: null };
    }
  }
  const results = await Promise.all(
    ["profiles", "parking_locations", "reports", "report_feedback"].map(
      allRows,
    ),
  );
  if (results.some((r) => r.error))
    throw new AppError("Unable to load parking data.", 503);
  return {
    profiles: results[0].data as Profile[],
    locations: results[1].data as Snapshot["locations"],
    reports: results[2].data as Snapshot["reports"],
    feedback: results[3].data as Snapshot["feedback"],
  };
}
export async function login(email: string, password: string) {
  if (!isSupabase())
    return (await import("./sqlite")).localLogin(email, password);
  const { data, error } = await supabase().auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session)
    throw new AppError("Email or password is incorrect.", 401);
  return {
    token: data.session.access_token,
    expiresIn: data.session.expires_in,
  };
}
export async function userForToken(
  token: string,
): Promise<Profile | undefined> {
  if (!isSupabase()) return (await import("./sqlite")).localUser(token);
  const { data, error } = await supabase().auth.getUser(token);
  if (error || !data.user) return undefined;
  const { data: profile } = await supabase(true)
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();
  return profile as Profile | undefined;
}
export async function logout(token: string) {
  if (!isSupabase()) return (await import("./sqlite")).localLogout(token);
  await supabase(true).auth.admin.signOut(token);
}
async function rpc(name: string, args: Record<string, unknown>) {
  const { error, data } = await supabase(true).rpc(name, args);
  if (error)
    throw new AppError(
      error.message,
      error.message.includes("Administrator") ||
        error.message.includes("suspended")
        ? 403
        : 400,
    );
  return data;
}
export async function submit(userId: string, input: ReportInput) {
  return isSupabase()
    ? rpc("submit_report", { actor: userId, payload: input })
    : (await import("./sqlite")).localSubmit(userId, input);
}
export async function feedback(
  userId: string,
  reportId: string,
  type: "STILL_OPEN" | "TAKEN",
) {
  return isSupabase()
    ? rpc("respond_report", {
        actor: userId,
        report_id_input: reportId,
        response: type,
      })
    : (await import("./sqlite")).localFeedback(userId, reportId, type);
}
export async function admin(userId: string, input: AdminInput) {
  return isSupabase()
    ? rpc("admin_action", { actor: userId, payload: input })
    : (await import("./sqlite")).localAdmin(userId, input);
}
