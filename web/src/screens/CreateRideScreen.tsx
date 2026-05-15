import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AddressAutocomplete, type Coords } from "../components/AddressAutocomplete";
import { useTelegramBack } from "../hooks/useTelegramBack";
import { useTelegramHaptic } from "../hooks/useTelegramHaptic";
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

type Step = 1 | 2 | 3;

export function CreateRideScreen() {
  const navigate = useNavigate();
  useTelegramBack(() => navigate(-1));
  const { notification } = useTelegramHaptic();
  const [step, setStep] = useState<Step>(1);
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
  const [hasMainButton, setHasMainButton] = useState(false);
  const [fromCoords, setFromCoords] = useState<Coords | null>(null);
  const [toCoords, setToCoords] = useState<Coords | null>(null);
  const submitRef = useRef<() => void>(() => {});
  // Idempotency guard для POST /rides: MainButton.text обновляется в useEffect[step]
  // асинхронно, есть окно ~10мс где text="Далее", но submitRef.current=handleSubmit.
  // Двойной клик в этом окне без guard'а создаст две поездки.
  const submittingRef = useRef(false);

  function validateStep1(): string | null {
    if (!form.from_label.trim()) return "Укажите откуда";
    if (!form.to_label.trim()) return "Укажите куда";
    return null;
  }

  function validateStep2(): string | null {
    if (!form.date || !form.time) return "Укажите дату и время";
    const departure = new Date(`${form.date}T${form.time}`);
    if (Number.isNaN(departure.getTime())) return "Неверная дата";
    if (departure <= new Date()) return "Дата должна быть в будущем";
    return null;
  }

  function validateStep3(): string | null {
    if (!form.price_free && form.price_rub !== "" && Number(form.price_rub) <= 0) {
      return "Цена должна быть больше 0";
    }
    if (form.seats_total < 1 || form.seats_total > 4) return "Мест: 1–4";
    if (form.comment.length > 200) return "Комментарий: не более 200 символов";
    if (form.is_recurring && form.weekdays.length === 0) return "Выберите дни недели";
    return null;
  }

  function validateAll(): string | null {
    return validateStep1() ?? validateStep2() ?? validateStep3();
  }

  const handleNext = () => {
    const err = step === 1 ? validateStep1() : step === 2 ? validateStep2() : null;
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    // setStep clamps to <3, повторный synchronous click безопасен (max до step 3).
    setStep((s) => (s < 3 ? ((s + 1) as Step) : s));
  };

  const handleBack = () => {
    setError(null);
    if (step > 1) setStep((s) => (s - 1) as Step);
    else navigate(-1);
  };

  const handleSubmit = async () => {
    // Guard от двойного клика: step !== 3 → MainButton ещё не переключился, отбрасываем.
    // submittingRef блокирует повторный submit пока fetch in-flight.
    if (step !== 3 || submittingRef.current) return;
    submittingRef.current = true;
    const err = validateAll();
    if (err) {
      submittingRef.current = false;
      setError(err);
      return;
    }
    setError(null);
    setSubmitting(true);

    const wa = getTelegramWebApp() as unknown as {
      MainButton?: { showProgress: (l: boolean) => void; hideProgress: () => void };
    } | null;
    wa?.MainButton?.showProgress(false);

    try {
      type GeoResult = { lat: string; lon: string };
      const geocode = async (label: string): Promise<Coords | null> => {
        try {
          const trimmed = label.trim();
          const q = /казань|татарстан/i.test(trimmed) ? trimmed : `${trimmed}, Казань`;
          const results = await apiFetch<GeoResult[]>(`/geocode/search?q=${encodeURIComponent(q)}`);
          if (!Array.isArray(results) || results.length === 0) return null;
          const first = results[0];
          if (!first) return null;
          const lat = Number.parseFloat(first.lat);
          const lng = Number.parseFloat(first.lon);
          if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
          return { lat, lng };
        } catch {
          return null;
        }
      };

      const [resolvedFrom, resolvedTo] = await Promise.all([
        fromCoords ?? geocode(form.from_label.trim()),
        toCoords ?? geocode(form.to_label.trim()),
      ]);

      if (!resolvedFrom || !resolvedTo) {
        setError(
          "Не удалось найти адрес. Выберите подсказку из списка или уточните название — например: «ТЦ Кольцо, Казань»",
        );
        return;
      }

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
          from_lat: resolvedFrom.lat,
          from_lng: resolvedFrom.lng,
          to_label: form.to_label.trim(),
          to_lat: resolvedTo.lat,
          to_lng: resolvedTo.lng,
          departure_at,
          price_rub,
          seats_total: form.seats_total,
          comment: form.comment.trim() || null,
        }),
      });
      notification("success");
      navigate("/");
    } catch {
      notification("error");
      setError("Не удалось создать поездку. Попробуйте ещё раз.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      wa?.MainButton?.hideProgress();
    }
  };

  submitRef.current = step === 3 ? handleSubmit : handleNext;

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
    twa.MainButton.text = step === 3 ? "Создать поездку" : "Далее";
    twa.MainButton.show();
    setHasMainButton(true);
    const cb = () => submitRef.current();
    twa.MainButton.onClick(cb);
    return () => {
      twa.MainButton?.offClick(cb);
      twa.MainButton?.hide();
      setHasMainButton(false);
    };
  }, [step]);

  function toggleWeekday(d: number) {
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d],
    }));
  }

  const stepTitle = step === 1 ? "Маршрут" : step === 2 ? "Дата и время" : "Детали";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--brand-bg)",
        color: "var(--brand-text)",
      }}
    >
      <div
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
          data-testid="back-btn"
          onClick={handleBack}
          aria-label="Назад"
          style={{
            background: "none",
            border: "none",
            fontSize: 20,
            cursor: "pointer",
            padding: 4,
            color: "var(--brand-text)",
          }}
        >
          ←
        </button>
        <h1
          style={{ fontSize: 18, fontWeight: 600, color: "var(--brand-text)", margin: 0, flex: 1 }}
        >
          Новая поездка
        </h1>
        <div className="pp-caption" data-testid="step-indicator">
          Шаг {step}/3
        </div>
      </div>

      {/* Progress bar */}
      <div
        data-testid="progress-bar"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 6,
          padding: "10px 16px 6px",
          background: "var(--brand-surface)",
          borderBottom: "1px solid var(--brand-line-soft)",
        }}
      >
        {([1, 2, 3] as const).map((s) => (
          <div
            key={s}
            data-testid={`progress-${s}`}
            style={{
              height: 4,
              borderRadius: 4,
              background: s <= step ? "var(--brand-primary)" : "var(--brand-line)",
              transition: "background 0.2s",
            }}
          />
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 120px" }}>
        <div className="pp-eyebrow" style={{ marginBottom: 10 }}>
          {stepTitle}
        </div>

        {error && (
          <div
            data-testid="form-error"
            style={{
              background: "var(--brand-danger-soft)",
              border: "1px solid var(--brand-danger)",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 12,
              fontSize: 14,
              color: "var(--brand-danger)",
            }}
          >
            {error}
          </div>
        )}

        {step === 1 && (
          <Section>
            <Field label="Откуда">
              <AddressAutocomplete
                testId="input-from"
                value={form.from_label}
                onChange={(v, coords) => {
                  setForm((f) => ({ ...f, from_label: v }));
                  setFromCoords(coords ?? null);
                }}
                placeholder="Адрес отправления"
                inputStyle={inputStyle}
              />
            </Field>
            <Field label="Куда">
              <AddressAutocomplete
                testId="input-to"
                value={form.to_label}
                onChange={(v, coords) => {
                  setForm((f) => ({ ...f, to_label: v }));
                  setToCoords(coords ?? null);
                }}
                placeholder="Адрес назначения"
                inputStyle={inputStyle}
              />
            </Field>
          </Section>
        )}

        {step === 2 && (
          <Section>
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
        )}

        {step === 3 && (
          <>
            <Section>
              <Field label="Мест (1–4)">
                <div style={{ display: "flex", gap: 8 }}>
                  {([1, 2, 3, 4] as const).map((n) => {
                    const active = form.seats_total === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        data-testid={`seats-${n}`}
                        aria-pressed={active}
                        onClick={() => setForm((f) => ({ ...f, seats_total: n }))}
                        style={{
                          flex: 1,
                          padding: "10px 0",
                          borderRadius: 8,
                          border: "1px solid",
                          borderColor: active ? "var(--brand-primary)" : "var(--brand-line)",
                          background: active ? "var(--brand-primary-soft)" : "var(--brand-surface)",
                          color: active ? "var(--brand-primary)" : "var(--brand-text)",
                          fontWeight: 600,
                          fontSize: 15,
                          cursor: "pointer",
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
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
                    color: "var(--brand-text)",
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

            <Section>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--brand-text)",
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
                      {WEEKDAY_LABELS.map((label, i) => {
                        const active = form.weekdays.includes(i);
                        return (
                          <button
                            key={label}
                            type="button"
                            data-testid={`weekday-${i}`}
                            aria-pressed={active}
                            onClick={() => toggleWeekday(i)}
                            style={{
                              padding: "7px 12px",
                              borderRadius: 8,
                              border: "1px solid",
                              borderColor: active ? "var(--brand-primary)" : "var(--brand-line)",
                              background: active
                                ? "var(--brand-primary-soft)"
                                : "var(--brand-surface)",
                              color: active ? "var(--brand-primary)" : "var(--brand-text)",
                              fontWeight: 600,
                              fontSize: 13,
                              cursor: "pointer",
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                      marginTop: 8,
                    }}
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
          </>
        )}
      </div>

      {!hasMainButton && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "12px 16px",
            background: "var(--brand-surface)",
            backdropFilter: "blur(20px)",
            borderTop: "1px solid var(--brand-line)",
            zIndex: 30,
            display: "flex",
            gap: 8,
          }}
        >
          {step > 1 && (
            <button
              type="button"
              data-testid="prev-step-btn"
              onClick={handleBack}
              disabled={submitting}
              style={{
                flex: 1,
                padding: "14px",
                background: "var(--brand-surface-2)",
                border: "none",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 600,
                color: "var(--brand-text)",
                cursor: "pointer",
              }}
            >
              Назад
            </button>
          )}
          <button
            type="button"
            data-testid={step === 3 ? "submit-btn" : "next-step-btn"}
            onClick={step === 3 ? handleSubmit : handleNext}
            disabled={submitting}
            style={{
              flex: 2,
              padding: "14px",
              background: submitting ? "var(--brand-primary-soft)" : "var(--brand-primary)",
              border: "none",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              color: "var(--brand-primary-ink)",
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {step === 3 ? (submitting ? "Создаём..." : "Создать поездку") : "Далее"}
          </button>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--brand-line)",
  borderRadius: 8,
  fontSize: 14,
  color: "var(--brand-text)",
  background: "var(--brand-surface)",
  boxSizing: "border-box",
};

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--brand-surface)",
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        border: "1px solid var(--brand-line)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--brand-sub)", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
