"use client";
import { useState } from "react";
import type { Profile, Snapshot, Location } from "@/lib/types";
import { isActive, relativeTime } from "@/lib/parking";
import { Shell } from "./shell";
import { post } from "./api";
export function Admin({
  initial,
  user,
  initialNow,
}: {
  initial: Snapshot;
  user: Profile;
  initialNow: number;
}) {
  const [now, setNow] = useState(initialNow);
  const [data, setData] = useState(initial),
    [tab, setTab] = useState("Reports"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Location | null>(null);
  async function change(input: unknown) {
    setBusy(true);
    setError("");
    try {
      await post("admin", input);
      const r = await fetch("/api/admin");
      if (!r.ok) throw new Error("Could not refresh admin data.");
      setData(await r.json());
      setNow(
        Date.parse(r.headers.get("Date") || new Date(initialNow).toISOString()),
      );
      setNotice("Changes saved.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const today = new Date(now).toISOString().slice(0, 10);
  return (
    <Shell user={user}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRATION</span>
          <h1>Keep the community on track.</h1>
          <p>Manage demo parking areas, reports, and reporting privileges.</p>
        </div>
        <span className="badge neutral">Admin access</span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="admin-stats">
        {[
          ["Total users", data.profiles.length],
          [
            "Active reports",
            data.reports.filter(
              (r) =>
                isActive(r, now) &&
                data.locations.some(
                  (l) => l.id === r.parking_location_id && l.active,
                ),
            ).length,
          ],
          ["Parking locations", data.locations.length],
          [
            "Reports today (UTC)",
            data.reports.filter((r) => r.created_at.startsWith(today)).length,
          ],
        ].map(([label, value]) => (
          <div className="panel" key={label}>
            <span className="muted">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="tabs" role="tablist" aria-label="Admin sections">
        {["Reports", "Users", "Parking locations"].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Reports" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Report / location</th>
                <th>Reporter</th>
                <th>When</th>
                <th>Status</th>
                <th>Moderation</th>
              </tr>
            </thead>
            <tbody>
              {data.reports
                .slice()
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .slice(0, 100)
                .map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>
                        {r.report_type.replaceAll("_", " ").toLowerCase()}
                      </strong>
                      <br />
                      {
                        data.locations.find(
                          (l) => l.id === r.parking_location_id,
                        )?.name
                      }
                      {r.note && <p className="helper">{r.note}</p>}
                    </td>
                    <td>
                      {
                        data.profiles.find((p) => p.id === r.user_id)
                          ?.display_name
                      }
                    </td>
                    <td>{relativeTime(r.created_at, now)}</td>
                    <td>
                      <span className="badge neutral">
                        {isActive(r, now)
                          ? "Active"
                          : r.status === "ACTIVE"
                            ? "Expired"
                            : r.status.toLowerCase()}
                      </span>
                    </td>
                    <td>
                      <button
                        className="button small danger"
                        disabled={busy || r.status === "REMOVED"}
                        onClick={() => {
                          if (
                            confirm(
                              "Remove this report for abuse or inaccuracy? This reduces the reporter’s reliability by 5.",
                            )
                          )
                            change({ action: "remove", report_id: r.id });
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "Users" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Reliability</th>
                <th>Reporting status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.profiles.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.display_name}</strong>
                    <br />
                    <span className="muted">{p.email}</span>
                  </td>
                  <td>{p.role}</td>
                  <td>{p.reliability_score}/100</td>
                  <td>
                    {p.reporting_suspended_until &&
                    Date.parse(p.reporting_suspended_until) > now
                      ? `Suspended until ${new Date(p.reporting_suspended_until).toISOString()}`
                      : "Enabled"}
                  </td>
                  <td>
                    <button
                      className="button small secondary"
                      disabled={busy}
                      onClick={() =>
                        change({
                          action: "suspend",
                          user_id: p.id,
                          hours:
                            p.reporting_suspended_until &&
                            Date.parse(p.reporting_suspended_until) > now
                              ? 0
                              : 24,
                        })
                      }
                    >
                      {p.reporting_suspended_until &&
                      Date.parse(p.reporting_suspended_until) > now
                        ? "Restore"
                        : "Suspend 24h"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "Parking locations" && (
        <div className="admin-locations">
          <form
            className="panel"
            key={editing?.id ?? "new"}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form);
              if (
                await change({
                  action: "location",
                  location: {
                    ...(editing ? { id: editing.id } : {}),
                    name: f.get("name"),
                    description: f.get("description"),
                    location_type: f.get("location_type"),
                    active: f.get("active") === "on",
                  },
                })
              ) {
                setEditing(null);
                form.reset();
              }
            }}
          >
            <h2>
              {editing ? "Edit parking location" : "Add parking location"}
            </h2>
            <label>
              Name
              <input
                name="name"
                defaultValue={editing?.name}
                minLength={2}
                maxLength={60}
                required
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                defaultValue={editing?.description}
                maxLength={240}
              />
            </label>
            <label>
              Location type
              <select
                name="location_type"
                defaultValue={editing?.location_type ?? "SURFACE_LOT"}
              >
                <option value="SURFACE_LOT">Surface lot</option>
                <option value="GARAGE">Garage</option>
                <option value="DECK">Deck</option>
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                name="active"
                defaultChecked={editing?.active ?? true}
              />
              Active and visible to users
            </label>
            <div className="form-row">
              <button className="button primary" disabled={busy}>
                Save location
              </button>
              {editing && (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
          <div>
            {data.locations.map((l) => (
              <div className="location-row panel" key={l.id}>
                <div>
                  <h3>{l.name}</h3>
                  <p className="muted">
                    {l.active ? "Active" : "Disabled"} ·{" "}
                    {l.location_type.toLowerCase().replaceAll("_", " ")}
                  </p>
                </div>
                <button
                  className="button secondary small"
                  onClick={() => setEditing(l)}
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}
