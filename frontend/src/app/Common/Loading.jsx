function Loading() {
  return (
    <div
      className="portal-bootstrap-shell"
      aria-busy="true"
      aria-label="Loading Open Suite"
    >
      <header className="portal-bootstrap-header" aria-hidden="true">
        <span className="portal-bootstrap-brand">Open Suite</span>
        <span className="portal-bootstrap-profile" />
        <span className="portal-bootstrap-logout" />
      </header>
      <main className="portal-bootstrap-content" aria-hidden="true">
        <div className="portal-bootstrap-action" />
        <div className="portal-bootstrap-grid">
          {[
            "chat",
            "calendar",
            "messages",
            "meet",
            "docs",
            "ocs",
            "projects",
          ].map((widget) => (
            <section
              className={`portal-bootstrap-widget portal-bootstrap-${widget}`}
              key={widget}
            >
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
