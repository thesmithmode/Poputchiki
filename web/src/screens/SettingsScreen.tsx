import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMe } from "../hooks/useMe";
import { type ThemePref, useThemePreference } from "../hooks/useThemePreference";
import { useUser } from "../hooks/useUser";
import { apiFetch } from "../lib/api";
import { clearTokens, getTokens } from "../lib/tokenStore";

const APP_VERSION = "0.1.0";

type DeleteState = "idle" | "confirm" | "deleting";

function monthsInService(createdAt: string): number {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.floor(ms / (30 * 24 * 60 * 60 * 1000));
}

export function SettingsScreen() {
  const navigate = useNavigate();
  const me = useMe();
  const myId = me.status === "ok" ? me.user.id : "";
  const { data: user } = useUser(myId);
  const { pref, setPref } = useThemePreference();
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

  const displayName = user?.display_name ?? (me.status === "ok" ? me.user.display_name : "");
  const months = user ? monthsInService(user.created_at) : 0;
  const totalRides =
    (user?.stats.rides_as_driver_completed ?? 0) + (user?.stats.rides_as_passenger ?? 0);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--brand-bg)",
        color: "var(--brand-text)",
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
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--brand-text)", margin: 0 }}>
          Профиль
        </h1>
      </div>

      <div style={{ flex: 1, padding: "16px 16px 80px" }}>
        {/* Hero card */}
        <div
          style={{
            background: "var(--brand-surface)",
            border: "1px solid var(--brand-line)",
            borderRadius: 16,
            padding: "20px 16px",
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: user?.avatar_url ? "transparent" : "var(--brand-surface2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              margin: "0 auto 12px",
              overflow: "hidden",
            }}
          >
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={displayName}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              "👤"
            )}
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--brand-text)",
              marginBottom: 4,
            }}
          >
            {displayName || "—"}
          </div>
          {user?.tg_username && (
            <div style={{ fontSize: 13, color: "var(--brand-sub)" }}>@{user.tg_username}</div>
          )}

          {user && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 0,
                marginTop: 16,
              }}
            >
              <BigStat value={user.stats.likes_received} label="лайки" />
              <BigStat
                value={user.stats.avg_stars !== null ? user.stats.avg_stars.toFixed(1) : "—"}
                label="рейтинг"
              />
              <BigStat value={totalRides} label="поездки" />
            </div>
          )}

          {myId && (
            <button
              type="button"
              onClick={() => navigate(`/users/${myId}`)}
              style={{
                marginTop: 16,
                padding: "10px 16px",
                background: "var(--brand-surface2)",
                color: "var(--brand-text)",
                border: "none",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Открыть профиль · {months} мес. в сервисе
            </button>
          )}
        </div>

        {/* Theme */}
        <SectionTitle>Тема</SectionTitle>
        <Section>
          <ThemeToggle pref={pref} onChange={setPref} />
        </Section>

        {/* Settings */}
        <SectionTitle>Настройки</SectionTitle>
        <Section>
          <RowLink label="🔔 Уведомления" onClick={() => navigate("/settings/notifications")} />
          <RowLink label="📄 Политика конфиденциальности" onClick={() => navigate("/privacy")} />
          <RowLink label="📋 Условия использования" onClick={() => navigate("/terms")} />
        </Section>

        <Section>
          <RowButton
            label={loggingOut ? "Выходим..." : "Выйти"}
            color="var(--brand-danger)"
            disabled={loggingOut}
            onClick={handleLogout}
            testId="logout-btn"
          />
          <RowButton
            label="Удалить аккаунт"
            color="var(--brand-danger)"
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
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--brand-text)",
                marginBottom: 8,
              }}
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
                  background: confirmText === "УДАЛИТЬ" ? "var(--brand-danger)" : "#fca5a5",
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

function BigStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ padding: "8px 0", borderRight: "1px solid var(--brand-line)" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--brand-text)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--brand-sub)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: "var(--brand-sub)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        margin: "16px 4px 8px",
      }}
    >
      {children}
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
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function ThemeToggle({
  pref,
  onChange,
}: {
  pref: ThemePref;
  onChange: (p: ThemePref) => void;
}) {
  const opts: { id: ThemePref; label: string }[] = [
    { id: "system", label: "Системная" },
    { id: "light", label: "Светлая" },
    { id: "dark", label: "Тёмная" },
  ];
  return (
    <div
      data-testid="theme-toggle"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 4,
        padding: 4,
      }}
    >
      {opts.map((o) => {
        const active = pref === o.id;
        return (
          <button
            key={o.id}
            type="button"
            data-testid={`theme-${o.id}`}
            onClick={() => onChange(o.id)}
            style={{
              padding: "10px 8px",
              borderRadius: 10,
              border: "none",
              background: active ? "var(--brand-primary)" : "transparent",
              color: active ? "var(--brand-primary-ink, #fff)" : "var(--brand-text)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {o.label}
          </button>
        );
      })}
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
