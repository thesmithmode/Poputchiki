import { useState } from "react";
import { apiFetch } from "../lib/api";
import { PrivacyScreen } from "./legal/PrivacyScreen";
import { TermsScreen } from "./legal/TermsScreen";

interface Props {
  displayName: string;
  onComplete: () => void;
}

export function OnboardingScreen({ displayName, onComplete }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [nickname, setNickname] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legalView, setLegalView] = useState<"terms" | "privacy" | null>(null);

  async function handleFinish() {
    if (!consent) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { onboarded: true };
      const trimmed = nickname.trim();
      if (trimmed && trimmed !== displayName) {
        body.display_name = trimmed;
      }
      await apiFetch("/users/me", { method: "PATCH", body: JSON.stringify(body) });
      onComplete();
    } catch {
      setError("Ошибка сохранения. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  if (legalView) {
    return (
      <div
        style={{ position: "fixed", inset: 0, background: "#fff", overflowY: "auto", zIndex: 100 }}
      >
        <button
          type="button"
          data-testid="legal-back-btn"
          onClick={() => setLegalView(null)}
          style={{
            position: "sticky",
            top: 0,
            background: "#fff",
            border: "none",
            padding: "12px 16px",
            fontSize: 14,
            color: "#2d5a3d",
            cursor: "pointer",
            display: "block",
            width: "100%",
            textAlign: "left",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          ← Назад
        </button>
        {legalView === "terms" ? <TermsScreen /> : <PrivacyScreen />}
      </div>
    );
  }

  return (
    <div
      data-testid="onboarding-screen"
      className="flex min-h-screen flex-col items-center justify-center bg-white px-6"
    >
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Добро пожаловать!</h1>
      <p className="mb-8 text-sm text-gray-500">Шаг {step} из 2</p>

      {step === 1 && (
        <div data-testid="onboarding-step-1" className="w-full max-w-sm">
          <p className="mb-3 text-sm text-gray-500">
            Ваше имя в Telegram: <span className="font-medium text-gray-700">{displayName}</span>
          </p>
          <label htmlFor="onboarding-name" className="mb-1 block text-sm font-medium text-gray-700">
            Псевдоним <span className="font-normal text-gray-400">(необязательно)</span>
          </label>
          <input
            id="onboarding-name"
            data-testid="onboarding-name"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={50}
            placeholder={displayName}
            className="mb-2 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm"
          />
          <p className="mb-6 text-xs text-gray-400">
            Если оставить пустым — будет отображаться имя из Telegram
          </p>
          <button
            type="button"
            data-testid="onboarding-next-1"
            onClick={() => setStep(2)}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white"
          >
            Далее
          </button>
        </div>
      )}

      {step === 2 && (
        <div data-testid="onboarding-step-2" className="w-full max-w-sm">
          <label className="mb-6 flex items-start gap-3">
            <input
              data-testid="onboarding-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-gray-700">
              Я соглашаюсь с{" "}
              <button
                type="button"
                data-testid="legal-terms-btn"
                onClick={() => setLegalView("terms")}
                className="underline text-blue-600 bg-transparent border-none p-0 cursor-pointer text-sm"
              >
                условиями использования
              </button>{" "}
              и{" "}
              <button
                type="button"
                data-testid="legal-privacy-btn"
                onClick={() => setLegalView("privacy")}
                className="underline text-blue-600 bg-transparent border-none p-0 cursor-pointer text-sm"
              >
                политикой конфиденциальности
              </button>{" "}
              сервиса Попутчики ЖК Царёво
            </span>
          </label>
          {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
          <button
            type="button"
            data-testid="onboarding-finish"
            disabled={!consent || loading}
            onClick={handleFinish}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Сохраняем..." : "Начать"}
          </button>
          <button
            type="button"
            data-testid="onboarding-back-2"
            onClick={() => setStep(1)}
            className="mt-3 w-full text-sm text-gray-500 underline"
          >
            Назад
          </button>
        </div>
      )}
    </div>
  );
}
