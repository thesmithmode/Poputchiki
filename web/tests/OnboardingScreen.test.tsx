import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingScreen } from "../src/screens/OnboardingScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

describe("OnboardingScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("рендерит шаг 1 с предзаполненным именем", () => {
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);
    expect(screen.getByTestId("onboarding-step-1")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-name")).toHaveValue("Иван");
  });

  it("кнопка 'Далее' на шаге 1 неактивна при пустом имени", () => {
    render(<OnboardingScreen displayName="" onComplete={vi.fn()} />);
    expect(screen.getByTestId("onboarding-next-1")).toBeDisabled();
  });

  it("переход на шаг 2 после заполнения имени", () => {
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    expect(screen.getByTestId("onboarding-step-2")).toBeInTheDocument();
  });

  it("переход на шаг 3 со шага 2", () => {
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    fireEvent.click(screen.getByTestId("onboarding-next-2"));
    expect(screen.getByTestId("onboarding-step-3")).toBeInTheDocument();
  });

  it("кнопка 'Начать' неактивна без согласия", () => {
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);
    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    fireEvent.click(screen.getByTestId("onboarding-next-2"));
    expect(screen.getByTestId("onboarding-finish")).toBeDisabled();
  });

  it("PATCH /users/me вызывается при завершении с согласием", async () => {
    mockedApiFetch.mockResolvedValueOnce({});
    const onComplete = vi.fn();
    render(<OnboardingScreen displayName="Иван" onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    fireEvent.change(screen.getByTestId("onboarding-apt"), { target: { value: "42" } });
    fireEvent.click(screen.getByTestId("onboarding-next-2"));
    fireEvent.click(screen.getByTestId("onboarding-consent"));
    fireEvent.click(screen.getByTestId("onboarding-finish"));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/users/me",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("onComplete вызывается после успешного PATCH", async () => {
    mockedApiFetch.mockResolvedValueOnce({});
    const onComplete = vi.fn();
    render(<OnboardingScreen displayName="Иван" onComplete={onComplete} />);

    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    fireEvent.click(screen.getByTestId("onboarding-next-2"));
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
    fireEvent.click(screen.getByTestId("onboarding-next-2"));
    fireEvent.click(screen.getByTestId("onboarding-consent"));
    fireEvent.click(screen.getByTestId("onboarding-finish"));

    await waitFor(() => {
      expect(screen.getByText(/Ошибка сохранения/)).toBeInTheDocument();
    });
  });

  it("номер квартиры опционален — без него PATCH не включает apt_number", async () => {
    mockedApiFetch.mockResolvedValueOnce({});
    render(<OnboardingScreen displayName="Иван" onComplete={vi.fn()} />);

    fireEvent.click(screen.getByTestId("onboarding-next-1"));
    fireEvent.click(screen.getByTestId("onboarding-next-2"));
    fireEvent.click(screen.getByTestId("onboarding-consent"));
    fireEvent.click(screen.getByTestId("onboarding-finish"));

    await waitFor(() => {
      const call = mockedApiFetch.mock.calls[0];
      const init = call?.[1] as RequestInit | undefined;
      const body = JSON.parse((init?.body as string) ?? "{}");
      expect(body.apt_number).toBeUndefined();
    });
  });
});
