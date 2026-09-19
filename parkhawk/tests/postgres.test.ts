import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
test("Postgres migration, RPC authorization, atomic feedback, expiration and RLS grants", async () => {
  const pg = new PGlite();
  try {
    // Supabase owns auth.users and these roles; mock only that platform boundary.
    await pg.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');`,
    );
    await pg.exec(readFileSync("supabase/migrations/001_parkhawk.sql", "utf8"));
    const student = randomUUID(),
      other = randomUUID(),
      third = randomUUID(),
      admin = randomUUID(),
      lot = randomUUID();
    for (const [id, email] of [
      [student, "student1@parkhawk.demo"],
      [other, "student2@parkhawk.demo"],
      [third, "student3@parkhawk.demo"],
      [admin, "admin@parkhawk.demo"],
    ])
      await pg.query("insert into auth.users(id,email) values($1,$2)", [
        id,
        email,
      ]);
    await pg.query("update profiles set role='ADMIN' where id=$1", [admin]);
    await pg.query(
      "insert into parking_locations(id,name,location_type) values($1,'Test lot','SURFACE_LOT')",
      [lot],
    );
    const input = {
      parking_location_id: lot,
      report_type: "OPEN_SPOT",
      quantity: 2,
      note: "",
      zone_or_floor: "",
    };
    await assert.rejects(
      pg.query("select admin_action($1,$2)", [
        student,
        { action: "suspend", user_id: other, hours: 24 },
      ]),
      /Administrator/,
    );
    const result = await pg.query<{ id: string }>(
      "select submit_report($1,$2) as id",
      [student, input],
    );
    const id = result.rows[0].id;
    await assert.rejects(
      pg.query("select respond_report($1,$2,$3)", [student, id, "STILL_OPEN"]),
      /own report/,
    );
    await pg.query("select respond_report($1,$2,$3)", [
      other,
      id,
      "STILL_OPEN",
    ]);
    await assert.rejects(
      pg.query("select respond_report($1,$2,$3)", [other, id, "STILL_OPEN"]),
      /already responded/,
    );
    const reputation = await pg.query<{ reliability_score: number }>(
      "select reliability_score from profiles where id=$1",
      [student],
    );
    assert.equal(reputation.rows[0].reliability_score, 81);
    await pg.query("select respond_report($1,$2,$3)", [third, id, "TAKEN"]);
    assert.equal(
      (
        await pg.query<{ status: string }>(
          "select status from reports where id=$1",
          [id],
        )
      ).rows[0].status,
      "CLOSED",
    );
    await pg.query("select admin_action($1,$2)", [
      admin,
      { action: "suspend", user_id: student, hours: 24 },
    ]);
    await assert.rejects(
      pg.query("select submit_report($1,$2)", [student, input]),
      /suspended/,
    );
    await pg.query("select admin_action($1,$2)", [
      admin,
      { action: "suspend", user_id: student, hours: 0 },
    ]);
    const next = (
      await pg.query<{ id: string }>("select submit_report($1,$2) as id", [
        student,
        input,
      ])
    ).rows[0].id;
    await pg.query(
      "update reports set created_at=now()-interval '4 minutes',expires_at=now()-interval '1 minute' where id=$1",
      [next],
    );
    await assert.rejects(
      pg.query("select respond_report($1,$2,$3)", [other, next, "STILL_OPEN"]),
      /no longer active/,
    );
    await pg.exec("set role authenticated");
    await assert.rejects(
      pg.query("select * from reports"),
      /permission denied/,
    );
    await assert.rejects(
      pg.query("select * from profiles"),
      /permission denied/,
    );
    await assert.rejects(
      pg.query("select admin_action($1,$2)", [
        admin,
        { action: "suspend", user_id: student, hours: 24 },
      ]),
      /permission denied/,
    );
    await assert.rejects(
      pg.query("select submit_report($1,$2)", [student, input]),
      /permission denied/,
    );
    await pg.exec("reset role");
  } finally {
    await pg.close();
  }
});
