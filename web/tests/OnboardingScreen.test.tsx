import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingScreen } from "../src/screens/OnboardingScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock("../src/screens/legal/TermsScreen", () => ({
  TermsScreen: () => <div data-testid="terms-screen">Terms</div>,
}));

vi.mock("../src/screens/legal/PrivacyScreen", () => ({
  PrivacyScreen: () => <div data-testid="privacy-screen">Privacy</div>,
}));

import { apiFetch } from "../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

describe("OnboardingScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("рендерит шаг 1 с пустым полем псевдонима", () => {
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);
    expect(screen.getByTestId("onboarding-step-1")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-name")).toHaveValue("");
  });

  it("показывает TG-имя в подсказке на шаге 1", () => {
    render(<OnboardingScreen displayName="Иван Петров" onComplete={vi.fn()} />);
    expect(screen.getByText(/Иван Петров/)).toBeInTheDocument();
  });

  it("поле псевдонима имеет placeholder = TG-имя", () => {
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);
    expect(screen.getByTestId("onboarding-name")).toHaveAttribute("placeholder", "Иван");
  });

  it("кнопка 'Далее' на шаге 1 всегда активна (псевдоним необязателен)", () => {
    render(<OnboardingScreen displayName="" onComplete={vi.fn()} />);
    expect(screen.getByTestId("onboarding-next-1")).not.toBeDisabled();
  });

  it("переход на шаг 2 (согласие) после шага 1", () => {
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    expect(screen.getByTestId("onboarding-step-2")).toBeInTheDocument();
  });

  it("всего 2 шага (не 3)", () => {
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);
    expect(screen.getByText(/Шаг 1 из 2/)).toBeInTheDocument();
  });

  it("кнопка 'Начать' неактивна без согласия", () => {
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    expect(screen.getByTestId("onboarding-finish")).toBeDisabled();
  });

  it("PATCH /users/me вызывается при завершении с согласием", async () => {
    mockedApiFetch.mockResolvedValueOnce({});
    const onComplete = vi.fn();
    render(<OnboardingScreen displayName="Иван" onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    fireEvent.click(screen.getByTestId("onboarding-consent"));
    fireEvent.click(screen.getByTestId("onboarding-finish"));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/users/me",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("PATCH включает onboarded=true и НЕ включает display_name если псевдоним не задан", async () => {
    mockedApiFetch.mockResolvedValueOnce({});
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    fireEvent.click(screen.getByTestId("onboarding-consent"));
    fireEvent.click(screen.getByTestId("onboarding-finish"));

    await waitFor(() => {
      const call = mockedApiFetch.mock.calls[0];
      const init = call?.[1] as RequestInit | undefined;
      const body = JSON.parse((init?.body as string) ?? "{}");
      expect(body.onboarded).toBe(true);
      expect(body.display_name).toBeUndefined();
    });
  });

  it("PATCH включает display_name если псевдоним задан и отличается от TG-имени", async () => {
    mockedApiFetch.mockResolvedValueOnce({});
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);

    fireEvent.change(screen.getByTestId("onboarding-name"), { target: { value: "Ваня" } });
    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    fireEvent.click(screen.getByTestId("onboarding-consent"));
    fireEvent.click(screen.getByTestId("onboarding-finish"));

    await waitFor(() => {
      const call = mockedApiFetch.mock.calls[0];
      const init = call?.[1] as RequestInit | undefined;
      const body = JSON.parse((init?.body as string) ?? "{}");
      expect(body.display_name).toBe("Ваня");
    });
  });

  it("PATCH НЕ включает apt_number", async () => {
    mockedApiFetch.mockResolvedValueOnce({});
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    fireEvent.click(screen.getByTestId("onboarding-consent"));
    fireEvent.click(screen.getByTestId("onboarding-finish"));

    await waitFor(() => {
      const call = mockedApiFetch.mock.calls[0];
      const init = call?.[1] as RequestInit | undefined;
      const body = JSON.parse((init?.body as string) ?? "{}");
      expect(body.apt_number).toBeUndefined();
    });
  });

  it("onComplete вызывается после успешного PATCH", async () => {
    mockedApiFetch.mockResolvedValueOnce({});
    const onComplete = vi.fn();
    render(<OnboardingScreen displayName="Иван" onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    fireEvent.click(screen.getByTestId("onboarding-consent"));
    fireEvent.click(screen.getByTestId("onboarding-finish"));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it("показывает ошибку при неудачном PATCH", async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error("network"));
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    fireEvent.click(screen.getByTestId("onboarding-consent"));
    fireEvent.click(screen.getByTestId("onboarding-finish"));

    await waitFor(() => {
      expect(screen.getByText(/Ошибка сохранения/)).toBeInTheDocument();
    });
  });

  it("клик на 'условиями использования' показывает TermsScreen", () => {
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    fireEvent.click(screen.getByTestId("legal-terms-btn"));
    expect(screen.getByTestId("terms-screen")).toBeInTheDocument();
  });

  it("клик на 'политикой конфиденциальности' показывает PrivacyScreen", () => {
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    fireEvent.click(screen.getByTestId("legal-privacy-btn"));
    expect(screen.getByTestId("privacy-screen")).toBeInTheDocument();
  });

  it("кнопка 'Назад' в legal-modal возвращает к онбордингу", () => {
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    fireEvent.click(screen.getByTestId("legal-terms-btn"));
    expect(screen.getByTestId("terms-screen")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("legal-back-btn"));
    expect(screen.queryByTestId("terms-screen")).not.toBeInTheDocument();
    expect(screen.getByTestId("onboarding-step-2")).toBeInTheDocument();
  });

  it("кнопка 'Назад' на шаге 2 возвращает на шаг 1", () => {
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    expect(screen.getByTestId("onboarding-step-2")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("onboarding-back-2"));
    expect(screen.getByTestId("onboarding-step-1")).toBeInTheDocument();
  });
});
