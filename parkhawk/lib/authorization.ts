import type { Profile } from "./types";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function requireAdmin(user: Profile) {
  if (user.role !== "ADMIN")
    throw new AppError("Administrator access required.", 403);
}
export function requireReporting(user: Profile, now = Date.now()) {
  if (
    user.reporting_suspended_until &&
    Date.parse(user.reporting_suspended_until) > now
  )
    throw new AppError(
      "Your reporting privileges are temporarily suspended. You can still view parking conditions.",
      403,
    );
}
