export default function Loading() {
  return (
    <main className="container loading" aria-busy="true">
      <p>Loading parking conditions…</p>
      <div className="skeleton" />
      <div className="lot-grid">
        {[1, 2, 3].map((i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
    </main>
  );
}
