function Loading() {
  return (
    <div
      className="portal-bootstrap-shell"
      aria-busy="true"
      aria-label="Loading Open Suite"
    >
      <main className="portal-bootstrap-content" aria-hidden="true">
        <div className="portal-bootstrap-action" />
        <div className="portal-bootstrap-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <section className="portal-bootstrap-widget" key={index}>
              <div className="portal-bootstrap-title" />
              <div className="portal-bootstrap-line portal-bootstrap-line-wide" />
              <div className="portal-bootstrap-line" />
              <div className="portal-bootstrap-line portal-bootstrap-line-short" />
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

export default Loading;
