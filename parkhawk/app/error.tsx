"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="container empty">
      <h1>We couldn’t load parking conditions.</h1>
      <p>
        Please try again. For a fresh local install, run npm run db:seed first.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
