import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMe } from "../hooks/useMe";
import { apiFetch } from "../lib/api";

interface SupportTicket {
  id: string;
  user_id: string;
  text: string;
  status: "open" | "resolved";
  reply_text: string | null;
  created_at: string;
}

interface Complaint {
  id: string;
  reporter_id: string;
  target_id: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
}

type Tab = "tickets" | "complaints";

export function AdminScreen() {
  const navigate = useNavigate();
  const me = useMe();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("tickets");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = me.status === "ok" && me.user.role === "admin";

  const { data: tickets, isLoading: ticketsLoading } = useQuery({
    queryKey: ["admin-tickets"],
    queryFn: () => apiFetch<SupportTicket[]>("/admin/support/messages?status=open"),
    enabled: isAdmin,
  });

  const { data: complaints, isLoading: complaintsLoading } = useQuery({
    queryKey: ["admin-complaints"],
    queryFn: () => apiFetch<Complaint[]>("/admin/complaints?status=open"),
    enabled: isAdmin,
  });

  if (me.status === "loading") {
    return (
      <div
        data-testid="admin-loading"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <p style={{ color: "var(--brand-sub)", fontSize: 14 }}>Загрузка...</p>
      </div>
    );
  }

  if (me.status !== "ok" || me.user.role !== "admin") {
    return (
      <div
        data-testid="admin-forbidden"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <p style={{ color: "var(--brand-danger)", fontSize: 15 }}>Доступ запрещён</p>
      </div>
    );
  }

  if (ticketsLoading || complaintsLoading) {
    return (
      <div
        data-testid="admin-loading"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <p style={{ color: "var(--brand-sub)", fontSize: 14 }}>Загрузка...</p>
      </div>
    );
  }

  async function submitReply(ticketId: string) {
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch(`/admin/support/messages/${ticketId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply_text: replyText.trim() }),
      });
      setReplyingTo(null);
      setReplyText("");
      await qc.invalidateQueries({ queryKey: ["admin-tickets"] });
    } finally {
      setSubmitting(false);
    }
  }

  async function resolveComplaint(complaintId: string) {
    await apiFetch(`/admin/complaints/${complaintId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    await qc.invalidateQueries({ queryKey: ["admin-complaints"] });
  }

  return (
    <div
      data-testid="admin-screen"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "#f8f9fa",
      }}
    >
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
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
          Панель администратора
        </h1>
      </header>

      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", background: "#fff" }}>
        <button
          type="button"
          data-testid="tab-tickets"
          onClick={() => setTab("tickets")}
          style={{
            flex: 1,
            padding: "12px 0",
            background: "none",
            border: "none",
            fontSize: 14,
            fontWeight: tab === "tickets" ? 700 : 400,
            color: tab === "tickets" ? "#2563eb" : "#7c8694",
            borderBottom: tab === "tickets" ? "2px solid #2563eb" : "2px solid transparent",
            cursor: "pointer",
          }}
        >
          Тикеты ({tickets?.length ?? 0})
        </button>
        <button
          type="button"
          data-testid="tab-complaints"
          onClick={() => setTab("complaints")}
          style={{
            flex: 1,
            padding: "12px 0",
            background: "none",
            border: "none",
            fontSize: 14,
            fontWeight: tab === "complaints" ? 700 : 400,
            color: tab === "complaints" ? "#2563eb" : "#7c8694",
            borderBottom: tab === "complaints" ? "2px solid #2563eb" : "2px solid transparent",
            cursor: "pointer",
          }}
        >
          Жалобы ({complaints?.length ?? 0})
        </button>
      </div>

      <div style={{ padding: 16, flex: 1 }}>
        {tab === "tickets" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {!tickets || tickets.length === 0 ? (
              <p
                style={{
                  textAlign: "center",
                  color: "var(--brand-sub)",
                  fontSize: 14,
                  padding: "32px 0",
                }}
              >
                Нет открытых тикетов
              </p>
            ) : (
              tickets.map((t) => (
                <div
                  key={t.id}
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: "12px 16px",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <p style={{ fontSize: 14, margin: "0 0 8px", color: "var(--brand-text)" }}>
                    {t.text}
                  </p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--brand-sub)" }}>
                      {new Date(t.created_at).toLocaleDateString("ru-RU")}
                    </span>
                    <button
                      type="button"
                      data-testid={`reply-btn-${t.id}`}
                      onClick={() => {
                        setReplyingTo(t.id);
                        setReplyText("");
                      }}
                      style={{
                        marginLeft: "auto",
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "6px 12px",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Ответить
                    </button>
                  </div>

                  {replyingTo === t.id && (
                    <div data-testid="reply-form" style={{ marginTop: 10 }}>
                      <textarea
                        data-testid="reply-text"
                        maxLength={2000}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Ответ..."
                        style={{
                          width: "100%",
                          minHeight: 80,
                          borderRadius: 8,
                          border: "1px solid #d1d5db",
                          padding: "8px 10px",
                          fontSize: 13,
                          resize: "vertical",
                          boxSizing: "border-box",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          data-testid="reply-submit"
                          disabled={!replyText.trim() || submitting}
                          onClick={() => submitReply(t.id)}
                          style={{
                            background: "#2563eb",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            padding: "8px 16px",
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          Отправить
                        </button>
                        <button
                          type="button"
                          onClick={() => setReplyingTo(null)}
                          style={{
                            background: "none",
                            border: "1px solid #d1d5db",
                            borderRadius: 8,
                            padding: "8px 12px",
                            fontSize: 13,
                            cursor: "pointer",
                            color: "var(--brand-sub)",
                          }}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "complaints" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {!complaints || complaints.length === 0 ? (
              <p
                style={{
                  textAlign: "center",
                  color: "var(--brand-sub)",
                  fontSize: 14,
                  padding: "32px 0",
                }}
              >
                Нет открытых жалоб
              </p>
            ) : (
              complaints.map((c) => (
                <div
                  key={c.id}
                  data-testid={`complaint-${c.id}`}
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: "12px 16px",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <p style={{ fontSize: 14, margin: "0 0 8px", color: "var(--brand-text)" }}>
                    {c.reason}
                  </p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--brand-sub)" }}>
                      {new Date(c.created_at).toLocaleDateString("ru-RU")}
                    </span>
                    <button
                      type="button"
                      data-testid={`resolve-${c.id}`}
                      onClick={() => resolveComplaint(c.id)}
                      style={{
                        marginLeft: "auto",
                        background: "#16a34a",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "6px 12px",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      Закрыть
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
