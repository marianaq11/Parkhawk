"use client";
import { useEffect, useRef, useState } from "react";
import { X, CarFront, Clock3, Search, TrafficCone } from "lucide-react";
import type { LotSummary } from "@/lib/parking";
import { post } from "./api";
export function ReportDialog({
  lots,
  initialLot,
  onClose,
  onSaved,
}: {
  lots: LotSummary[];
  initialLot?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [type, setType] = useState("OPEN_SPOT"),
    [lot, setLot] = useState(initialLot || lots[0]?.id || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(event.currentTarget);
    try {
      await post("reports", {
        report_type: type,
        parking_location_id: lot,
        zone_or_floor: f.get("zone_or_floor") || "",
        note: f.get("note") || "",
        ...(type === "OPEN_SPOT"
          ? { quantity: Number(f.get("quantity")) }
          : {}),
        ...(type === "LEAVING_SOON"
          ? { leaving_eta_minutes: Number(f.get("eta")) }
          : {}),
        ...(type === "TRAFFIC" ? { traffic_level: f.get("traffic") } : {}),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog ref={ref} onCancel={onClose} className="report-dialog">
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">HELP THE NEXT DRIVER</span>
          <h2>Report parking info</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close report form"
        >
          <X />
        </button>
      </div>
      <form onSubmit={save}>
        <div className="report-types">
          {[
            { id: "OPEN_SPOT", name: "Open spot", icon: CarFront },
            { id: "LEAVING_SOON", name: "Leaving soon", icon: Clock3 },
            { id: "SEARCHING", name: "Looking for parking", icon: Search },
            { id: "TRAFFIC", name: "Traffic", icon: TrafficCone },
          ].map((t) => (
            <button
              type="button"
              key={t.id}
              className={type === t.id ? "active" : ""}
              aria-pressed={type === t.id}
              onClick={() => setType(t.id)}
            >
              <t.icon size={19} />
              {t.name}
            </button>
          ))}
        </div>
        <label>
          Parking location
          <select
            aria-label="Parking location"
            value={lot}
            onChange={(e) => setLot(e.target.value)}
            required
          >
            {lots.map((l) => (
              <option value={l.id} key={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        {type === "OPEN_SPOT" && (
          <div className="form-row">
            <label>
              Floor or zone (optional)
              <input
                name="zone_or_floor"
                maxLength={30}
                placeholder="e.g. Level 8"
              />
            </label>
            <label>
              Spaces seen
              <select name="quantity" aria-label="Spaces seen">
                <option value="1">1 space</option>
                <option value="2">2 spaces</option>
                <option value="3">3+ spaces</option>
              </select>
            </label>
          </div>
        )}
        {type === "LEAVING_SOON" && (
          <label>
            When are you leaving?
            <select name="eta" aria-label="When are you leaving?">
              <option value="0">Leaving now</option>
              <option value="10">In 10 minutes</option>
              <option value="30">In 30 minutes</option>
            </select>
          </label>
        )}
        {type === "TRAFFIC" && (
          <label>
            Traffic conditions
            <select name="traffic" aria-label="Traffic conditions">
              <option value="LIGHT">Light traffic</option>
              <option value="MODERATE">Moderate traffic</option>
              <option value="HEAVY">Heavy traffic</option>
            </select>
          </label>
        )}
        {type === "SEARCHING" ? (
          <p className="helper">
            Your search counts toward demand for 15 minutes. Report again to
            renew it or switch lots. Other users only see the total count.
          </p>
        ) : (
          <label>
            Short note (optional)
            <textarea
              name="note"
              maxLength={180}
              rows={2}
              placeholder="A useful detail for another driver"
            />
          </label>
        )}
        <p className="helper">
          Report only what you observed. Submit when safely parked.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy || !lot}>
          {busy
            ? "Submitting…"
            : type === "SEARCHING"
              ? "I'm looking here"
              : "Submit report"}
        </button>
      </form>
    </dialog>
  );
}
