import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";

type CategoryKey =
  | "ride_request"
  | "ride_cancelled"
  | "confirm_participation"
  | "like_received"
  | "review_received"
  | "favorite_new_ride"
  | "support_reply"
  | "system";

type Prefs = Record<CategoryKey, boolean>;

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  ride_request: "Запросы на поездку",
  ride_cancelled: "Отмена поездки",
  confirm_participation: "Подтверждение участия",
  like_received: "Получен лайк",
  review_received: "Получен отзыв",
  favorite_new_ride: "Новые поездки избранных",
  support_reply: "Ответ поддержки",
  system: "Системные (нельзя отключить)",
};

const ALL_CATEGORIES: CategoryKey[] = [
  "ride_request",
  "ride_cancelled",
  "confirm_participation",
  "like_received",
  "review_received",
  "favorite_new_ride",
  "support_reply",
  "system",
];

const MUTABLE_CATEGORIES: CategoryKey[] = ALL_CATEGORIES.filter((k) => k !== "system");

async function fetchPrefs(): Promise<Prefs> {
  return apiFetch<Prefs>("/notifications/preferences");
}

async function putPrefs(partial: Partial<Prefs>): Promise<Prefs> {
  return apiFetch<Prefs>("/notifications/preferences", {
    method: "PUT",
    body: JSON.stringify(partial),
  });
}

function Toggle({
  on,
  disabled,
  onClick,
  label,
  testId,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      style={{
        position: "relative",
        width: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        background: on ? "var(--brand-primary)" : "var(--brand-line)",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.2s",
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}

export function NotificationPreferencesScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: prefs, isLoading } = useQuery({
    queryKey: queryKeys.notifPrefs.all,
    queryFn: fetchPrefs,
  });

  async function toggle(key: CategoryKey) {
    if (!prefs) return;
    const next = await putPrefs({ [key]: !prefs[key] });
    qc.setQueryData(queryKeys.notifPrefs.all, next);
  }

  async function muteAll() {
    if (!prefs) return;
    const patch: Partial<Prefs> = {};
    for (const key of MUTABLE_CATEGORIES) patch[key] = false;
    const next = await putPrefs(patch);
    qc.setQueryData(queryKeys.notifPrefs.all, next);
  }

  async function unmuteAll() {
    if (!prefs) return;
    const patch: Partial<Prefs> = {};
    for (const key of MUTABLE_CATEGORIES) patch[key] = true;
    const next = await putPrefs(patch);
    qc.setQueryData(queryKeys.notifPrefs.all, next);
  }

  const isGlobalMuted = prefs ? MUTABLE_CATEGORIES.every((k) => !prefs[k]) : false;

  if (isLoading || !prefs) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--brand-bg)",
        }}
      >
        <p style={{ fontSize: 14, color: "var(--brand-sub)" }}>Загрузка...</p>
      </div>
    );
  }

  return (
    <div
      data-testid="notif-pref-screen"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--brand-bg)",
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
          Уведомления
        </h1>
      </header>

      <div style={{ padding: 16 }}>
        {/* Global mute row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderRadius: 14,
            background: "var(--brand-surface)",
            border: "1px solid var(--brand-line)",
            padding: "12px 16px",
            marginBottom: 16,
          }}
        >
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--brand-text)", margin: 0 }}>
              Отключить все
            </p>
            <p style={{ fontSize: 12, color: "var(--brand-sub)", margin: "2px 0 0" }}>
              Кроме системных
            </p>
          </div>
          <Toggle
            on={!isGlobalMuted}
            onClick={isGlobalMuted ? unmuteAll : muteAll}
            label={isGlobalMuted ? "Включить уведомления" : "Отключить все уведомления"}
            testId="toggle-global-mute"
          />
        </div>

        {/* Category list */}
        <div
          style={{
            borderRadius: 14,
            background: "var(--brand-surface)",
            border: "1px solid var(--brand-line)",
            overflow: "hidden",
          }}
        >
          {ALL_CATEGORIES.map((key, i) => (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderBottom:
                  i < ALL_CATEGORIES.length - 1 ? "1px solid var(--brand-line)" : "none",
              }}
            >
              <span style={{ fontSize: 14, color: "var(--brand-text)" }}>
                {CATEGORY_LABELS[key]}
              </span>
              <Toggle
                on={prefs[key]}
                disabled={key === "system"}
                onClick={() => toggle(key)}
                label={`${CATEGORY_LABELS[key]}: ${prefs[key] ? "включено" : "выключено"}`}
                testId={`toggle-${key}`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
