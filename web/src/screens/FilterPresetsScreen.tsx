import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { summarizePreset, useFilterPresets } from "../hooks/useFilterPresets";
import { DEFAULT_FILTERS, useFilters } from "../hooks/useFilters";

export function FilterPresetsScreen() {
  const navigate = useNavigate();
  const { presets, addPreset, removePreset, renamePreset } = useFilterPresets();
  const { filters, setFilters } = useFilters();
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const currentSummary = summarizePreset(filters);
  const hasCurrentFilters = currentSummary !== "Без фильтров";

  function handleSave() {
    const name = newName.trim();
    if (!name) return;
    addPreset(name, filters);
    setNewName("");
  }

  function handleApply(presetId: string) {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    // Полностью заменяем фильтры на пресет
    setFilters({
      ...DEFAULT_FILTERS,
      ...preset.filters,
    });
    navigate("/");
  }

  function handleStartRename(id: string, currentName: string) {
    setRenamingId(id);
    setRenameValue(currentName);
  }

  function handleConfirmRename() {
    if (renamingId) {
      renamePreset(renamingId, renameValue);
    }
    setRenamingId(null);
    setRenameValue("");
  }

  return (
    <div
      data-testid="filter-presets-screen"
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
          Пресеты фильтров
        </h1>
      </header>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Save current filter section */}
        <section
          data-testid="save-current-section"
          style={{
            background: "var(--brand-surface)",
            borderRadius: 12,
            padding: 14,
            border: "1px solid var(--brand-line)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--brand-text)",
            }}
          >
            Сохранить текущий фильтр
          </div>
          <div
            data-testid="current-filter-summary"
            style={{
              fontSize: 12,
              color: hasCurrentFilters ? "var(--brand-sub)" : "var(--brand-faint)",
              fontStyle: hasCurrentFilters ? "normal" : "italic",
            }}
          >
            {currentSummary}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              data-testid="preset-name-input"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Название пресета — напр. «На работу»"
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--brand-line)",
                background: "var(--brand-bg)",
                color: "var(--brand-text)",
                fontSize: 14,
                fontFamily: "inherit",
              }}
            />
            <button
              type="button"
              data-testid="save-preset-button"
              onClick={handleSave}
              disabled={!newName.trim()}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: newName.trim() ? "var(--brand-primary)" : "var(--brand-surface-2)",
                color: newName.trim() ? "var(--brand-primary-ink, #fff)" : "var(--brand-faint)",
                fontSize: 13,
                fontWeight: 600,
                cursor: newName.trim() ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}
            >
              Сохранить
            </button>
          </div>
        </section>

        {/* Saved presets list */}
        {presets.length === 0 ? (
          <div
            data-testid="presets-empty"
            style={{
              textAlign: "center",
              padding: "32px 16px",
              color: "var(--brand-sub)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Пока нет сохранённых пресетов.
            <br />
            Настройте фильтры на ленте и сохраните комбинацию, чтобы возвращаться к ней одним
            нажатием.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {presets.map((preset) => {
              const isRenaming = renamingId === preset.id;
              return (
                <div
                  key={preset.id}
                  data-testid={`preset-${preset.id}`}
                  style={{
                    background: "var(--brand-surface)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    border: "1px solid var(--brand-line)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {isRenaming ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        data-testid={`rename-input-${preset.id}`}
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        // biome-ignore lint/a11y/noAutofocus: поле переименования должно получать фокус автоматически
                        autoFocus
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: "1px solid var(--brand-line)",
                          background: "var(--brand-bg)",
                          color: "var(--brand-text)",
                          fontSize: 14,
                          fontFamily: "inherit",
                        }}
                      />
                      <button
                        type="button"
                        data-testid={`rename-confirm-${preset.id}`}
                        onClick={handleConfirmRename}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          border: "none",
                          background: "var(--brand-primary)",
                          color: "var(--brand-primary-ink, #fff)",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--brand-text)",
                      }}
                    >
                      {preset.name}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--brand-sub)",
                      lineHeight: 1.4,
                    }}
                  >
                    {summarizePreset(preset.filters)}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                    <button
                      type="button"
                      data-testid={`apply-${preset.id}`}
                      onClick={() => handleApply(preset.id)}
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        borderRadius: 8,
                        border: "none",
                        background: "var(--brand-primary)",
                        color: "var(--brand-primary-ink, #fff)",
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      <Icon name="filter" size={13} />
                      Применить
                    </button>
                    <button
                      type="button"
                      data-testid={`rename-${preset.id}`}
                      onClick={() => handleStartRename(preset.id, preset.name)}
                      aria-label="Переименовать"
                      style={{
                        padding: "7px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--brand-line)",
                        background: "var(--brand-surface)",
                        color: "var(--brand-text)",
                        fontSize: 12.5,
                        fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Изм.
                    </button>
                    <button
                      type="button"
                      data-testid={`remove-${preset.id}`}
                      onClick={() => removePreset(preset.id)}
                      aria-label="Удалить пресет"
                      style={{
                        padding: "7px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--brand-line)",
                        background: "var(--brand-surface)",
                        color: "var(--brand-danger)",
                        fontSize: 12.5,
                        fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Удал.
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
