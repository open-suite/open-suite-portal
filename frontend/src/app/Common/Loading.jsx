import { RESPONSIVE_DEFAULT_WIDGETS } from "./dashboardLayout";

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
          {RESPONSIVE_DEFAULT_WIDGETS.map(({ id, wide }) => (
            <section
              className="portal-bootstrap-widget"
              data-widget-id={id}
              data-grid={`${wide.x},${wide.y},${wide.w},${wide.h}`}
              key={id}
              style={{
                "--bootstrap-column": wide.x + 1,
                "--bootstrap-row": wide.y + 1,
                "--bootstrap-width": wide.w,
                "--bootstrap-height": wide.h,
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
