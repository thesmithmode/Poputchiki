import { useState } from "react";
import { apiFetch } from "../lib/api";

interface Props {
  displayName: string;
  onComplete: () => void;
}

export function OnboardingScreen({ displayName, onComplete }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState(displayName);
  const [aptNumber, setAptNumber] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFinish() {
    if (!consent) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        display_name: name.trim() || displayName,
        onboarded: true,
      };
      if (aptNumber.trim()) body.apt_number = aptNumber.trim();
      await apiFetch("/users/me", { method: "PATCH", body: JSON.stringify(body) });
      onComplete();
    } catch {
      setError("Ошибка сохранения. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      data-testid="onboarding-screen"
      className="flex min-h-screen flex-col items-center justify-center bg-white px-6"
    >
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Добро пожаловать!</h1>
      <p className="mb-8 text-sm text-gray-500">Шаг {step} из 3</p>

      {step === 1 && (
        <div data-testid="onboarding-step-1" className="w-full max-w-sm">
          <label className="mb-1 block text-sm font-medium text-gray-700">Ваше имя</label>
          <input
            data-testid="onboarding-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            className="mb-6 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm"
          />
          <button
            type="button"
            data-testid="onboarding-next-1"
            disabled={!name.trim()}
            onClick={() => setStep(2)}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Далее
          </button>
        </div>
      )}

      {step === 2 && (
        <div data-testid="onboarding-step-2" className="w-full max-w-sm">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Номер квартиры{" "}
            <span className="font-normal text-gray-400">(необязательно)</span>
          </label>
          <input
            data-testid="onboarding-apt"
            type="text"
            value={aptNumber}
            onChange={(e) => setAptNumber(e.target.value)}
            maxLength={20}
            placeholder="Например: 42"
            className="mb-6 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm"
          />
          <button
            type="button"
            data-testid="onboarding-next-2"
            onClick={() => setStep(3)}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white"
          >
            Далее
          </button>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="mt-3 w-full text-sm text-gray-500 underline"
          >
            Назад
          </button>
        </div>
      )}

      {step === 3 && (
        <div data-testid="onboarding-step-3" className="w-full max-w-sm">
          <label className="mb-6 flex items-start gap-3">
            <input
              data-testid="onboarding-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-sm text-gray-700">
              Я соглашаюсь на обработку персональных данных в рамках сервиса Попутчики ЖК Царёво
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
            onClick={() => setStep(2)}
            className="mt-3 w-full text-sm text-gray-500 underline"
          >
            Назад
          </button>
        </div>
      )}
    </div>
  );
}
