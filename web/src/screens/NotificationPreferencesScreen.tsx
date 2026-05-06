import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

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

export function NotificationPreferencesScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: prefs, isLoading } = useQuery({ queryKey: ["notif-prefs"], queryFn: fetchPrefs });

  async function toggle(key: CategoryKey) {
    if (!prefs) return;
    const next = await putPrefs({ [key]: !prefs[key] });
    qc.setQueryData(["notif-prefs"], next);
  }

  async function muteAll() {
    if (!prefs) return;
    const patch: Partial<Prefs> = {};
    for (const key of MUTABLE_CATEGORIES) {
      patch[key] = false;
    }
    const next = await putPrefs(patch);
    qc.setQueryData(["notif-prefs"], next);
  }

  async function unmuteAll() {
    if (!prefs) return;
    const patch: Partial<Prefs> = {};
    for (const key of MUTABLE_CATEGORIES) {
      patch[key] = true;
    }
    const next = await putPrefs(patch);
    qc.setQueryData(["notif-prefs"], next);
  }

  const isGlobalMuted = prefs ? MUTABLE_CATEGORIES.every((k) => !prefs[k]) : false;

  if (isLoading || !prefs) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Загрузка...</p>
      </div>
    );
  }

  return (
    <div data-testid="notif-pref-screen" className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="text-sm text-blue-600">
          ← Назад
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Уведомления</h1>
      </header>

      <div className="p-4">
        <div className="mb-6 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Отключить все</p>
            <p className="text-xs text-gray-400">Кроме системных</p>
          </div>
          <button
            type="button"
            data-testid="toggle-global-mute"
            onClick={isGlobalMuted ? unmuteAll : muteAll}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              isGlobalMuted ? "bg-gray-300" : "bg-blue-500"
            }`}
            aria-label={isGlobalMuted ? "Включить уведомления" : "Отключить все уведомления"}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                isGlobalMuted ? "translate-x-0.5" : "translate-x-5"
              }`}
            />
          </button>
        </div>

        <ul className="space-y-1">
          {ALL_CATEGORIES.map((key) => (
            <li
              key={key}
              className="flex items-center justify-between rounded-lg px-4 py-3 hover:bg-gray-50"
            >
              <span className="text-sm text-gray-800">{CATEGORY_LABELS[key]}</span>
              <button
                type="button"
                data-testid={`toggle-${key}`}
                disabled={key === "system"}
                onClick={() => toggle(key)}
                className={`relative h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed ${
                  prefs[key] ? "bg-blue-500" : "bg-gray-300"
                }`}
                aria-label={`${CATEGORY_LABELS[key]}: ${prefs[key] ? "включено" : "выключено"}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    prefs[key] ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
