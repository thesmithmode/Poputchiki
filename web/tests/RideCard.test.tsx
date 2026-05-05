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

  it("отображает 'Бесплатно' при price_rub = null", () => {
    render(<RideCard ride={{ ...mockRide, price_rub: null }} />);
    expect(screen.getByText(/Бесплатно/i)).toBeInTheDocument();
  });

  it("вызывает onClick при клике на карточку", () => {
    const onClick = vi.fn();
    render(<RideCard ride={mockRide} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
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
});
