export const BOOTSTRAP_LAYOUT = {
  chat: { x: 0, y: 0, w: 3, h: 5 },
  calendar: { x: 0, y: 5, w: 3, h: 5 },
  messages: { x: 3, y: 0, w: 6, h: 10 },
  meet: { x: 9, y: 0, w: 3, h: 5 },
  docs: { x: 9, y: 5, w: 3, h: 5 },
  ocs: { x: 0, y: 10, w: 12, h: 6 },
  projects: { x: 0, y: 16, w: 12, h: 5 },
};

function Loading() {
  return (
    <div
      className="portal-bootstrap-shell"
      aria-busy="true"
      aria-label="Loading Open Suite"
    >
      <div className="portal-bootstrap-content" aria-hidden="true">
        <div className="portal-bootstrap-action" />
        <div className="portal-bootstrap-grid">
          {Object.entries(BOOTSTRAP_LAYOUT).map(([id, layout]) => (
            <section
              className="portal-bootstrap-widget"
              data-widget-id={id}
              data-grid={`${layout.x},${layout.y},${layout.w},${layout.h}`}
              key={id}
              style={{
                "--bootstrap-column": layout.x + 1,
                "--bootstrap-row": layout.y + 1,
                "--bootstrap-width": layout.w,
                "--bootstrap-height": layout.h,
              }}
            >
              <div className="portal-bootstrap-title" />
              <div className="portal-bootstrap-line portal-bootstrap-line-wide" />
              <div className="portal-bootstrap-line" />
              <div className="portal-bootstrap-line portal-bootstrap-line-short" />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Loading;
