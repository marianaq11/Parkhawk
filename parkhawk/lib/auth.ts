import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { userForToken } from "./data";
import { AppError, requireAdmin } from "./authorization";
export async function currentUser() {
  const token = (await cookies()).get("parkhawk_session")?.value;
  return token ? userForToken(token) : undefined;
}
export async function pageUser(admin = false) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (admin && user.role !== "ADMIN") redirect("/");
  return user;
}
export async function apiUser(admin = false) {
  const user = await currentUser();
  if (!user) throw new AppError("Please sign in.", 401);
  if (admin) requireAdmin(user);
  return user;
}
