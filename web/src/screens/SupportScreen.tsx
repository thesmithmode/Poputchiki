import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

interface SupportTicket {
  id: string;
  text: string;
  status: "open" | "resolved";
  reply_text: string | null;
  replied_at: string | null;
  created_at: string;
}

export function SupportScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [newText, setNewText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["support-tickets"],
    queryFn: () => apiFetch<SupportTicket[]>("/support/messages/me"),
    staleTime: 30_000,
  });

  async function handleSubmit() {
    if (!newText.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch("/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newText.trim() }),
      });
      setNewText("");
      setShowForm(false);
      await qc.invalidateQueries({ queryKey: ["support-tickets"] });
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div
        data-testid="support-loading"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <p style={{ fontSize: 14, color: "var(--brand-sub)" }}>Загрузка...</p>
      </div>
    );
  }

  return (
    <div
      data-testid="support-screen"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--brand-bg)",
      }}
    >
      <header
        style={{
          background: "var(--brand-surface)",
          borderBottom: "1px solid var(--brand-line)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            background: "none",
            border: "none",
            fontSize: 20,
            cursor: "pointer",
            padding: 4,
            color: "var(--brand-text)",
          }}
          aria-label="Назад"
        >
          ←
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--brand-text)", margin: 0 }}>
          Поддержка
        </h1>
      </header>

      <div style={{ padding: 16, flex: 1 }}>
        <button
          type="button"
          data-testid="new-ticket-btn"
          onClick={() => setShowForm(true)}
          style={{
            width: "100%",
            background: "var(--brand-primary)",
            color: "var(--brand-primary-ink)",
            border: "none",
            borderRadius: 12,
            padding: "13px 0",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: 16,
          }}
        >
          Написать в поддержку
        </button>

        {showForm && (
          <div
            data-testid="new-ticket-form"
            style={{
              background: "var(--brand-surface)",
              borderRadius: 12,
              padding: 16,
              border: "1px solid var(--brand-line)",
              marginBottom: 16,
            }}
          >
            <textarea
              data-testid="ticket-text"
              maxLength={2000}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Опишите проблему..."
              style={{
                width: "100%",
                minHeight: 100,
                borderRadius: 8,
                border: "1px solid var(--brand-line)",
                background: "var(--brand-surface-2)",
                color: "var(--brand-text)",
                padding: "8px 10px",
                fontSize: 14,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                type="button"
                data-testid="ticket-submit"
                disabled={!newText.trim() || submitting}
                onClick={handleSubmit}
                style={{
                  flex: 1,
                  background: newText.trim() ? "var(--brand-primary)" : "var(--brand-inset)",
                  color: newText.trim() ? "var(--brand-primary-ink)" : "var(--brand-sub)",
                  border: "none",
                  borderRadius: 10,
                  padding: "11px 0",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: newText.trim() ? "pointer" : "not-allowed",
                }}
              >
                {submitting ? "Отправляем..." : "Отправить"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setNewText("");
                }}
                style={{
                  padding: "11px 16px",
                  background: "none",
                  border: "1px solid var(--brand-line)",
                  borderRadius: 10,
                  fontSize: 14,
                  cursor: "pointer",
                  color: "var(--brand-sub)",
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {!tickets || tickets.length === 0 ? (
          <div
            data-testid="support-empty"
            style={{
              textAlign: "center",
              padding: "48px 0",
              color: "var(--brand-sub)",
              fontSize: 14,
            }}
          >
            Нет обращений
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {tickets.map((t) => (
              <div
                key={t.id}
                data-testid={`ticket-${t.id}`}
                style={{
                  background: "var(--brand-surface)",
                  borderRadius: 12,
                  padding: "12px 16px",
                  border: "1px solid var(--brand-line)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "var(--brand-sub)" }}>
                    {new Date(t.created_at).toLocaleDateString("ru-RU")}
                  </span>
                  <span
                    data-testid={`ticket-status-${t.id}`}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: t.status === "resolved" ? "var(--brand-primary)" : "var(--brand-warn)",
                    }}
                  >
                    {t.status}
                  </span>
                </div>
                <p style={{ fontSize: 14, color: "var(--brand-text)", margin: "0 0 6px" }}>
                  {t.text}
                </p>
                {t.reply_text && (
                  <div
                    style={{
                      background: "var(--brand-primary-tint)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontSize: 13,
                      color: "var(--brand-primary)",
                      borderLeft: "3px solid var(--brand-primary)",
                    }}
                  >
                    {t.reply_text}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
