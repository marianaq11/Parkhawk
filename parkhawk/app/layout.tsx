import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ParkHawk | Campus parking, together",
  description:
    "An independent student project for crowdsourced Montclair campus parking conditions. Demo reports, departures, and parking opportunity scores.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
