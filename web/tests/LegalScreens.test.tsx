import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyScreen } from "../src/screens/legal/PrivacyScreen";
import { TermsScreen } from "../src/screens/legal/TermsScreen";

const SAMPLE_PRIVACY = "# Политика конфиденциальности\n\n## 1. Оператор\n\nТекст оператора.";
const SAMPLE_TERMS = "# Пользовательское соглашение\n\n## 1. Общие положения\n\nТекст.";

describe("PrivacyScreen", () => {
  it("рендерит заголовок страницы", () => {
    render(<PrivacyScreen _content={SAMPLE_PRIVACY} />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("рендерит h2 разделы", () => {
    render(<PrivacyScreen _content={SAMPLE_PRIVACY} />);
    expect(screen.getByText(/Оператор/)).toBeInTheDocument();
  });

  it("имеет data-testid=privacy-screen", () => {
    render(<PrivacyScreen _content={SAMPLE_PRIVACY} />);
    expect(screen.getByTestId("privacy-screen")).toBeInTheDocument();
  });
});

describe("TermsScreen", () => {
  it("рендерит заголовок страницы", () => {
    render(<TermsScreen _content={SAMPLE_TERMS} />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("рендерит h2 разделы", () => {
    render(<TermsScreen _content={SAMPLE_TERMS} />);
    expect(screen.getByText(/Общие положения/)).toBeInTheDocument();
  });

  it("имеет data-testid=terms-screen", () => {
    render(<TermsScreen _content={SAMPLE_TERMS} />);
    expect(screen.getByTestId("terms-screen")).toBeInTheDocument();
  });
});
