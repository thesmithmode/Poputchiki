import { useNavigate } from "react-router-dom";

const APP_VERSION = "0.1.0";

export function AboutScreen() {
  const navigate = useNavigate();

  return (
    <div
      data-testid="about-screen"
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
          gap: 12,
          borderBottom: "1px solid var(--brand-line)",
          background: "var(--brand-surface)",
          padding: "12px 16px",
        }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Назад"
          style={{
            background: "none",
            border: "none",
            fontSize: 20,
            cursor: "pointer",
            padding: 4,
            color: "var(--brand-text)",
          }}
        >
          ←
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--brand-text)", margin: 0 }}>
          О приложении
        </h1>
      </header>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <Card>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Poputchiki</div>
          <div style={{ fontSize: 13, color: "var(--brand-sub)" }}>
            Сервис попутчиков ЖК Царёво · v{APP_VERSION}
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            Информационный сервис для жителей ЖК Царёво — поиск и публикация поездок. Мы не являемся
            перевозчиком; все договорённости заключаются напрямую между пользователями.
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 13, color: "var(--brand-sub)" }}>
            FAQ и подробная документация появятся позже.
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--brand-surface)",
        border: "1px solid var(--brand-line)",
        borderRadius: 14,
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}
