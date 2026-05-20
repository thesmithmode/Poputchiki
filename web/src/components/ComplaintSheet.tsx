import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";

type ReasonCode = "spam" | "fraud" | "offense" | "other";

const REASONS: { code: ReasonCode; label: string }[] = [
  { code: "spam", label: "Спам" },
  { code: "fraud", label: "Мошенничество" },
  { code: "offense", label: "Оскорбление" },
  { code: "other", label: "Другое" },
];

interface ComplaintSheetProps {
  open: boolean;
  targetUserId: string;
  targetRideId?: string;
  onClose: () => void;
}

export function ComplaintSheet({ open, targetUserId, targetRideId, onClose }: ComplaintSheetProps) {
  const [reason, setReason] = useState<ReasonCode | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // WCAG 2.1 §2.1.2: Escape должен работать вне зависимости от focus.
  // div onKeyDown срабатывает только когда div в фокусе — глобальный listener надёжнее.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit() {
    if (!reason) return;
    setLoading(true);
    try {
      await apiFetch("/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_user_id: targetUserId,
          ...(targetRideId ? { target_ride_id: targetRideId } : {}),
          reason_code: reason,
          ...(text.trim() ? { text: text.trim() } : {}),
        }),
      });
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handling делает глобальный document keydown listener (useEffect выше) для Escape; onClick тут — backdrop dismiss по mouse
    <div
      data-testid="complaint-sheet"
      ref={dialogRef}
      // biome-ignore lint/a11y/useSemanticElements: native <dialog> требует showModal()/close() API — заменим в отдельном рефакторе; sufficient для WCAG 2.1 §2.1.2
      role="dialog"
      aria-modal="true"
      aria-label="Пожаловаться"
      tabIndex={-1}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        background: "rgba(0,0,0,0.5)",
        outline: "none",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation нужен только для mouse, keyboard обрабатывается глобально */}
      <div
        style={{
          width: "100%",
          background: "var(--brand-surface)",
          color: "var(--brand-text)",
          borderRadius: "16px 16px 0 0",
          padding: "20px 16px 32px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Пожаловаться</h2>
          <button
            type="button"
            data-testid="complaint-close"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 22,
              cursor: "pointer",
              padding: 4,
              color: "var(--brand-sub)",
            }}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          {REASONS.map(({ code, label }) => (
            <label
              key={code}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontSize: 15,
              }}
            >
              <input
                type="radio"
                data-testid={`reason-${code}`}
                name="reason_code"
                value={code}
                checked={reason === code}
                onChange={() => setReason(code)}
              />
              {label}
            </label>
          ))}
        </div>

        <textarea
          data-testid="complaint-text"
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Дополнительные подробности (необязательно)"
          style={{
            width: "100%",
            minHeight: 72,
            borderRadius: 10,
            border: "1px solid var(--brand-line)",
            background: "var(--brand-surface-2)",
            color: "var(--brand-text)",
            padding: "8px 10px",
            fontSize: 14,
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />

        <button
          type="button"
          data-testid="complaint-submit"
          disabled={!reason || loading}
          onClick={handleSubmit}
          style={{
            marginTop: 14,
            width: "100%",
            background: reason ? "var(--brand-primary)" : "var(--brand-inset)",
            color: reason ? "var(--brand-primary-ink)" : "var(--brand-sub)",
            border: "none",
            borderRadius: 12,
            padding: "13px 0",
            fontSize: 15,
            fontWeight: 600,
            cursor: reason ? "pointer" : "not-allowed",
          }}
        >
          {loading ? "Отправляем..." : "Отправить жалобу"}
        </button>
      </div>
    </div>
  );
}
