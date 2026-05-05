import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { getTelegramWebApp } from "../lib/telegram";

interface FormState {
  from_label: string;
  to_label: string;
  date: string;
  time: string;
  price_free: boolean;
  price_rub: string;
  seats_total: number;
  comment: string;
  is_recurring: boolean;
  weekdays: number[];
  active_from: string;
  active_to: string;
}

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimePlus(minutes: number) {
  const d = new Date(Date.now() + minutes * 60000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function CreateRideScreen() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>({
    from_label: "",
    to_label: "",
    date: todayStr(),
    time: nowTimePlus(60),
    price_free: false,
    price_rub: "",
    seats_total: 3,
    comment: "",
    is_recurring: false,
    weekdays: [],
    active_from: todayStr(),
    active_to: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitRef = useRef<() => void>(() => {});

  function validate(): string | null {
    if (!form.from_label.trim()) return "Укажите откуда";
    if (!form.to_label.trim()) return "Укажите куда";
    if (!form.date || !form.time) return "Укажите дату и время";
    const departure = new Date(`${form.date}T${form.time}`);
    if (Number.isNaN(departure.getTime())) return "Неверная дата";
    if (departure <= new Date()) return "Дата должна быть в будущем";
    if (!form.price_free && form.price_rub !== "" && Number(form.price_rub) <= 0) {
      return "Цена должна быть больше 0";
    }
    if (form.seats_total < 1 || form.seats_total > 4) return "Мест: 1–4";
    if (form.comment.length > 200) return "Комментарий: не более 200 символов";
    if (form.is_recurring && form.weekdays.length === 0) return "Выберите дни недели";
    return null;
  }

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const departure_at = new Date(`${form.date}T${form.time}`).toISOString();
      const price_rub = form.price_free
        ? null
        : form.price_rub === ""
          ? null
          : Number(form.price_rub);

      await apiFetch("/rides", {
        method: "POST",
        body: JSON.stringify({
          from_label: form.from_label.trim(),
          from_lat: 55.75,
          from_lng: 37.61,
          to_label: form.to_label.trim(),
          to_lat: 55.8,
          to_lng: 37.65,
          departure_at,
          price_rub,
          seats_total: form.seats_total,
          comment: form.comment.trim() || null,
        }),
      });
      navigate("/");
    } catch {
      setError("Не удалось создать поездку. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  };

  submitRef.current = handleSubmit;

  useEffect(() => {
    const wa = getTelegramWebApp();
    if (!wa) return;
    const twa = wa as unknown as {
      MainButton?: {
        text: string;
        show: () => void;
        hide: () => void;
        onClick: (cb: () => void) => void;
        offClick: (cb: () => void) => void;
        showProgress: (leaveActive: boolean) => void;
        hideProgress: () => void;
      };
    };
    if (!twa.MainButton) return;
    twa.MainButton.text = "Создать поездку";
    twa.MainButton.show();
    const cb = () => submitRef.current();
    twa.MainButton.onClick(cb);
    return () => {
      twa.MainButton?.offClick(cb);
      twa.MainButton?.hide();
    };
  }, []);

  function toggleWeekday(d: number) {
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d],
    }));
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "#f8f9fa",
      }}
    >
      {/* Header */}
      <div
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
            color: "#333",
          }}
          aria-label="Назад"
        >
          ←
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "#15191f", margin: 0, flex: 1 }}>
          Новая поездка
        </h1>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 120px" }}>
        {error && (
          <div
            data-testid="form-error"
            style={{
              background: "#fef2f2",
              border: "1px solid #fca5a5",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 12,
              fontSize: 14,
              color: "#dc2626",
            }}
          >
            {error}
          </div>
        )}

        <Section title="Маршрут">
          <Field label="Откуда">
            <input
              data-testid="input-from"
              value={form.from_label}
              onChange={(e) => setForm((f) => ({ ...f, from_label: e.target.value }))}
              placeholder="Адрес отправления"
              style={inputStyle}
            />
          </Field>
          <Field label="Куда">
            <input
              data-testid="input-to"
              value={form.to_label}
              onChange={(e) => setForm((f) => ({ ...f, to_label: e.target.value }))}
              placeholder="Адрес назначения"
              style={inputStyle}
            />
          </Field>
        </Section>

        <Section title="Дата и время">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Дата">
              <input
                data-testid="input-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                style={inputStyle}
              />
            </Field>
            <Field label="Время">
              <input
                data-testid="input-time"
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                style={inputStyle}
              />
            </Field>
          </div>
        </Section>

        <Section title="Детали">
          <Field label="Мест (1–4)">
            <div style={{ display: "flex", gap: 8 }}>
              {([1, 2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  data-testid={`seats-${n}`}
                  onClick={() => setForm((f) => ({ ...f, seats_total: n }))}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 8,
                    border: "1px solid",
                    borderColor: form.seats_total === n ? "#0ea5e9" : "#e5e7eb",
                    background: form.seats_total === n ? "#e0f2fe" : "#fff",
                    color: form.seats_total === n ? "#0369a1" : "#374151",
                    fontWeight: 600,
                    fontSize: 15,
                    cursor: "pointer",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Цена">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
                fontSize: 14,
                color: "#374151",
              }}
            >
              <input
                data-testid="price-free-checkbox"
                type="checkbox"
                checked={form.price_free}
                onChange={(e) =>
                  setForm((f) => ({ ...f, price_free: e.target.checked, price_rub: "" }))
                }
              />
              Договорная (бесплатно)
            </label>
            {!form.price_free && (
              <input
                data-testid="input-price"
                type="number"
                min="1"
                value={form.price_rub}
                onChange={(e) => setForm((f) => ({ ...f, price_rub: e.target.value }))}
                placeholder="Цена в рублях"
                style={inputStyle}
              />
            )}
          </Field>

          <Field label={`Комментарий (${form.comment.length}/200)`}>
            <textarea
              data-testid="input-comment"
              value={form.comment}
              onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
              placeholder="Дополнительная информация..."
              maxLength={200}
              rows={3}
              style={{ ...inputStyle, resize: "none" }}
            />
          </Field>
        </Section>

        <Section title="">
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 15,
              fontWeight: 600,
              color: "#15191f",
              cursor: "pointer",
            }}
          >
            <input
              data-testid="recurring-checkbox"
              type="checkbox"
              checked={form.is_recurring}
              onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))}
              style={{ width: 18, height: 18 }}
            />
            Регулярная поездка
          </label>

          {form.is_recurring && (
            <div data-testid="recurring-fields" style={{ marginTop: 16 }}>
              <Field label="Дни недели">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {WEEKDAY_LABELS.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      data-testid={`weekday-${i}`}
                      onClick={() => toggleWeekday(i)}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 8,
                        border: "1px solid",
                        borderColor: form.weekdays.includes(i) ? "#0ea5e9" : "#e5e7eb",
                        background: form.weekdays.includes(i) ? "#e0f2fe" : "#fff",
                        color: form.weekdays.includes(i) ? "#0369a1" : "#374151",
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
              <div
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}
              >
                <Field label="Действует с">
                  <input
                    data-testid="input-active-from"
                    type="date"
                    value={form.active_from}
                    onChange={(e) => setForm((f) => ({ ...f, active_from: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
                <Field label="До (необяз.)">
                  <input
                    data-testid="input-active-to"
                    type="date"
                    value={form.active_to}
                    onChange={(e) => setForm((f) => ({ ...f, active_to: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* Bottom fallback button (non-TG environment) */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 16px",
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid #e5e7eb",
          zIndex: 30,
        }}
      >
        <button
          type="button"
          data-testid="submit-btn"
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: "100%",
            padding: "14px",
            background: submitting ? "#93c5fd" : "#0ea5e9",
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            color: "#fff",
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Создаём..." : "Создать поездку"}
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  fontSize: 14,
  color: "#15191f",
  background: "#fff",
  boxSizing: "border-box",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        border: "1px solid #e5e7eb",
      }}
    >
      {title ? (
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#7c8694",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: 12,
          }}
        >
          {title}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#7c8694", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
