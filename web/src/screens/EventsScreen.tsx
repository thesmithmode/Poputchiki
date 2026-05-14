import { useNavigate } from "react-router-dom";

export function EventsScreen() {
  const navigate = useNavigate();

  return (
    <div
      data-testid="events-screen"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--brand-bg)",
        color: "var(--brand-text)",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          borderBottom: "1px solid var(--brand-line)",
          background: "var(--brand-surface)",
          padding: "12px 16px",
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--brand-text)", margin: 0 }}>
          События
        </h1>
        <button
          type="button"
          data-testid="events-settings-gear"
          onClick={() => navigate("/settings/notifications")}
          aria-label="Настройки уведомлений"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            border: "none",
            background: "var(--brand-surface2)",
            color: "var(--brand-text)",
            cursor: "pointer",
            fontSize: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ⚙️
        </button>
      </header>

      <div
        style={{
          flex: 1,
          padding: "48px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 48 }}>🔔</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--brand-text)" }}>
          Пока нет событий
        </div>
        <div style={{ fontSize: 13, color: "var(--brand-sub)", maxWidth: 280 }}>
          Здесь появятся запросы на поездку, лайки, отзывы и другие уведомления.
        </div>
      </div>
    </div>
  );
}
