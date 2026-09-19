import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confidence,
  isActive,
  lifetime,
  opportunity,
  rankings,
} from "../lib/parking";
import { requireAdmin } from "../lib/authorization";
import { seedData } from "../lib/seed-data";
import type { Report } from "../lib/types";
const now = Date.parse("2026-09-19T12:00:00Z");
const data = seedData();
data.reports = [];
const lot = data.locations[0],
  user = data.profiles[0];
const report = (extra: Partial<Report> = {}): Report => ({
  id: "r",
  user_id: user.id,
  parking_location_id: lot.id,
  report_type: "OPEN_SPOT",
  quantity: 1,
  zone_or_floor: null,
  leaving_eta_minutes: null,
  traffic_level: null,
  note: null,
  status: "ACTIVE",
  created_at: new Date(now).toISOString(),
  expires_at: new Date(now + 180000).toISOString(),
  ...extra,
});
const score = (reports: Report[]) =>
  opportunity(lot, { ...data, reports }, now).score!;
test("expiration is exclusive at the boundary; closed reports never count", () => {
  const r = report();
  assert.equal(isActive(r, now + 179999), true);
  assert.equal(isActive(r, now + 180000), false);
  assert.equal(isActive(report({ status: "CLOSED" }), now), false);
  assert.equal(isActive(r, now - 1), false);
});
test("all report lifetimes match the product rules", () => {
  assert.equal(lifetime("OPEN_SPOT"), 180000);
  assert.equal(lifetime("LEAVING_SOON"), 300000);
  assert.equal(lifetime("LEAVING_SOON", 10), 900000);
  assert.equal(lifetime("LEAVING_SOON", 30), 2100000);
  assert.equal(lifetime("SEARCHING"), 900000);
  assert.equal(lifetime("TRAFFIC"), 600000);
});
test("confidence decays, responds to reputation and independent confirmations, and closes on taken", () => {
  const r = report();
  assert.equal(confidence(r, 80, 0, 0, now), 68);
  assert.equal(confidence(r, 80, 0, 0, now + 90000), 34);
  assert.ok(confidence(r, 80, 3, 0, now) > confidence(r, 80, 0, 0, now));
  assert.equal(confidence(r, 80, 50, 0, now), 92);
  assert.equal(confidence(r, 80, 3, 1, now), 0);
  assert.ok(confidence(r, 100, 0, 0, now) > confidence(r, 10, 0, 0, now));
  assert.equal(confidence(r, 80, 0, 0, now + 180000), 0);
});
test("open spots and nearer departures improve opportunity", () => {
  assert.ok(score([report()]) > 45);
  const depart = (eta: number) =>
    report({
      report_type: "LEAVING_SOON",
      quantity: null,
      leaving_eta_minutes: eta,
      expires_at: new Date(now + lifetime("LEAVING_SOON", eta)).toISOString(),
    });
  assert.ok(score([depart(0)]) > score([depart(10)]));
  assert.ok(score([depart(10)]) > score([depart(30)]));
  assert.ok(score([depart(30)]) > 45);
});
test("demand and heavy traffic reduce opportunity; traffic aggregates multiple reports", () => {
  assert.ok(
    score([
      report(),
      report({ id: "search", report_type: "SEARCHING", quantity: null }),
    ]) < score([report()]),
  );
  const traffic = (level: Report["traffic_level"]) =>
    report({ report_type: "TRAFFIC", quantity: null, traffic_level: level });
  assert.ok(score([traffic("HEAVY")]) < score([traffic("MODERATE")]));
  assert.ok(score([traffic("MODERATE")]) < score([traffic("LIGHT")]));
  assert.equal(
    opportunity(
      lot,
      { ...data, reports: [traffic("HEAVY"), traffic("LIGHT")] },
      now,
    ).traffic,
    "Moderate",
  );
});
test("expired reports do not affect rankings and missing evidence is unknown", () => {
  const expired = report({ expires_at: new Date(now - 1).toISOString() });
  assert.equal(score([report(), expired]), score([report()]));
  assert.equal(
    opportunity(lot, { ...data, reports: [expired] }, now).score,
    null,
  );
  assert.equal(opportunity(lot, data, now).availability, "Unknown");
  assert.ok(
    rankings({ ...data, locations: [{ ...lot, active: false }] }).length === 0,
  );
});
test("normal users cannot pass the admin role guard", () => {
  assert.throws(() => requireAdmin(user), /Administrator/);
  assert.doesNotThrow(() => requireAdmin({ ...user, role: "ADMIN" }));
});
