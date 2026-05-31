import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RideCard } from "../src/components/RideCard";
import type { Ride } from "../src/types/ride";

const mockRide: Ride = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  driver_id: "550e8400-e29b-41d4-a716-446655440001",
  from_label: "ЖК Царёво, д. 5",
  from_lat: 55.7558,
  from_lng: 37.6173,
  to_label: "ул. Баумана",
  to_lat: 55.7963,
  to_lng: 49.1093,
  departure_at: new Date(Date.now() + 3600000).toISOString(),
  price_rub: 150,
  seats_total: 3,
  seats_taken: 1,
  status: "active",
  comment: "Тихая поездка",
  created_at: new Date().toISOString(),
};

describe("RideCard", () => {
  it("отображает from_label и to_label", () => {
    render(<RideCard ride={mockRide} />);
    expect(screen.getByText("ЖК Царёво, д. 5")).toBeInTheDocument();
    expect(screen.getByText("ул. Баумана")).toBeInTheDocument();
  });

  it("отображает время отправления в читаемом формате", () => {
    render(<RideCard ride={mockRide} />);
    // Departure time should contain HH:MM pattern
    const timePattern = /\d{1,2}:\d{2}/;
    expect(screen.getByText(timePattern)).toBeInTheDocument();
  });

  it("отображает цену 150 ₽", () => {
    render(<RideCard ride={mockRide} />);
    expect(screen.getByText(/150/)).toBeInTheDocument();
    expect(screen.getByText(/₽/)).toBeInTheDocument();
  });

  it("отображает количество свободных мест (seats_total - seats_taken)", () => {
    render(<RideCard ride={mockRide} />);
    // 3 total - 1 taken = 2 free — ищем элемент с "2" + " мест"
    expect(screen.getByText(/2\s+мест/)).toBeInTheDocument();
  });

  it("отображает '0 ₽' при price_rub = null", () => {
    render(<RideCard ride={{ ...mockRide, price_rub: null }} />);
    expect(screen.getByText("0 ₽")).toBeInTheDocument();
  });

  it("вызывает onClick при клике на карточку", () => {
    const onClick = vi.fn();
    render(<RideCard ride={mockRide} onClick={onClick} />);
    fireEvent.click(screen.getByTestId("ride-card"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(mockRide);
  });

  it("отображает комментарий когда он есть", () => {
    render(<RideCard ride={mockRide} />);
    expect(screen.getByText("Тихая поездка")).toBeInTheDocument();
  });

  it("не отображает секцию комментария когда comment = null", () => {
    render(<RideCard ride={{ ...mockRide, comment: null }} />);
    expect(screen.queryByText("Тихая поездка")).not.toBeInTheDocument();
  });

  it("не отображает кнопку избранного — сердечко удалено", () => {
    render(<RideCard ride={mockRide} />);
    expect(screen.queryByTestId("fav-toggle")).not.toBeInTheDocument();
  });

  it("отображает лейблы 'Откуда' и 'Куда' в cozy режиме", () => {
    render(<RideCard ride={mockRide} />);
    expect(screen.getByText("Откуда")).toBeInTheDocument();
    expect(screen.getByText("Куда")).toBeInTheDocument();
  });

  it("отображает относительное время отправления (через X ч)", () => {
    const inTwoHours = new Date(Date.now() + 2 * 3600000).toISOString();
    render(<RideCard ride={{ ...mockRide, departure_at: inTwoHours }} />);
    expect(screen.getByText("через 2 ч")).toBeInTheDocument();
  });

  it("отображает относительное время с минутами (через X ч Y мин)", () => {
    const in90Min = new Date(Date.now() + 90 * 60000).toISOString();
    render(<RideCard ride={{ ...mockRide, departure_at: in90Min }} />);
    expect(screen.getByText(/через 1 ч \d+ мин/)).toBeInTheDocument();
  });

  it("отображает 'через X мин' для близкого отправления", () => {
    const in30Min = new Date(Date.now() + 30 * 60000).toISOString();
    render(<RideCard ride={{ ...mockRide, departure_at: in30Min }} />);
    expect(screen.getByText(/через \d+ мин/)).toBeInTheDocument();
  });

  it("отображает 'уже уехал' для прошедшего отправления", () => {
    const past = new Date(Date.now() - 3600000).toISOString();
    render(<RideCard ride={{ ...mockRide, departure_at: past }} />);
    expect(screen.getByText("уже уехал")).toBeInTheDocument();
  });

  it("compact режим отображает to_label и цену", () => {
    render(<RideCard ride={mockRide} density="compact" />);
    expect(screen.getByText("ул. Баумана")).toBeInTheDocument();
    expect(screen.getByText(/150/)).toBeInTheDocument();
  });

  it("compact режим показывает количество мест", () => {
    render(<RideCard ride={mockRide} density="compact" />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("показывает расчетное время поездки даже без дистанции", () => {
    render(<RideCard ride={{ ...mockRide, route_duration_s: 35 * 60 }} />);
    expect(screen.getByText(/35/)).toBeInTheDocument();
  });

  it("cardState='own' показывает бейдж 'Ваша поездка'", () => {
    render(<RideCard ride={mockRide} cardState="own" />);
    expect(screen.getByText("Ваша поездка")).toBeInTheDocument();
  });

  it("cardState='applied' показывает бейдж 'Заявка подана'", () => {
    render(<RideCard ride={mockRide} cardState="applied" />);
    expect(screen.getByText("Заявка подана")).toBeInTheDocument();
  });

  it("cardState='approved' показывает бейдж 'Одобрено'", () => {
    render(<RideCard ride={mockRide} cardState="approved" />);
    expect(screen.getByText("Одобрено")).toBeInTheDocument();
  });

  it("cardState='viewed' не показывает бейдж", () => {
    render(<RideCard ride={mockRide} cardState="viewed" />);
    expect(screen.queryByText("Ваша поездка")).not.toBeInTheDocument();
    expect(screen.queryByText("Заявка подана")).not.toBeInTheDocument();
    expect(screen.queryByText("Одобрено")).not.toBeInTheDocument();
  });

  it("без cardState (default) не показывает бейдж состояния", () => {
    render(<RideCard ride={mockRide} />);
    expect(screen.queryByText("Ваша поездка")).not.toBeInTheDocument();
    expect(screen.queryByText("Заявка подана")).not.toBeInTheDocument();
    expect(screen.queryByText("Одобрено")).not.toBeInTheDocument();
  });
  it("cozy layout matches dense route-card structure and preserves expanded ride data", () => {
    const richRide: Ride = {
      ...mockRide,
      driver_display_name: "Driver Test",
      driver_tg_id: 123,
      route_distance_m: 12300,
      route_duration_s: 38 * 60,
    };

    render(<RideCard ride={richRide} cardState="own" isAlongTheWay />);

    const card = screen.getByTestId("ride-card");
    const grid = screen.getByTestId("ride-card-expanded-grid");
    const text = card.textContent ?? "";
    expect(card).toHaveStyle({ borderRadius: "12px", padding: "0px" });
    expect(grid).toHaveStyle({
      display: "grid",
      gridTemplateColumns: "72px 24px minmax(0, 1fr) 58px",
    });
    expect(screen.getByTestId("ride-card-route-rail")).toBeInTheDocument();
    expect(screen.getByTestId("ride-card-side-meta")).toBeInTheDocument();
    expect(screen.getByTestId("ride-card-footer")).toBeInTheDocument();
    expect(screen.getByTestId("ride-card-chevron")).toBeInTheDocument();
    expect(screen.getByText(mockRide.from_label)).toBeInTheDocument();
    expect(screen.getByText(mockRide.to_label)).toBeInTheDocument();
    expect(text).toContain("150");
    expect(text).toContain("2");
    expect(screen.getByText("Driver Test")).toBeInTheDocument();
    expect(screen.getByText(mockRide.comment ?? "")).toBeInTheDocument();
    expect(text).toContain("12.3");
    expect(text).toContain("38");
    expect(text).toContain("Ваша поездка");
    expect(text).toContain("По пути");
  });
});
