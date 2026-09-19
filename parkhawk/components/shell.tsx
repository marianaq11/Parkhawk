"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, LayoutGrid, ShieldCheck, ParkingSquare } from "lucide-react";
import type { Profile } from "@/lib/types";
import { post } from "./api";
import { useState } from "react";
export function Shell({
  user,
  children,
}: {
  user: Profile;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [error, setError] = useState("");
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/">
            <span className="brand-icon">
              <ParkingSquare size={24} />
            </span>
            ParkHawk<span className="campus">MONTCLAIR CAMPUS</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link className={pathname === "/" ? "selected" : ""} href="/">
              <LayoutGrid size={17} />
              Overview
            </Link>
            {user.role === "ADMIN" && (
              <Link
                className={pathname === "/admin" ? "selected" : ""}
                href="/admin"
              >
                <ShieldCheck size={17} />
                Admin
              </Link>
            )}
          </nav>
          <div className="account">
            <span className="avatar">{user.display_name.charAt(0)}</span>
            <span>{user.display_name}</span>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                try {
                  await post("logout", {});
                  router.replace("/login");
                  router.refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <div className="demo-strip">
        <span className="demo-label">DEMO</span>Simulated parking reports.
        Conditions are not live Montclair data.
      </div>
      {error && (
        <div role="alert" className="error container">
          {error}
        </div>
      )}
      <main className="container">{children}</main>
      <footer className="container footer">
        <strong>ParkHawk</strong>
        <span>
          Independent student project. Not an official Montclair State
          University parking service.
        </span>
        <span>Check posted permit rules.</span>
      </footer>
    </>
  );
}
