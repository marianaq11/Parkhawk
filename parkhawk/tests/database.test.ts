import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const temp = mkdtempSync(join(tmpdir(), "parkhawk-test-"));
process.env.SQLITE_PATH = join(temp, "test.sqlite");
const {
  db,
  seedLocal,
  localSnapshot,
  localLogin,
  localUser,
  localLogout,
  localSubmit,
  localFeedback,
  localAdmin,
} = await import("../lib/sqlite");
const { dashboard } = await import("../lib/view");
const { reportSchema } = await import("../lib/validation");
test("SQLite authentication, reporting, authorization, privacy and admin operations", () => {
  try {
    assert.equal(seedLocal(), true);
    assert.equal(seedLocal(), false);
    const data = localSnapshot(),
      user = data.profiles[0],
      other = data.profiles[1],
      third = data.profiles[2],
      admin = data.profiles.find((p) => p.role === "ADMIN")!,
      lot = data.locations[0];
    assert.throws(() => localLogin(user.email, "wrong-password"), /incorrect/);
    const { token } = localLogin(user.email, "ParkHawkDemo2026!");
    assert.equal(localUser(token)?.id, user.id);
    assert.equal(localUser("forged-token"), undefined);
    localLogout(token);
    assert.equal(localUser(token), undefined);
    for (const action of [
      { action: "suspend", user_id: other.id, hours: 24 },
      { action: "remove", report_id: data.reports[0].id },
      {
        action: "location",
        location: {
          name: "Unauthorized lot",
          description: "",
          location_type: "DECK",
          active: true,
        },
      },
    ] as const)
      assert.throws(() => localAdmin(user.id, action), /Administrator/);
    db().prepare("UPDATE reports SET status='CLOSED'").run();
    const id = localSubmit(user.id, {
      report_type: "OPEN_SPOT",
      parking_location_id: lot.id,
      quantity: 2,
      zone_or_floor: "Level 8",
      note: "Near stairs",
    });
    assert.throws(() => localFeedback(user.id, id, "STILL_OPEN"), /own report/);
    localFeedback(other.id, id, "STILL_OPEN");
    assert.equal(
      localSnapshot().profiles.find((p) => p.id === user.id)?.reliability_score,
      81,
    );
    assert.throws(
      () => localFeedback(other.id, id, "STILL_OPEN"),
      /already responded/,
    );
    localFeedback(third.id, id, "TAKEN");
    assert.equal(
      localSnapshot().reports.find((r) => r.id === id)?.status,
      "CLOSED",
    );
    assert.equal(
      localSnapshot().profiles.find((p) => p.id === user.id)?.reliability_score,
      81,
    );
    const next = localSubmit(user.id, {
      report_type: "OPEN_SPOT",
      parking_location_id: lot.id,
      quantity: 1,
      zone_or_floor: "",
      note: "",
    });
    localFeedback(third.id, next, "TAKEN");
    assert.equal(
      localSnapshot().profiles.find((p) => p.id === user.id)?.reliability_score,
      78,
    );
    localAdmin(admin.id, { action: "suspend", user_id: user.id, hours: 24 });
    assert.throws(
      () =>
        localSubmit(user.id, {
          report_type: "SEARCHING",
          parking_location_id: lot.id,
          note: "",
          zone_or_floor: "",
        }),
      /suspended/,
    );
    localAdmin(admin.id, { action: "suspend", user_id: user.id, hours: 0 });
    const search = localSubmit(user.id, {
      report_type: "SEARCHING",
      parking_location_id: lot.id,
      note: "",
      zone_or_floor: "",
    });
    assert.throws(
      () =>
        localSubmit(user.id, {
          report_type: "SEARCHING",
          parking_location_id: lot.id,
          note: "",
          zone_or_floor: "",
        }),
      /Wait 15/,
    );
    db()
      .prepare("UPDATE reports SET created_at=? WHERE id=?")
      .run(new Date(Date.now() - 20000).toISOString(), search);
    localSubmit(user.id, {
      report_type: "SEARCHING",
      parking_location_id: data.locations[1].id,
      note: "",
      zone_or_floor: "",
    });
    assert.equal(
      localSnapshot().reports.filter(
        (r) =>
          r.user_id === user.id &&
          r.report_type === "SEARCHING" &&
          r.status === "ACTIVE",
      ).length,
      1,
    );
    const view = dashboard(localSnapshot(), other);
    assert.equal(
      view.reports.some((r) => r.report_type === "SEARCHING"),
      false,
    );
    assert.equal(JSON.stringify(view.reports).includes(user.id), false);
    assert.equal(JSON.stringify(view).includes(user.email), false);
    localAdmin(admin.id, {
      action: "location",
      location: { ...lot, active: false },
    });
    assert.throws(
      () =>
        localSubmit(user.id, {
          report_type: "TRAFFIC",
          parking_location_id: lot.id,
          traffic_level: "HEAVY",
          note: "",
          zone_or_floor: "",
        }),
      /not available/,
    );
    localAdmin(admin.id, { action: "remove", report_id: next });
    assert.equal(
      localSnapshot().profiles.find((p) => p.id === user.id)?.reliability_score,
      73,
    );
    assert.throws(
      () => localAdmin(admin.id, { action: "remove", report_id: next }),
      /already removed/,
    );
    assert.equal(
      reportSchema.safeParse({
        report_type: "OPEN_SPOT",
        parking_location_id: lot.id,
        quantity: 100,
      }).success,
      false,
    );
    assert.equal(
      reportSchema.safeParse({
        report_type: "OPEN_SPOT",
        parking_location_id: lot.id,
        quantity: 1,
        note: "<script>alert(1)</script>",
      }).success,
      false,
    );
  } finally {
    db().close();
    rmSync(temp, { recursive: true, force: true });
  }
});
