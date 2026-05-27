import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AddressAutocomplete, type Coords } from "../components/AddressAutocomplete";
import { type SavedAddress, useSavedAddresses } from "../hooks/useSavedAddresses";
import { useTelegramBack } from "../hooks/useTelegramBack";
import { useTelegramHaptic } from "../hooks/useTelegramHaptic";

type AddingType = "home" | "work" | "custom" | null;

export function SavedAddressesScreen() {
  const navigate = useNavigate();
  useTelegramBack(() => navigate(-1));
  const { notification } = useTelegramHaptic();
  const { addresses, create, remove, isCreating, isLoading } = useSavedAddresses();
  const [adding, setAdding] = useState<AddingType>(null);
  const [addLabel, setAddLabel] = useState("");
  const [addCoords, setAddCoords] = useState<Coords | null>(null);
  const [customName, setCustomName] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const home = addresses.find((a) => a.type === "home");
  const work = addresses.find((a) => a.type === "work");
  const custom = addresses.filter((a) => a.type === "custom");

  async function handleSave() {
    if (!adding || !addCoords || !addLabel.trim()) return;
    const name = adding === "home" ? "Дом" : adding === "work" ? "Работа" : customName.trim();
    if (!name) return;
    await create({
      type: adding,
      name,
      address_label: addLabel.trim(),
      lat: addCoords.lat,
      lng: addCoords.lng,
    });
    notification("success");
    resetForm();
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await remove(id);
      notification("success");
    } finally {
      setDeleting(null);
    }
  }

  function resetForm() {
    setAdding(null);
    setAddLabel("");
    setAddCoords(null);
    setCustomName("");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--brand-bg)", color: "var(--brand-text)" }}>
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
          onClick={() => navigate(-1)}
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
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, flex: 1 }}>Сохранённые адреса</h1>
      </div>

      <div style={{ padding: "12px 16px 120px" }}>
        {isLoading && <p style={{ color: "var(--brand-sub)", fontSize: 14 }}>Загрузка...</p>}

        <QuickSlot
          icon="🏠"
          title="Дом"
          address={home}
          onSet={() => setAdding("home")}
          onDelete={() => home && handleDelete(home.id)}
          deleting={deleting === home?.id}
        />
        <QuickSlot
          icon="🏢"
          title="Работа"
          address={work}
          onSet={() => setAdding("work")}
          onDelete={() => work && handleDelete(work.id)}
          deleting={deleting === work?.id}
        />

        <div style={{ marginTop: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--brand-sub)",
                textTransform: "uppercase",
              }}
            >
              Пользовательские
            </span>
            <button
              type="button"
              data-testid="add-custom-btn"
              onClick={() => setAdding("custom")}
              style={{
                background: "var(--brand-primary-soft)",
                border: "none",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--brand-primary)",
                cursor: "pointer",
              }}
            >
              + Добавить
            </button>
          </div>

          {custom.length === 0 && !adding && (
            <p style={{ color: "var(--brand-sub)", fontSize: 14 }}>
              Нет сохранённых адресов. Добавьте часто используемые места.
            </p>
          )}

          {custom.map((addr) => (
            <AddressCard
              key={addr.id}
              address={addr}
              onDelete={() => handleDelete(addr.id)}
              deleting={deleting === addr.id}
            />
          ))}
        </div>

        {adding && (
          <div
            style={{
              marginTop: 16,
              background: "var(--brand-surface)",
              borderRadius: 16,
              padding: 16,
              border: "1px solid var(--brand-line)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              {adding === "home"
                ? "🏠 Задать дом"
                : adding === "work"
                  ? "🏢 Задать работу"
                  : "📍 Новый адрес"}
            </div>

            {adding === "custom" && (
              <input
                data-testid="custom-name-input"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Название (напр. Курорт)"
                maxLength={50}
                style={formInputStyle}
              />
            )}

            <div style={{ marginTop: 8 }}>
              <AddressAutocomplete
                testId="add-address-input"
                value={addLabel}
                onChange={(v, coords) => {
                  setAddLabel(v);
                  setAddCoords(coords ?? null);
                }}
                placeholder="Найти адрес..."
                inputStyle={formInputStyle}
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={resetForm}
                style={{
                  flex: 1,
                  padding: "10px",
                  background: "var(--brand-surface-2)",
                  border: "none",
                  borderRadius: 8,
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
                data-testid="save-address-btn"
                onClick={handleSave}
                disabled={
                  !addCoords ||
                  !addLabel.trim() ||
                  (adding === "custom" && !customName.trim()) ||
                  isCreating
                }
                style={{
                  flex: 1,
                  padding: "10px",
                  background:
                    addCoords && addLabel.trim()
                      ? "var(--brand-primary)"
                      : "var(--brand-primary-soft)",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--brand-primary-ink)",
                  cursor: addCoords ? "pointer" : "not-allowed",
                }}
              >
                {isCreating ? "..." : "Сохранить"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const formInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--brand-line)",
  borderRadius: 8,
  fontSize: 14,
  color: "var(--brand-text)",
  background: "var(--brand-surface)",
  boxSizing: "border-box",
};

function QuickSlot({
  icon,
  title,
  address,
  onSet,
  onDelete,
  deleting,
}: {
  icon: string;
  title: string;
  address: SavedAddress | undefined;
  onSet: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--brand-surface)",
        borderRadius: 12,
        padding: "12px 16px",
        marginBottom: 8,
        border: "1px solid var(--brand-line)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 24 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
        {address ? (
          <div
            style={{
              fontSize: 13,
              color: "var(--brand-sub)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {address.address_label}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--brand-sub)" }}>Не задан</div>
        )}
      </div>
      {address ? (
        <div style={{ display: "flex", gap: 4 }}>
          <button type="button" onClick={onSet} style={slotBtnStyle}>
            ✏️
          </button>
          <button type="button" onClick={onDelete} disabled={deleting} style={slotBtnStyle}>
            {deleting ? "..." : "🗑"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onSet}
          style={{
            background: "var(--brand-primary-soft)",
            border: "none",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--brand-primary)",
            cursor: "pointer",
          }}
        >
          Задать
        </button>
      )}
    </div>
  );
}

const slotBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 16,
  cursor: "pointer",
  padding: "4px 6px",
};

function AddressCard({
  address,
  onDelete,
  deleting,
}: {
  address: SavedAddress;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--brand-surface)",
        borderRadius: 12,
        padding: "12px 16px",
        marginBottom: 8,
        border: "1px solid var(--brand-line)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 14, color: "#d4a017" }}>★</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{address.name}</div>
        <div
          style={{
            fontSize: 12,
            color: "var(--brand-sub)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {address.address_label}
        </div>
      </div>
      <button type="button" onClick={onDelete} disabled={deleting} style={slotBtnStyle}>
        {deleting ? "..." : "🗑"}
      </button>
    </div>
  );
}
