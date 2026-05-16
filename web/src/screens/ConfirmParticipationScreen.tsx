import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, apiFetch } from "../lib/api";

type State = "idle" | "loading" | "done" | "already_confirmed" | "error";

export function ConfirmParticipationScreen() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<State>("idle");

  async function handleConfirm() {
    setState("loading");
    try {
      await apiFetch(`/rides/${id}/confirm-participation`, { method: "POST" });
      setState("done");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setState("already_confirmed");
      } else {
        setState("error");
      }
    }
  }

  return (
    <div
      data-testid="confirm-screen"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--brand-bg)",
        padding: 24,
      }}
    >
      {state === "already_confirmed" ? (
        <div
          data-testid="already-confirmed-msg"
          style={{ textAlign: "center", fontSize: 16, color: "var(--brand-sub)" }}
        >
          Вы уже подтвердили участие в этой поездке.
        </div>
      ) : state === "error" ? (
        <div style={{ textAlign: "center", fontSize: 15, color: "var(--brand-danger)" }}>
          Ошибка. Попробуйте ещё раз.
        </div>
      ) : (
        <>
          <div
            style={{
              fontSize: 48,
              marginBottom: 16,
            }}
          >
            🚗
          </div>
          <h1
            style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px", color: "var(--brand-text)" }}
          >
            Подтверждение участия
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--brand-sub)",
              textAlign: "center",
              marginBottom: 32,
            }}
          >
            Подтвердите, что вы участвовали в этой поездке.
          </p>
          <button
            type="button"
            data-testid="confirm-btn"
            disabled={state === "loading"}
            onClick={handleConfirm}
            style={{
              width: "100%",
              maxWidth: 320,
              background:
                state === "loading" ? "var(--brand-primary-soft)" : "var(--brand-primary)",
              color: "var(--brand-primary-ink)",
              border: "none",
              borderRadius: 14,
              padding: "15px 0",
              fontSize: 16,
              fontWeight: 600,
              cursor: state === "loading" ? "not-allowed" : "pointer",
            }}
          >
            {state === "loading" ? "Подтверждаем..." : "Подтвердить участие"}
          </button>
        </>
      )}

      {state === "done" && (
        <div
          data-testid="thank-you-modal"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: "var(--brand-surface)",
              borderRadius: 20,
              padding: "28px 24px",
              width: "100%",
              maxWidth: 340,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <h2
              style={{
                fontSize: 19,
                fontWeight: 700,
                margin: "0 0 8px",
                color: "var(--brand-text)",
              }}
            >
              Спасибо!
            </h2>
            <p style={{ fontSize: 14, color: "var(--brand-sub)", marginBottom: 24 }}>
              Хотите оставить лайк или отзыв водителю?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                data-testid="leave-review-btn"
                onClick={() => navigate(`/rides/${id}`)}
                style={{
                  background: "var(--brand-primary)",
                  color: "var(--brand-primary-ink)",
                  border: "none",
                  borderRadius: 12,
                  padding: "13px 0",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Оставить отзыв
              </button>
              <button
                type="button"
                data-testid="skip-review-btn"
                onClick={() => navigate("/")}
                style={{
                  background: "none",
                  border: "1px solid var(--brand-line)",
                  borderRadius: 12,
                  padding: "13px 0",
                  fontSize: 15,
                  cursor: "pointer",
                  color: "var(--brand-sub)",
                }}
              >
                Позже
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
