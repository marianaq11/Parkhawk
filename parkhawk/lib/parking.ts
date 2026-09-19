import type { Report, Snapshot, Location } from "./types";
export const clamp = (n: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, n));
export function isActive(report: Report, now = Date.now()) {
  return (
    report.status === "ACTIVE" &&
    Date.parse(report.created_at) <= now &&
    Date.parse(report.expires_at) > now
  );
}
export function lifetime(type: Report["report_type"], eta = 0) {
  return (
    { OPEN_SPOT: 3, LEAVING_SOON: eta + 5, SEARCHING: 15, TRAFFIC: 10 }[type] *
    60_000
  );
}
export function freshness(report: Report, now = Date.now()) {
  return isActive(report, now)
    ? clamp(
        (Date.parse(report.expires_at) - now) /
          (Date.parse(report.expires_at) - Date.parse(report.created_at)),
        0,
        1,
      )
    : 0;
}
export function confidence(
  report: Report,
  reliability: number,
  confirmations = 0,
  negatives = 0,
  now = Date.now(),
) {
  // Reliability sets the starting trust (20–80). Independent confirmations add 8,
  // capped at 24. The entire signal decays linearly; a taken response closes it.
  if (negatives > 0) return 0;
  return Math.round(
    clamp(
      (20 + 0.6 * clamp(reliability) + Math.min(confirmations, 3) * 8) *
        freshness(report, now),
    ),
  );
}
export const confidenceLabel = (score: number) =>
  score >= 65 ? "High" : score >= 35 ? "Medium" : "Low";
export function reportConfidence(
  report: Report,
  data: Snapshot,
  now = Date.now(),
) {
  const votes = data.feedback.filter((f) => f.report_id === report.id);
  return confidence(
    report,
    data.profiles.find((p) => p.id === report.user_id)?.reliability_score ?? 80,
    votes.filter((f) => f.feedback_type === "STILL_OPEN").length,
    votes.filter((f) => f.feedback_type === "TAKEN").length,
    now,
  );
}
export function opportunity(
  location: Location,
  data: Snapshot,
  now = Date.now(),
) {
  const active = data.reports.filter(
    (r) => r.parking_location_id === location.id && isActive(r, now),
  );
  const open = active.filter((r) => r.report_type === "OPEN_SPOT");
  const leaving = active.filter((r) => r.report_type === "LEAVING_SOON");
  const search = active.filter((r) => r.report_type === "SEARCHING");
  const traffic = active.filter((r) => r.report_type === "TRAFFIC");
  const reliability = (r: Report) =>
    clamp(
      data.profiles.find((p) => p.id === r.user_id)?.reliability_score ?? 80,
    ) / 100;
  const trafficWeight = traffic.reduce(
    (s, r) => s + freshness(r, now) * reliability(r),
    0,
  );
  const congestion = trafficWeight
    ? traffic.reduce(
        (s, r) =>
          s +
          { LIGHT: 0, MODERATE: 1, HEAVY: 2 }[r.traffic_level ?? "LIGHT"] *
            freshness(r, now) *
            reliability(r),
        0,
      ) / trafficWeight
    : null;
  // 45 is a neutral baseline, not a measured vacancy rate. More reliable, newer
  // signals have more influence. Each category is capped to limit report volume.
  const spaces = Math.min(
    30,
    open.reduce(
      (s, r) =>
        s + (12 * (r.quantity ?? 1) * reportConfidence(r, data, now)) / 100,
      0,
    ),
  );
  const departures = Math.min(
    30,
    leaving.reduce((s, r) => {
      const remaining =
        (Date.parse(r.created_at) +
          (r.leaving_eta_minutes ?? 0) * 60_000 -
          now) /
        60_000;
      return (
        s +
        (remaining <= 0 ? 7 : remaining <= 10 ? 4 : 1.5) *
          freshness(r, now) *
          reliability(r)
      );
    }, 0),
  );
  const demandPenalty = Math.min(
    40,
    search.reduce((s, r) => s + 2.5 * freshness(r, now), 0),
  );
  const score = active.length
    ? Math.round(
        clamp(
          45 + spaces + departures - demandPenalty - (congestion ?? 0) * 10,
        ),
      )
    : null;
  const trafficLabel =
    congestion === null
      ? "Unknown"
      : congestion >= 1.4
        ? "Heavy"
        : congestion >= 0.5
          ? "Moderate"
          : "Light";
  const demand =
    search.length >= 15
      ? "Very high"
      : search.length >= 8
        ? "High"
        : search.length >= 4
          ? "Moderate"
          : "Low";
  const availability =
    score === null
      ? "Unknown"
      : score >= 65
        ? "High"
        : score >= 40
          ? "Moderate"
          : "Low";
  const departureBuckets = [0, 10, 30].map(
    (eta) =>
      leaving.filter((r) => {
        const remaining =
          (Date.parse(r.created_at) +
            (r.leaving_eta_minutes ?? 0) * 60_000 -
            now) /
          60_000;
        return eta === 0
          ? remaining <= 0
          : eta === 10
            ? remaining > 0 && remaining <= 10
            : remaining > 10;
      }).length,
  );
  const reasons = [
    open.length
      ? `${open.length} recent open-space ${open.length === 1 ? "report" : "reports"}`
      : "",
    leaving.length ? `${leaving.length} upcoming departures` : "",
    search.length < 8 ? "relatively low active demand" : "high active demand",
    traffic.length
      ? `${trafficLabel.toLowerCase()} reported traffic`
      : "no recent traffic reports",
  ].filter(Boolean);
  return {
    ...location,
    score,
    availability,
    demand,
    searchers: search.length,
    leaving: leaving.length,
    departureBuckets,
    traffic: trafficLabel,
    trafficReports: traffic.length,
    openReports: open.length,
    activeReports: active.length,
    reason: active.length
      ? `Based on ${reasons.join(", ")}.`
      : "No recent reports. Check conditions before choosing this lot.",
  };
}
export function rankings(data: Snapshot, now = Date.now()) {
  return data.locations
    .filter((l) => l.active)
    .map((l) => opportunity(l, data, now))
    .sort(
      (a, b) =>
        (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name),
    );
}
export type LotSummary = ReturnType<typeof opportunity>;
export function relativeTime(timestamp: string, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 1000));
  return seconds < 60
    ? `${seconds} sec ago`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)} min ago`
      : `${Math.floor(seconds / 3600)} hr ago`;
}
