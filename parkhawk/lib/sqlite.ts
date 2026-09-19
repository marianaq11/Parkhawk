import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { Profile, Report, Snapshot } from "./types";
import { seedData } from "./seed-data";
import { AppError, requireAdmin, requireReporting } from "./authorization";
import { isActive, lifetime, clamp } from "./parking";
import type { AdminInput, ReportInput } from "./validation";
let database: DatabaseSync | undefined;
export function db() {
  if (database) return database;
  const path = process.env.SQLITE_PATH || ".data/parkhawk.sqlite";
  mkdirSync(dirname(path), { recursive: true });
  database = new DatabaseSync(path);
  database.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('USER','ADMIN')),reliability_score REAL NOT NULL CHECK(reliability_score BETWEEN 0 AND 100),reporting_suspended_until TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS credentials(user_id TEXT PRIMARY KEY REFERENCES profiles(id),salt TEXT NOT NULL,hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES profiles(id),expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS login_attempts(email TEXT PRIMARY KEY,count INTEGER NOT NULL,started_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS parking_locations(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,description TEXT NOT NULL,location_type TEXT NOT NULL CHECK(location_type IN ('GARAGE','SURFACE_LOT','DECK')),active INTEGER NOT NULL CHECK(active IN (0,1)),created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES profiles(id),parking_location_id TEXT NOT NULL REFERENCES parking_locations(id),report_type TEXT NOT NULL CHECK(report_type IN ('OPEN_SPOT','LEAVING_SOON','SEARCHING','TRAFFIC')),zone_or_floor TEXT,quantity INTEGER CHECK(quantity BETWEEN 1 AND 3),leaving_eta_minutes INTEGER CHECK(leaving_eta_minutes IN (0,10,30)),traffic_level TEXT CHECK(traffic_level IN ('LIGHT','MODERATE','HEAVY')),note TEXT CHECK(length(note)<=180),status TEXT NOT NULL CHECK(status IN ('ACTIVE','CLOSED','REMOVED')),created_at TEXT NOT NULL,expires_at TEXT NOT NULL CHECK(expires_at>created_at),CHECK((report_type='OPEN_SPOT' AND quantity IS NOT NULL) OR (report_type='LEAVING_SOON' AND leaving_eta_minutes IS NOT NULL) OR (report_type='TRAFFIC' AND traffic_level IS NOT NULL) OR report_type='SEARCHING'));
    CREATE TABLE IF NOT EXISTS report_feedback(id TEXT PRIMARY KEY,report_id TEXT NOT NULL REFERENCES reports(id),user_id TEXT NOT NULL REFERENCES profiles(id),feedback_type TEXT NOT NULL CHECK(feedback_type IN ('STILL_OPEN','TAKEN')),created_at TEXT NOT NULL,UNIQUE(report_id,user_id));
    CREATE INDEX IF NOT EXISTS reports_active ON reports(parking_location_id,status,expires_at);
    CREATE INDEX IF NOT EXISTS reports_user_type ON reports(user_id,report_type,created_at);
    CREATE INDEX IF NOT EXISTS reports_created ON reports(created_at);
  `);
  return database;
}
export function transaction<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}
function insert(table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  db()
    .prepare(
      `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    )
    .run(
      ...Object.values(row).map((v) =>
        typeof v === "boolean" ? Number(v) : (v as string | number | null),
      ),
    );
}
export function seedLocal() {
  if (
    (db().prepare("SELECT count(*) AS n FROM profiles").get() as { n: number })
      .n
  )
    return false;
  transaction(() => {
    const data = seedData();
    for (const profile of data.profiles) {
      insert("profiles", profile);
      const salt = randomBytes(16).toString("hex");
      insert("credentials", {
        user_id: profile.id,
        salt,
        hash: scryptSync("ParkHawkDemo2026!", salt, 64).toString("hex"),
      });
    }
    data.locations.forEach((l) => insert("parking_locations", l));
    data.reports.forEach((r) => insert("reports", r));
  });
  return true;
}
export function localSnapshot(): Snapshot {
  return {
    profiles: db()
      .prepare("SELECT * FROM profiles")
      .all()
      .map((row) => ({ ...row })) as unknown as Snapshot["profiles"],
    locations: db()
      .prepare("SELECT * FROM parking_locations")
      .all()
      .map((r) => ({
        ...r,
        active: Boolean(r.active),
      })) as unknown as Snapshot["locations"],
    reports: db()
      .prepare("SELECT * FROM reports ORDER BY created_at DESC")
      .all()
      .map((row) => ({ ...row })) as unknown as Snapshot["reports"],
    feedback: db()
      .prepare("SELECT * FROM report_feedback")
      .all()
      .map((row) => ({ ...row })) as unknown as Snapshot["feedback"],
  };
}
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function localLogin(email: string, password: string) {
  const attempt = db()
    .prepare("SELECT * FROM login_attempts WHERE email=?")
    .get(email) as { count: number; started_at: number } | undefined;
  if (
    attempt &&
    Date.now() - attempt.started_at < 900_000 &&
    attempt.count >= 8
  )
    throw new AppError("Too many attempts. Try again in 15 minutes.", 429);
  const record = db()
    .prepare(
      "SELECT c.*,p.id FROM credentials c JOIN profiles p ON p.id=c.user_id WHERE p.email=?",
    )
    .get(email) as { salt: string; hash: string; id: string } | undefined;
  const calculated = scryptSync(
    password,
    record?.salt ?? "missing-user-fixed-salt",
    64,
  );
  if (
    !record ||
    !timingSafeEqual(calculated, Buffer.from(record.hash, "hex"))
  ) {
    db()
      .prepare(
        "INSERT INTO login_attempts VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET count=excluded.count,started_at=excluded.started_at",
      )
      .run(
        email,
        attempt && Date.now() - attempt.started_at < 900_000
          ? attempt.count + 1
          : 1,
        attempt && Date.now() - attempt.started_at < 900_000
          ? attempt.started_at
          : Date.now(),
      );
    throw new AppError("Email or password is incorrect.", 401);
  }
  db().prepare("DELETE FROM login_attempts WHERE email=?").run(email);
  const token = randomBytes(32).toString("hex");
  insert("sessions", {
    token_hash: tokenHash(token),
    user_id: record.id,
    expires_at: new Date(Date.now() + 8 * 3600_000).toISOString(),
  });
  return { token, expiresIn: 8 * 3600 };
}
export function localUser(token: string): Profile | undefined {
  const row = db()
    .prepare(
      "SELECT p.* FROM profiles p JOIN sessions s ON p.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
    )
    .get(tokenHash(token), new Date().toISOString());
  // node:sqlite rows have null prototypes; React server props need plain objects.
  return row ? ({ ...row } as Profile) : undefined;
}
export function localLogout(token: string) {
  db().prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash(token));
}
export function localSubmit(userId: string, input: ReportInput) {
  return transaction(() => {
    const data = localSnapshot(),
      now = Date.now();
    const user = data.profiles.find((p) => p.id === userId)!;
    requireReporting(user, now);
    if (
      !data.locations.some(
        (l) => l.id === input.parking_location_id && l.active,
      )
    )
      throw new AppError("This parking location is not available.");
    const previous = data.reports.filter(
      (r) =>
        r.user_id === userId &&
        r.report_type === input.report_type &&
        isActive(r, now),
    );
    if (previous.some((r) => now - Date.parse(r.created_at) < 15_000))
      throw new AppError(
        "Wait 15 seconds before updating this type of report.",
        429,
      );
    // One active report of each type per user. A renewed search moves, never duplicates, demand.
    db()
      .prepare(
        "UPDATE reports SET status='CLOSED' WHERE user_id=? AND report_type=? AND status='ACTIVE'",
      )
      .run(userId, input.report_type);
    const eta =
      "leaving_eta_minutes" in input ? input.leaving_eta_minutes : null;
    const report: Report = {
      id: randomUUID(),
      user_id: userId,
      parking_location_id: input.parking_location_id,
      report_type: input.report_type,
      zone_or_floor: input.zone_or_floor || null,
      quantity: "quantity" in input ? input.quantity : null,
      leaving_eta_minutes: eta,
      traffic_level: "traffic_level" in input ? input.traffic_level : null,
      note: input.note,
      status: "ACTIVE",
      created_at: new Date(now).toISOString(),
      expires_at: new Date(
        now + lifetime(input.report_type, eta ?? 0),
      ).toISOString(),
    };
    insert("reports", report);
    return report.id;
  });
}
export function localFeedback(
  userId: string,
  reportId: string,
  type: "STILL_OPEN" | "TAKEN",
) {
  transaction(() => {
    const data = localSnapshot();
    requireReporting(data.profiles.find((p) => p.id === userId)!);
    const report = data.reports.find((r) => r.id === reportId);
    if (
      !report ||
      report.report_type !== "OPEN_SPOT" ||
      !isActive(report) ||
      !data.locations.some(
        (l) => l.id === report.parking_location_id && l.active,
      )
    )
      throw new AppError("This open-space report is no longer active.");
    if (report.user_id === userId)
      throw new AppError("You cannot confirm your own report.");
    if (
      data.feedback.some(
        (f) => f.report_id === reportId && f.user_id === userId,
      )
    )
      throw new AppError("You already responded to this report.", 409);
    insert("report_feedback", {
      id: randomUUID(),
      report_id: reportId,
      user_id: userId,
      feedback_type: type,
      created_at: new Date().toISOString(),
    });
    if (type === "TAKEN")
      db()
        .prepare("UPDATE reports SET status='CLOSED' WHERE id=?")
        .run(reportId);
    // A taken space is often normal turnover. Penalize only a second early taken
    // report within 24 hours, never every legitimate spot that gets used.
    const recentEarly = data.feedback
      .filter(
        (f) =>
          f.feedback_type === "TAKEN" &&
          Date.parse(f.created_at) > Date.now() - 86400_000,
      )
      .filter((f) => {
        const r = data.reports.find((r) => r.id === f.report_id);
        return (
          r?.user_id === report.user_id &&
          Date.parse(f.created_at) - Date.parse(r.created_at) < 45_000
        );
      }).length;
    const delta =
      type === "STILL_OPEN"
        ? 1
        : Date.now() - Date.parse(report.created_at) < 45_000 &&
            recentEarly >= 1
          ? -3
          : 0;
    db()
      .prepare("UPDATE profiles SET reliability_score=? WHERE id=?")
      .run(
        clamp(
          data.profiles.find((p) => p.id === report.user_id)!
            .reliability_score + delta,
        ),
        report.user_id,
      );
  });
}
export function localAdmin(userId: string, input: AdminInput) {
  transaction(() => {
    const data = localSnapshot();
    requireAdmin(data.profiles.find((p) => p.id === userId)!);
    if (input.action === "location") {
      const l = input.location;
      if (
        data.locations.some(
          (x) => x.name.toLowerCase() === l.name.toLowerCase() && x.id !== l.id,
        )
      )
        throw new AppError("A location with that name already exists.");
      if (l.id) {
        if (!data.locations.some((x) => x.id === l.id))
          throw new AppError("Location not found.", 404);
        db()
          .prepare(
            "UPDATE parking_locations SET name=?,description=?,location_type=?,active=? WHERE id=?",
          )
          .run(l.name, l.description, l.location_type, Number(l.active), l.id);
      } else
        insert("parking_locations", {
          ...l,
          id: randomUUID(),
          created_at: new Date().toISOString(),
        });
    } else if (input.action === "suspend") {
      if (!data.profiles.some((p) => p.id === input.user_id))
        throw new AppError("User not found.", 404);
      db()
        .prepare("UPDATE profiles SET reporting_suspended_until=? WHERE id=?")
        .run(
          input.hours
            ? new Date(Date.now() + input.hours * 3600_000).toISOString()
            : null,
          input.user_id,
        );
    } else {
      const r = data.reports.find((r) => r.id === input.report_id);
      if (!r || r.status === "REMOVED")
        throw new AppError("Report not found or already removed.", 404);
      db().prepare("UPDATE reports SET status='REMOVED' WHERE id=?").run(r.id);
      db()
        .prepare(
          "UPDATE profiles SET reliability_score=max(0,reliability_score-5) WHERE id=?",
        )
        .run(r.user_id);
    }
  });
}
