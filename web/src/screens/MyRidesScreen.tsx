import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RideCard } from "../components/RideCard";
import { type MyRidesRole, type MyRidesWhen, useMyRides } from "../hooks/useMyRides";
import { useRolePreference } from "../hooks/useRolePreference";
import type { Ride } from "../types/ride";

export function MyRidesScreen() {
  const navigate = useNavigate();
  const { role: userRole } = useRolePreference();
  const initialRole: MyRidesRole = userRole === "driver" ? "driver" : "passenger";
  const [role, setRole] = useState<MyRidesRole>(initialRole);
  const [when, setWhen] = useState<MyRidesWhen>("future");
  const { data, isLoading, isError } = useMyRides(role, when);

  const handleClick = (ride: Ride) => {
    navigate(`/rides/${ride.id}`);
  };

  return (
    <div
      data-testid="my-rides-screen"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--brand-bg)",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--brand-surface)",
          borderBottom: "1px solid var(--brand-line)",
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          minHeight: 56,
        }}
      >
        <button
          type="button"
          data-testid="back-btn"
          aria-label="Назад"
          onClick={() => navigate(-1)}
          style={{
            background: "var(--brand-surface-2)",
            border: "none",
            width: 36,
            height: 36,
            borderRadius: 12,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--brand-text)",
            flexShrink: 0,
          }}
        >
          ←
        </button>
        <div className="pp-h2" style={{ flex: 1, minWidth: 0 }}>
          Мои поездки
        </div>
      </div>

      {/* Role segment */}
      <div
        role="tablist"
        aria-label="Роль"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          padding: "12px 16px 8px",
        }}
      >
        {(["driver", "passenger"] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={role === r}
            data-testid={`role-${r}`}
            onClick={() => setRole(r)}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              border: "none",
              background: role === r ? "var(--brand-primary)" : "var(--brand-surface)",
              color: role === r ? "var(--brand-primary-ink)" : "var(--brand-text)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: role === r ? "none" : "var(--shadow-sm)",
            }}
          >
            {r === "driver" ? "Я водитель" : "Я пассажир"}
          </button>
        ))}
      </div>

      {/* When segment */}
      <div
        role="tablist"
        aria-label="Время"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          padding: "0 16px 12px",
        }}
      >
        {(["future", "past"] as const).map((w) => (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={when === w}
            data-testid={`when-${w}`}
            onClick={() => setWhen(w)}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: "none",
              background: when === w ? "var(--brand-primary-soft)" : "transparent",
              color: when === w ? "var(--brand-primary)" : "var(--brand-sub)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {w === "future" ? "Будущие" : "Прошлые"}
          </button>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          padding: "4px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {isLoading && <p style={{ color: "var(--brand-sub)", fontSize: 14 }}>Загрузка...</p>}
        {isError && (
          <p style={{ color: "var(--brand-danger)", fontSize: 14 }} data-testid="my-rides-error">
            Не удалось загрузить поездки
          </p>
        )}
        {!isLoading && !isError && (data?.rides ?? []).length === 0 && (
          <div
            data-testid="my-rides-empty"
            style={{
              padding: "24px 16px",
              textAlign: "center",
              color: "var(--brand-sub)",
              fontSize: 14,
            }}
          >
            {when === "future" ? "Нет предстоящих поездок" : "Нет завершённых поездок"}
          </div>
        )}
        {(data?.rides ?? []).map((ride) => (
          <RideCard key={ride.id} ride={ride} onClick={handleClick} />
        ))}
      </div>
    </div>
  );
}
