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
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--brand-bg)",
          overflowY: "auto",
          zIndex: 100,
        }}
      >
        <button
          type="button"
          data-testid="legal-back-btn"
          onClick={() => setLegalView(null)}
          style={{
            position: "sticky",
            top: 0,
            background: "var(--brand-surface)",
            border: "none",
            padding: "12px 16px",
            fontSize: 14,
            color: "var(--brand-primary)",
            cursor: "pointer",
            display: "block",
            width: "100%",
            textAlign: "left",
            borderBottom: "1px solid var(--brand-line)",
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
      style={{
        display: "flex",
        minHeight: "100vh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--brand-bg)",
        padding: "0 24px",
        gap: 24,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div className="pp-display" style={{ marginBottom: 8 }}>
          Попутчики
        </div>
        <div className="pp-caption" style={{ color: "var(--brand-sub)" }}>
          ЖК Царёво · Казань
        </div>
      </div>

      <div className="pp-h1" style={{ textAlign: "center" }}>
        Добро пожаловать!
      </div>
      <p className="pp-caption" style={{ marginTop: -16 }}>
        Шаг {step} из 2
      </p>

      {step === 1 && (
        <div data-testid="onboarding-step-1" style={{ width: "100%", maxWidth: 360 }}>
          <p className="pp-body" style={{ color: "var(--brand-sub)", marginBottom: 12 }}>
            Ваше имя в Telegram:{" "}
            <span style={{ color: "var(--brand-text)", fontWeight: 600 }}>{displayName}</span>
          </p>
          <label
            htmlFor="onboarding-name"
            className="pp-eyebrow"
            style={{ display: "block", marginBottom: 6 }}
          >
            Псевдоним (необязательно)
          </label>
          <input
            id="onboarding-name"
            data-testid="onboarding-name"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={50}
            placeholder={displayName}
            style={{
              width: "100%",
              padding: "12px 14px",
              background: "var(--brand-surface)",
              border: "1px solid var(--brand-line)",
              borderRadius: 12,
              fontSize: 14,
              color: "var(--brand-text)",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <p className="pp-caption" style={{ color: "var(--brand-faint)", margin: "8px 0 20px" }}>
            Если оставить пустым — будет отображаться имя из Telegram
          </p>
          <button
            type="button"
            data-testid="onboarding-next-1"
            onClick={() => setStep(2)}
            style={{
              width: "100%",
              padding: "12px 24px",
              background: "var(--brand-primary)",
              color: "var(--brand-primary-ink)",
              border: "none",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Далее
          </button>
        </div>
      )}

      {step === 2 && (
        <div data-testid="onboarding-step-2" style={{ width: "100%", maxWidth: 360 }}>
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              marginBottom: 20,
              cursor: "pointer",
            }}
          >
            <input
              data-testid="onboarding-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              style={{ marginTop: 4 }}
            />
            <span className="pp-body" style={{ color: "var(--brand-text)" }}>
              Я соглашаюсь с{" "}
              <button
                type="button"
                data-testid="legal-terms-btn"
                onClick={() => setLegalView("terms")}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  color: "var(--brand-primary)",
                  textDecoration: "underline",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                условиями использования
              </button>{" "}
              и{" "}
              <button
                type="button"
                data-testid="legal-privacy-btn"
                onClick={() => setLegalView("privacy")}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  color: "var(--brand-primary)",
                  textDecoration: "underline",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                политикой конфиденциальности
              </button>{" "}
              сервиса Попутчики ЖК Царёво
            </span>
          </label>
          {error && (
            <p className="pp-caption" style={{ color: "var(--brand-danger)", marginBottom: 12 }}>
              {error}
            </p>
          )}
          <button
            type="button"
            data-testid="onboarding-finish"
            disabled={!consent || loading}
            onClick={handleFinish}
            style={{
              width: "100%",
              padding: "12px 24px",
              background: "var(--brand-primary)",
              color: "var(--brand-primary-ink)",
              border: "none",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              cursor: !consent || loading ? "not-allowed" : "pointer",
              opacity: !consent || loading ? 0.5 : 1,
              fontFamily: "inherit",
            }}
          >
            {loading ? "Сохраняем..." : "Начать"}
          </button>
          <button
            type="button"
            data-testid="onboarding-back-2"
            onClick={() => setStep(1)}
            style={{
              marginTop: 12,
              width: "100%",
              padding: "8px 16px",
              background: "transparent",
              border: "none",
              color: "var(--brand-sub)",
              fontSize: 14,
              textDecoration: "underline",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Назад
          </button>
        </div>
      )}
    </div>
  );
}
