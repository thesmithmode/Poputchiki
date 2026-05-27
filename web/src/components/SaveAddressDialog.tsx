import { useState } from "react";

interface SaveAddressDialogProps {
  open: boolean;
  addressLabel: string;
  lat: number;
  lng: number;
  onSave: (data: {
    type: "home" | "work" | "custom";
    name: string;
    address_label: string;
    lat: number;
    lng: number;
  }) => void;
  onClose: () => void;
  saving?: boolean;
}

const TYPE_OPTIONS: { value: "home" | "work" | "custom"; label: string; icon: string }[] = [
  { value: "home", label: "Дом", icon: "🏠" },
  { value: "work", label: "Работа", icon: "🏢" },
  { value: "custom", label: "Своё название", icon: "📍" },
];

export function SaveAddressDialog({
  open,
  addressLabel,
  lat,
  lng,
  onSave,
  onClose,
  saving,
}: SaveAddressDialogProps) {
  const [type, setType] = useState<"home" | "work" | "custom">("custom");
  const [customName, setCustomName] = useState("");

  if (!open) return null;

  const name = type === "home" ? "Дом" : type === "work" ? "Работа" : customName.trim();
  const canSave = name.length > 0 && name.length <= 50;

  function handleSave() {
    if (!canSave || saving) return;
    onSave({ type, name, address_label: addressLabel, lat, lng });
  }

  return (
    <div
      data-testid="save-address-overlay"
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: "var(--brand-surface)",
          borderRadius: 16,
          padding: 20,
          width: "100%",
          maxWidth: 360,
          border: "1px solid var(--brand-line)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <h3
          style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600, color: "var(--brand-text)" }}
        >
          Сохранить адрес
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--brand-sub)" }}>
          {addressLabel}
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              data-testid={`save-type-${opt.value}`}
              onClick={() => setType(opt.value)}
              style={{
                flex: 1,
                padding: "8px 4px",
                borderRadius: 8,
                border: "1px solid",
                borderColor: type === opt.value ? "var(--brand-primary)" : "var(--brand-line)",
                background:
                  type === opt.value ? "var(--brand-primary-soft)" : "var(--brand-surface)",
                color: type === opt.value ? "var(--brand-primary)" : "var(--brand-text)",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>

        {type === "custom" && (
          <input
            data-testid="save-custom-name"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Название (напр. Курорт)"
            maxLength={50}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid var(--brand-line)",
              borderRadius: 8,
              fontSize: 14,
              color: "var(--brand-text)",
              background: "var(--brand-surface)",
              boxSizing: "border-box",
              marginBottom: 12,
            }}
          />
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: "12px",
              background: "var(--brand-surface-2)",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--brand-text)",
              cursor: "pointer",
            }}
          >
            Отмена
          </button>
          <button
            type="button"
            data-testid="save-address-confirm"
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              flex: 1,
              padding: "12px",
              background: canSave && !saving ? "var(--brand-primary)" : "var(--brand-primary-soft)",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              color: "var(--brand-primary-ink)",
              cursor: canSave && !saving ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
