import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RideCard } from "../src/components/RideCard";
import type { Ride } from "../src/types/ride";

const mockRide: Ride = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  driver_id: "550e8400-e29b-41d4-a716-446655440001",
  from_label: "Long start address, building 5, Kazan, Republic of Tatarstan",
  from_lat: 55.7558,
  from_lng: 37.6173,
  to_label: "Long destination street, house 10, Kazan, Republic of Tatarstan",
  to_lat: 55.7963,
  to_lng: 49.1093,
  departure_at: new Date(Date.now() + 3600000).toISOString(),
  price_rub: 150,
  seats_total: 3,
  seats_taken: 1,
  status: "active",
  comment: "Extra private detail should stay on details screen",
  created_at: new Date().toISOString(),
  driver_display_name: "Driver Test",
  driver_tg_id: 123,
  driver_avg_stars: 4.7,
  driver_reviews_count: 12,
  driver_likes_received_count: 128,
};

describe("RideCard", () => {
  it("renders from_label and to_label", () => {
    render(<RideCard ride={mockRide} />);
    expect(screen.getByText(mockRide.from_label)).toBeInTheDocument();
    expect(screen.getByText(mockRide.to_label)).toBeInTheDocument();
  });

  it("renders departure time in HH:MM format", () => {
    render(<RideCard ride={mockRide} />);
    expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeInTheDocument();
  });

  it("renders price", () => {
    render(<RideCard ride={mockRide} />);
    expect(screen.getByText(/150/)).toBeInTheDocument();
  });

  it("renders free and total seats only in the right car chip in cozy mode", () => {
    render(<RideCard ride={mockRide} />);
    expect(screen.getByTestId("ride-card-seats-chip")).toHaveTextContent("2/3");
    expect(screen.queryByText(/2\s+мест/)).not.toBeInTheDocument();
  });

  it("renders zero price when price_rub is null", () => {
    render(<RideCard ride={{ ...mockRide, price_rub: null }} />);
    expect(screen.getByText("0 ₽")).toBeInTheDocument();
  });

  it("calls onClick when the card is clicked", () => {
    const onClick = vi.fn();
    render(<RideCard ride={mockRide} onClick={onClick} />);
    fireEvent.click(screen.getByTestId("ride-card"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(mockRide);
  });

  it("keeps extra ride detail off the feed card", () => {
    render(<RideCard ride={mockRide} isAlongTheWay />);
    expect(screen.queryByText(mockRide.comment ?? "")).not.toBeInTheDocument();
    expect(screen.queryByText("По пути")).not.toBeInTheDocument();
  });

  it("does not render favorite toggle", () => {
    render(<RideCard ride={mockRide} />);
    expect(screen.queryByTestId("fav-toggle")).not.toBeInTheDocument();
  });

  it("renders route labels in compact label columns", () => {
    render(<RideCard ride={mockRide} />);
    expect(screen.getByText("Откуда")).toBeInTheDocument();
    expect(screen.getByText("Куда")).toBeInTheDocument();
    expect(screen.getByTestId("ride-card-route-lines")).toHaveStyle({
      gridTemplateColumns: "14px 38px minmax(0, 1fr)",
      gridTemplateRows: "minmax(44px, auto) 18px minmax(44px, auto)",
    });
  });

  it("renders departure countdown in two compact lines", () => {
    const inTwoHours = new Date(Date.now() + 2 * 3600000 + 15 * 60000).toISOString();
    render(<RideCard ride={{ ...mockRide, departure_at: inTwoHours }} />);
    expect(screen.getByText("до отправления")).toBeInTheDocument();
    expect(screen.getByText(/2 ч 15 м/)).toBeInTheDocument();
  });

  it("marks urgent near departure time in red", () => {
    const in15Min = new Date(Date.now() + 15 * 60000).toISOString();
    render(<RideCard ride={{ ...mockRide, departure_at: in15Min }} />);
    expect(screen.getByTestId("ride-card-relative-time")).toHaveStyle({
      color: "var(--brand-danger)",
    });
    expect(screen.getByText("15 м")).toBeInTheDocument();
  });

  it("renders past departure label", () => {
    const past = new Date(Date.now() - 3600000).toISOString();
    render(<RideCard ride={{ ...mockRide, departure_at: past }} />);
    expect(screen.getByText("уже уехал")).toBeInTheDocument();
  });

  it("compact mode renders destination and price", () => {
    render(<RideCard ride={mockRide} density="compact" />);
    expect(screen.getByTitle(mockRide.to_label)).toBeInTheDocument();
    expect(screen.getByText(/150/)).toBeInTheDocument();
  });

  it("compact mode shows free seat count", () => {
    render(<RideCard ride={mockRide} density="compact" />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders route duration even without distance", () => {
    render(<RideCard ride={{ ...mockRide, route_duration_s: 35 * 60 }} />);
    expect(screen.getByText("~35 мин")).toBeInTheDocument();
  });

  it("keeps status state visual-only for own rides", () => {
    render(<RideCard ride={mockRide} cardState="own" />);
    expect(screen.queryByText("Ваша поездка")).not.toBeInTheDocument();
  });

  it("keeps status state visual-only for applied rides", () => {
    render(<RideCard ride={mockRide} cardState="applied" />);
    expect(screen.queryByText("Заявка подана")).not.toBeInTheDocument();
  });

  it("keeps status state visual-only for approved rides", () => {
    render(<RideCard ride={mockRide} cardState="approved" />);
    expect(screen.queryByText("Одобрено")).not.toBeInTheDocument();
  });

  it("applies stronger dimming only for viewed expanded cards", () => {
    const { rerender } = render(<RideCard ride={mockRide} cardState="viewed" />);
    const viewedGrid = screen.getByTestId("ride-card-expanded-grid");
    expect(viewedGrid).toHaveStyle({
      opacity: "0.68",
      filter: "saturate(0.76)",
    });
    expect(screen.getByText(mockRide.from_label)).toBeInTheDocument();
    expect(screen.getByText(mockRide.to_label)).toBeInTheDocument();
    expect(screen.getByText(/150/)).toBeInTheDocument();

    rerender(<RideCard ride={mockRide} cardState="own" />);
    const ownGrid = screen.getByTestId("ride-card-expanded-grid");
    expect(ownGrid).toHaveStyle({
      opacity: "1",
      filter: "none",
    });
  });

  it("cozy layout uses denser service columns and preserves primary ride data", () => {
    const richRide: Ride = {
      ...mockRide,
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
      gridTemplateColumns: "82px minmax(0, 1fr) 50px",
    });
    expect(screen.getByTestId("ride-card-route-body")).toBeInTheDocument();
    expect(screen.getByTestId("ride-card-side-meta")).toBeInTheDocument();
    expect(screen.getByTestId("ride-card-driver-meta")).toBeInTheDocument();
    expect(screen.queryByTestId("ride-card-chevron")).not.toBeInTheDocument();
    expect(screen.getByTestId("ride-card-from-dot")).toBeInTheDocument();
    expect(screen.getByTestId("ride-card-to-dot")).toBeInTheDocument();
    expect(screen.getByTestId("ride-card-seats-chip")).toHaveTextContent("2/3");
    expect(screen.getByTestId("ride-card-seats-chip")).toHaveStyle({
      fontSize: "12.5px",
      minHeight: "24px",
    });
    expect(screen.getByTestId("driver-rating")).toHaveTextContent("4.7");
    expect(screen.getByTestId("driver-likes")).toHaveTextContent("128");
    expect(screen.getByTestId("ride-card-route-metrics")).toHaveTextContent("12.3");
    expect(screen.getByTestId("ride-card-from-address")).toHaveStyle({
      WebkitLineClamp: "3",
      fontSize: "12.5px",
      fontWeight: "650",
    });
    expect(screen.getByTestId("ride-card-to-address")).toHaveStyle({
      WebkitLineClamp: "3",
      fontSize: "12.5px",
      fontWeight: "650",
    });
    expect(screen.getByText(mockRide.from_label)).toBeInTheDocument();
    expect(screen.getByText(mockRide.to_label)).toBeInTheDocument();
    expect(screen.getByText("Driver Test")).toBeInTheDocument();
    expect(text).toContain("150");
    expect(text).toContain("12.3");
    expect(text).toContain("38");
    expect(text).not.toContain("По пути");
    expect(text).not.toContain(mockRide.comment ?? "");
    expect(text).not.toContain("Ваша поездка");
    expect(text).not.toContain("мест");
  });
});
