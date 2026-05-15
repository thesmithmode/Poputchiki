import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";

interface MeFull {
  id: string;
  display_name: string;
  phone?: string | null;
  apt_number?: string | null;
}

export function EditProfileScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [aptNumber, setAptNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<MeFull>("/users/me")
      .then((u) => {
        if (cancelled) return;
        setDisplayName(u.display_name ?? "");
        setPhone(u.phone ?? "");
        setAptNumber(u.apt_number ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Не удалось загрузить профиль");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    if (displayName.trim().length < 1) {
      setError("Имя не может быть пустым");
      return;
    }
    setSubmitting(true);
    setError(null);
    setOk(false);
    try {
      await apiFetch("/users/me", {
        method: "PATCH",
        body: JSON.stringify({
          display_name: displayName.trim(),
          phone: phone.trim() || undefined,
          apt_number: aptNumber.trim() || undefined,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      setOk(true);
    } catch {
      setError("Не удалось сохранить");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="edit-profile-screen"
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
            color: "var(--brand-text)",
            flexShrink: 0,
          }}
        >
          ←
        </button>
        <div className="pp-h2" style={{ flex: 1, minWidth: 0 }}>
          Редактирование профиля
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 24, color: "var(--brand-sub)" }}>Загрузка...</div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: 16,
          }}
        >
          <Field label="Имя">
            <input
              data-testid="input-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Например, Алексей"
              maxLength={50}
              style={inputStyle}
            />
          </Field>

          <Field label="Телефон">
            <input
              data-testid="input-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 999 123-45-67"
              maxLength={20}
              style={inputStyle}
            />
          </Field>

          <Field label="Квартира">
            <input
              data-testid="input-apt"
              type="text"
              value={aptNumber}
              onChange={(e) => setAptNumber(e.target.value)}
              placeholder="Дом 5, кв. 123"
              maxLength={50}
              style={inputStyle}
            />
          </Field>

          {error && (
            <div
              data-testid="form-error"
              style={{
                padding: "10px 14px",
                background: "var(--brand-danger-soft)",
                border: "1px solid var(--brand-danger)",
                borderRadius: 10,
                color: "var(--brand-danger)",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {ok && (
            <div
              data-testid="form-success"
              style={{
                padding: "10px 14px",
                background: "var(--brand-primary-soft)",
                border: "1px solid var(--brand-primary)",
                borderRadius: 10,
                color: "var(--brand-primary)",
                fontSize: 13,
              }}
            >
              Сохранено
            </div>
          )}

          <button
            type="submit"
            data-testid="submit-btn"
            disabled={submitting}
            style={{
              marginTop: 8,
              padding: "12px 24px",
              background: "var(--brand-primary)",
              color: "var(--brand-primary-ink)",
              border: "none",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Сохранение..." : "Сохранить"}
          </button>
        </form>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  background: "var(--brand-surface)",
  border: "1px solid var(--brand-line)",
  borderRadius: 12,
  color: "var(--brand-text)",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="pp-eyebrow" style={{ marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
