import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTelegramBack } from "../hooks/useTelegramBack";
import { apiFetch } from "../lib/api";
import { clearTokens, getTokens } from "../lib/tokenStore";

const APP_VERSION = "0.1.0";

type DeleteState = "idle" | "confirm" | "deleting";

export function SettingsScreen() {
  const navigate = useNavigate();
  useTelegramBack(() => navigate(-1));
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const [confirmText, setConfirmText] = useState("");

  async function handleLogout() {
    setLoggingOut(true);
    const tokens = getTokens();
    try {
      await apiFetch("/auth/logout", {
        method: "POST",
        body: tokens
          ? JSON.stringify({ access_token: tokens.access, refresh_token: tokens.refresh })
          : "{}",
      });
    } catch {
      // logout always succeeds client-side
    }
    clearTokens();
    window.location.reload();
  }

  async function handleDeleteAccount() {
    setDeleteState("deleting");
    const tokens = getTokens();
    try {
      await apiFetch("/users/me", { method: "DELETE" });
      await apiFetch("/auth/logout", {
        method: "POST",
        body: tokens
          ? JSON.stringify({ access_token: tokens.access, refresh_token: tokens.refresh })
          : "{}",
      }).catch(() => {});
    } catch {
      // proceed regardless
    }
    clearTokens();
    window.location.reload();
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--brand-bg)",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "var(--brand-surface)",
          borderBottom: "1px solid var(--brand-line)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            background: "none",
            border: "none",
            fontSize: 20,
            cursor: "pointer",
            padding: 4,
            color: "var(--brand-text)",
          }}
          aria-label="Назад"
        >
          ←
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--brand-text)", margin: 0 }}>
          Настройки
        </h1>
      </div>

      <div style={{ flex: 1, padding: "12px 16px 40px" }}>
        <Section>
          <RowLink label="🔔 Уведомления" onClick={() => navigate("/settings/notifications")} />
        </Section>

        <Section>
          <RowLink label="📄 Политика конфиденциальности" onClick={() => navigate("/privacy")} />
          <RowLink label="📋 Условия использования" onClick={() => navigate("/terms")} />
        </Section>

        <Section>
          <RowButton
            label={loggingOut ? "Выходим..." : "Выйти"}
            color="#e54e5c"
            disabled={loggingOut}
            onClick={handleLogout}
            testId="logout-btn"
          />
          <RowButton
            label="Удалить аккаунт"
            color="#e54e5c"
            disabled={deleteState !== "idle"}
            onClick={() => setDeleteState("confirm")}
            testId="delete-account-btn"
          />
        </Section>

        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "var(--brand-sub)",
            marginTop: 24,
          }}
          data-testid="app-version"
        >
          Poputchiki v{APP_VERSION}
        </div>
      </div>

      {deleteState === "confirm" && (
        <div
          data-testid="delete-confirm-modal"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: "var(--brand-surface)",
              borderRadius: 16,
              padding: 24,
              width: "100%",
              maxWidth: 380,
              border: "1px solid var(--brand-line)",
            }}
          >
            <div
              style={{ fontSize: 16, fontWeight: 700, color: "var(--brand-text)", marginBottom: 8 }}
            >
              Удалить аккаунт?
            </div>
            <div style={{ fontSize: 14, color: "var(--brand-sub)", marginBottom: 16 }}>
              Это действие необратимо. Все ваши поездки и данные будут удалены. Введите{" "}
              <strong>УДАЛИТЬ</strong> для подтверждения.
            </div>
            <input
              data-testid="delete-confirm-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="УДАЛИТЬ"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid var(--brand-line)",
                borderRadius: 8,
                fontSize: 14,
                boxSizing: "border-box",
                marginBottom: 16,
                background: "var(--brand-bg)",
                color: "var(--brand-text)",
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setDeleteState("idle");
                  setConfirmText("");
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "var(--brand-surface2)",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "var(--brand-text)",
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                data-testid="delete-confirm-submit"
                disabled={confirmText !== "УДАЛИТЬ"}
                onClick={handleDeleteAccount}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: confirmText === "УДАЛИТЬ" ? "#e54e5c" : "#fca5a5",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#fff",
                  cursor: confirmText === "УДАЛИТЬ" ? "pointer" : "not-allowed",
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--brand-surface)",
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid var(--brand-line)",
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function RowLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "14px 16px",
        background: "none",
        border: "none",
        borderBottom: "1px solid var(--brand-line)",
        fontSize: 15,
        color: "var(--brand-text)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {label}
      <span style={{ color: "var(--brand-sub)" }}>→</span>
    </button>
  );
}

function RowButton({
  label,
  color,
  disabled,
  onClick,
  testId,
}: {
  label: string;
  color: string;
  disabled: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        padding: "14px 16px",
        background: "none",
        border: "none",
        borderBottom: "1px solid var(--brand-line)",
        fontSize: 15,
        fontWeight: 600,
        color: disabled ? "var(--brand-sub)" : color,
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
      }}
    >
      {label}
    </button>
  );
}
