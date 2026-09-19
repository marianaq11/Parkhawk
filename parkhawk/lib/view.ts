import type { Profile, Snapshot } from "./types";
import { isActive, rankings, reportConfidence } from "./parking";
export function dashboard(data: Snapshot, user: Profile) {
  const now = Date.now();
  const reports = data.reports
    .filter(
      (r) =>
        r.report_type !== "SEARCHING" &&
        r.status !== "REMOVED" &&
        data.locations.some((l) => l.id === r.parking_location_id && l.active),
    )
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((r) => ({
      id: r.id,
      parking_location_id: r.parking_location_id,
      report_type: r.report_type,
      zone_or_floor: r.zone_or_floor,
      quantity: r.quantity,
      leaving_eta_minutes: r.leaving_eta_minutes,
      traffic_level: r.traffic_level,
      note: r.note,
      created_at: r.created_at,
      expires_at: r.expires_at,
      active: isActive(r, now),
      confidence: reportConfidence(r, data, now),
      own: r.user_id === user.id,
      confirmations: data.feedback.filter(
        (f) => f.report_id === r.id && f.feedback_type === "STILL_OPEN",
      ).length,
      responded: data.feedback.some(
        (f) => f.report_id === r.id && f.user_id === user.id,
      ),
    }));
  return {
    user,
    lots: rankings(data, now),
    reports,
    updatedAt: new Date(now).toISOString(),
  };
}
export type DashboardData = ReturnType<typeof dashboard>;
