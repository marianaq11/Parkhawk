import { randomUUID } from "node:crypto";
import type { Snapshot, Report, Profile } from "./types";
import { lifetime } from "./parking";
export function seedData(profiles?: Profile[]): Snapshot {
  const now = Date.now(),
    created_at = new Date(now).toISOString();
  const users: Profile[] =
    profiles ??
    Array.from({ length: 61 }, (_, i) => ({
      id: randomUUID(),
      email: i === 60 ? "admin@parkhawk.demo" : `student${i + 1}@parkhawk.demo`,
      display_name: i === 60 ? "Demo administrator" : `Student ${i + 1}`,
      role: i === 60 ? "ADMIN" : "USER",
      reliability_score: 80,
      reporting_suspended_until: null,
      created_at,
    }));
  const locations: Snapshot["locations"] = [
    "CarParc Diem",
    "Lot 45",
    "Lot 60",
    "Lot 61",
    "Lot 62",
    "NJ Transit Deck",
  ].map((name, i) => ({
    id: randomUUID(),
    name,
    description:
      i === 0
        ? "Core-campus garage. Include a level to help others find your report."
        : i === 5
          ? "Transit-area deck. Check current permit rules before parking."
          : "An alternative to core-campus parking. Check posted permit restrictions.",
    location_type: i === 0 ? "GARAGE" : i === 5 ? "DECK" : "SURFACE_LOT",
    active: true,
    created_at,
  }));
  const reports: Report[] = [];
  const counters: Record<string, number> = {};
  const add = (
    lot: number,
    type: Report["report_type"],
    count: number,
    extra: Partial<Report> = {},
  ) => {
    for (let i = 0; i < count; i++) {
      const timestamp = now - (15 + i * 3) * 1000;
      reports.push({
        id: randomUUID(),
        user_id: users[(counters[type] = (counters[type] ?? -1) + 1) % 60].id,
        parking_location_id: locations[lot].id,
        report_type: type,
        zone_or_floor: null,
        quantity: null,
        leaving_eta_minutes: null,
        traffic_level: null,
        note: "",
        status: "ACTIVE",
        ...extra,
        created_at: new Date(timestamp).toISOString(),
        expires_at: new Date(
          timestamp + lifetime(type, extra.leaving_eta_minutes ?? 0),
        ).toISOString(),
      });
    }
  };
  add(0, "SEARCHING", 18);
  add(0, "LEAVING_SOON", 4, { leaving_eta_minutes: 10 });
  add(0, "TRAFFIC", 6, { traffic_level: "HEAVY" });
  add(0, "OPEN_SPOT", 1, {
    quantity: 1,
    zone_or_floor: "Level 8",
    note: "Near the elevator, please check before heading up.",
  });
  add(2, "SEARCHING", 5);
  add(2, "LEAVING_SOON", 3, { leaving_eta_minutes: 0 });
  add(2, "LEAVING_SOON", 4, { leaving_eta_minutes: 10 });
  add(2, "LEAVING_SOON", 2, { leaving_eta_minutes: 30 });
  add(2, "OPEN_SPOT", 2, {
    quantity: 2,
    note: "A couple of spaces just opened.",
  });
  add(2, "TRAFFIC", 3, { traffic_level: "LIGHT" });
  for (const lot of [1, 3, 4, 5]) {
    add(lot, "SEARCHING", lot === 1 ? 3 : 7);
    add(lot, "LEAVING_SOON", 4, { leaving_eta_minutes: 10 });
    add(lot, "TRAFFIC", 2, { traffic_level: lot === 1 ? "LIGHT" : "MODERATE" });
    add(lot, "OPEN_SPOT", 1, { quantity: 1 });
  }
  return { profiles: users, locations, reports, feedback: [] };
}
