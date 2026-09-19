"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ParkingSquare, ArrowRight } from "lucide-react";
import { post } from "./api";
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("student1@parkhawk.demo"),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <ParkingSquare />
          </span>
          ParkHawk
        </div>
        <span className="eyebrow">MONTCLAIR CAMPUS · STUDENT PROJECT</span>
        <h1>
          Less circling.
          <br />
          More campus.
        </h1>
        <p>
          Find your next parking option with a little help from the people
          already there.
        </p>
        <div className="login-signals">
          <div>
            <strong>01</strong>
            <span>See where spaces are opening.</span>
          </div>
          <div>
            <strong>02</strong>
            <span>Compare demand and departures.</span>
          </div>
          <div>
            <strong>03</strong>
            <span>Share what you see. Help someone park.</span>
          </div>
        </div>
        <small>
          Independent student project. Not an official Montclair State
          University parking service.
        </small>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <span className="eyebrow">WELCOME TO PARKHAWK</span>
          <h2>Your campus. A clearer parking picture.</h2>
          <p className="muted">Sign in to view and share parking conditions.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await post("login", { email, password });
                router.replace("/");
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="demo-login">
            <span className="demo-label">DEMO ACCOUNTS</span>
            <p>Explore with a student account or try the admin tools.</p>
            <div className="demo-buttons">
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setEmail("student1@parkhawk.demo");
                  setPassword("ParkHawkDemo2026!");
                }}
              >
                Fill student login
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setEmail("admin@parkhawk.demo");
                  setPassword("ParkHawkDemo2026!");
                }}
              >
                Fill admin login
              </button>
            </div>
            <small>
              Simulated data only. Accounts must be seeded during setup.
            </small>
          </div>
        </div>
      </section>
    </main>
  );
}
