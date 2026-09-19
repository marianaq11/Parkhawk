"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  Plus,
  Clock3,
  Users,
  ArrowRight,
  RefreshCw,
  CarFront,
  Check,
  TrafficCone,
} from "lucide-react";
import { Shell } from "./shell";
import { ReportDialog } from "./report-dialog";
import { post } from "./api";
import type { DashboardData } from "@/lib/view";
import { confidenceLabel, relativeTime, type LotSummary } from "@/lib/parking";
export function Dashboard({
  initial,
  lotId,
}: {
  initial: DashboardData;
  lotId?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial),
    [dialog, setDialog] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard", { cache: "no-store" });
      if (r.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }
      if (!r.ok) throw new Error("Conditions could not refresh. Try again.");
      setData(await r.json());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [router]);
  useEffect(() => {
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);
  const lot = data.lots.find((l) => l.id === lotId),
    best = data.lots.find((l) => l.score !== null),
    now = Date.parse(data.updatedAt);
  async function respond(id: string, type: string) {
    setBusy(true);
    try {
      await post("feedback", { report_id: id, feedback_type: type });
      setNotice(
        type === "TAKEN"
          ? "Spot marked taken. The report is now closed."
          : "Thanks. Your confirmation was recorded.",
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const open = data.reports.filter(
    (r) =>
      r.parking_location_id === lotId &&
      r.report_type === "OPEN_SPOT" &&
      r.active,
  );
  return (
    <Shell user={data.user}>
      <div className="page-heading">
        <div>
          {lotId && (
            <Link href="/" className="back">
              <ArrowLeft size={16} />
              All parking areas
            </Link>
          )}
          <span className="eyebrow">
            {lotId ? "PARKING AREA" : "A BETTER START TO YOUR CAMPUS DAY"}
          </span>
          <h1>
            {lotId
              ? lot?.name || "Parking area unavailable"
              : "Where should I park right now?"}
          </h1>
          <p>
            {lotId
              ? lot?.description
              : "A little local knowledge. A lot less circling."}
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => setDialog(true)}
          disabled={!data.lots.length}
        >
          <Plus size={19} />
          Report parking info
        </button>
      </div>
      {notice && (
        <div className="notice" role="status">
          <Check size={18} />
          {notice}
          <button className="text-button" onClick={() => setNotice("")}>
            Dismiss
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {data.user.reporting_suspended_until &&
        Date.parse(data.user.reporting_suspended_until) > now && (
          <p className="error">
            Reporting is suspended until{" "}
            {new Date(data.user.reporting_suspended_until).toLocaleString()}.
            You can still browse parking conditions.
          </p>
        )}
      {lotId ? (
        lot ? (
          <>
            <Recommendation lot={lot} detail />
            <section className="detail-columns">
              <div>
                <div className="section-heading">
                  <h2>Recently spotted spaces</h2>
                  <span className="badge neutral">{open.length} active</span>
                </div>
                {open.length ? (
                  open.map((r) => (
                    <article className="spot-card" key={r.id}>
                      <div className="card-heading">
                        <span className="lot-icon">
                          <CarFront size={21} />
                        </span>
                        <span
                          className={`badge ${confidenceLabel(r.confidence).toLowerCase()}`}
                        >
                          {confidenceLabel(r.confidence)} confidence
                        </span>
                      </div>
                      <h3>
                        {r.quantity === 3 ? "3+" : r.quantity} possible{" "}
                        {r.quantity === 1 ? "space" : "spaces"}
                        {r.zone_or_floor ? ` · ${r.zone_or_floor}` : ""}
                      </h3>
                      <p>{r.note || "No additional details."}</p>
                      <div className="metadata">
                        {relativeTime(r.created_at, now)} · Confirmed by{" "}
                        {r.confirmations}{" "}
                        {r.confirmations === 1 ? "user" : "users"}
                      </div>
                      <div className="spot-actions">
                        <button
                          className="button secondary"
                          disabled={r.own || r.responded || busy}
                          onClick={() => respond(r.id, "STILL_OPEN")}
                        >
                          <Check size={16} />
                          Still open
                        </button>
                        <button
                          className="button secondary"
                          disabled={r.own || r.responded || busy}
                          onClick={() => respond(r.id, "TAKEN")}
                        >
                          Spot taken
                        </button>
                        <small>
                          {r.own
                            ? "Your report"
                            : r.responded
                              ? "Response recorded"
                              : ""}
                        </small>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty">
                    <CarFront size={30} />
                    <h3>No fresh open-space reports</h3>
                    <p>
                      Spotted a space? Share it with the next driver. Reports
                      expire after 3 minutes.
                    </p>
                  </div>
                )}
              </div>
              <aside className="panel departures">
                <span className="eyebrow">WHAT’S COMING UP</span>
                <h2>{lot.leaving} leaving soon</h2>
                {["Leaving now", "Within 10 minutes", "Within 30 minutes"].map(
                  (label, i) => (
                    <div className="departure-row" key={label}>
                      <Clock3 size={18} />
                      <span>{label}</span>
                      <strong>{lot.departureBuckets[i]}</strong>
                    </div>
                  ),
                )}
                <p className="helper">
                  Departure reports are intentions, not reserved spaces.
                  Conditions can change before you arrive.
                </p>
              </aside>
            </section>
          </>
        ) : (
          <div className="empty">
            This location is disabled or unavailable.{" "}
            <Link href="/">View active parking areas</Link>
          </div>
        )
      ) : (
        <>
          {best ? (
            <Recommendation lot={best} />
          ) : (
            <div className="empty">
              <h2>No recent evidence yet</h2>
              <p>
                Be the first to share parking conditions. Scores will appear as
                reports arrive.
              </p>
            </div>
          )}
          <div className="summary-strip">
            <div>
              <span className="summary-icon">
                <CarFront size={21} />
              </span>
              <span>
                <strong>{data.lots.length}</strong> parking areas
              </span>
            </div>
            <div>
              <span className="summary-icon">
                <Clock3 size={21} />
              </span>
              <span>
                <strong>{data.lots.reduce((s, l) => s + l.leaving, 0)}</strong>{" "}
                leaving soon
              </span>
            </div>
            <div>
              <span className="summary-icon">
                <Users size={21} />
              </span>
              <span>
                <strong>
                  {data.lots.reduce((s, l) => s + l.searchers, 0)}
                </strong>{" "}
                currently searching
              </span>
            </div>
            <div className="refresh-status">
              <button
                className="icon-button"
                aria-label="Refresh parking conditions"
                onClick={refresh}
              >
                <RefreshCw size={16} />
              </button>
              Refreshes every 10 sec
            </div>
          </div>
          <div className="section-heading">
            <div>
              <span className="eyebrow">COMPARE YOUR OPTIONS</span>
              <h2>All parking areas</h2>
            </div>
            <span className="muted">Highest opportunity first</span>
          </div>
          <div className="lot-grid">
            {data.lots.map((l, i) => (
              <LotCard
                lot={l}
                key={l.id}
                recommended={i === 0 && l.score !== null}
              />
            ))}
          </div>
        </>
      )}
      <section className="activity">
        <div className="section-heading">
          <h2>Recent community activity</h2>
          <span className="muted">Anonymous reports</span>
        </div>
        {data.reports
          .filter((r) => !lotId || r.parking_location_id === lotId)
          .slice(0, 5)
          .map((r) => (
            <div className="activity-row" key={r.id}>
              <span className="activity-icon">
                {r.report_type === "LEAVING_SOON" ? (
                  <Clock3 size={18} />
                ) : r.report_type === "TRAFFIC" ? (
                  <TrafficCone size={18} />
                ) : (
                  <CarFront size={18} />
                )}
              </span>
              <div>
                <strong>
                  {data.lots.find((l) => l.id === r.parking_location_id)?.name}
                </strong>
                <p>
                  {r.report_type === "OPEN_SPOT"
                    ? "Open spaces reported"
                    : r.report_type === "LEAVING_SOON"
                      ? `Leaving ${r.leaving_eta_minutes === 0 ? "now" : `in ${r.leaving_eta_minutes} minutes`}`
                      : `${r.traffic_level?.toLowerCase()} traffic reported`}
                  {!r.active ? " · No longer active" : ""}
                </p>
              </div>
              <time>{relativeTime(r.created_at, now)}</time>
            </div>
          ))}
        {!data.reports.length && (
          <p className="helper">New community reports will appear here.</p>
        )}
      </section>
      <div className="explanation">
        <strong>Useful signals, not a guarantee.</strong> Opportunity scores
        combine recent reports, departures, demand, and traffic. They are not
        vacancy counts or probabilities. Always check parking eligibility and
        signs.
      </div>
      {dialog && (
        <ReportDialog
          lots={data.lots}
          initialLot={lotId}
          onClose={() => setDialog(false)}
          onSaved={() => {
            setNotice("Report shared. Thanks for helping your campus.");
            refresh();
          }}
        />
      )}
    </Shell>
  );
}
function Recommendation({
  lot,
  detail = false,
}: {
  lot: LotSummary;
  detail?: boolean;
}) {
  return (
    <section className="recommendation">
      <div className="recommendation-main">
        <span className="recommendation-label">
          <span className="signal-dot" />
          {detail ? "CURRENT PARKING OUTLOOK" : "YOUR BEST OPTION RIGHT NOW"}
        </span>
        <h2>
          {lot.name}
          <span className={`badge ${lot.availability.toLowerCase()}`}>
            {lot.availability === "Unknown"
              ? "Availability unknown"
              : `${lot.availability} estimated availability`}
          </span>
        </h2>
        <p>{lot.reason}</p>
        <div className="recommendation-stats">
          <span>
            <Users size={18} />
            {lot.searchers} searching · {lot.demand.toLowerCase()} demand
          </span>
          <span>
            <Clock3 size={18} />
            {lot.leaving} leaving soon
          </span>
          <span>
            <TrafficCone size={18} />
            {lot.traffic} traffic
            {detail ? ` · ${lot.trafficReports} reports` : ""}
          </span>
        </div>
        {!detail && (
          <Link className="recommendation-link" href={`/lots/${lot.id}`}>
            Explore {lot.name}
            <ArrowRight size={17} />
          </Link>
        )}
      </div>
      <div className="score-block">
        <span className="score-label">PARKING OPPORTUNITY</span>
        <div className="big-score">
          {lot.score ?? "—"}
          <span>/100</span>
        </div>
        <div className="score-track">
          <div style={{ width: `${lot.score ?? 0}%` }} />
        </div>
        <span className="score-caption">A signal, not a guarantee</span>
      </div>
    </section>
  );
}
function LotCard({
  lot,
  recommended,
}: {
  lot: LotSummary;
  recommended: boolean;
}) {
  return (
    <article className={`lot-card ${recommended ? "best" : ""}`}>
      <div className="card-heading">
        <span className="lot-icon">
          <CarFront size={22} />
        </span>
        <span className={`badge ${lot.availability.toLowerCase()}`}>
          {lot.availability === "Unknown"
            ? "No recent data"
            : `${lot.availability} availability`}
        </span>
      </div>
      <h3>{lot.name}</h3>
      <span className="lot-type">
        {lot.location_type === "SURFACE_LOT"
          ? "Surface lot"
          : lot.location_type === "GARAGE"
            ? "Parking garage"
            : "Parking deck"}
        {recommended ? " · Recommended" : ""}
      </span>
      <div className="card-score">
        <strong>
          {lot.score ?? "—"}
          <span>/100</span>
        </strong>
        <span>Opportunity score</span>
      </div>
      <div className="mini-track">
        <div style={{ width: `${lot.score ?? 0}%` }} />
      </div>
      <div className="card-metrics">
        <div>
          <Clock3 size={16} />
          <span>Leaving soon</span>
          <strong>{lot.leaving}</strong>
        </div>
        <div>
          <Users size={16} />
          <span>Searching</span>
          <strong>{lot.searchers}</strong>
        </div>
        <div>
          <TrafficCone size={16} />
          <span>Traffic</span>
          <strong>{lot.traffic}</strong>
        </div>
      </div>
      <Link className="card-link" href={`/lots/${lot.id}`}>
        View details
        <ArrowUpRight size={18} />
      </Link>
    </article>
  );
}
