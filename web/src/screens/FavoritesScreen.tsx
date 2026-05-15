import { useNavigate } from "react-router-dom";
import type { FavoriteEntry } from "../hooks/useFavorites";
import { useFavorites } from "../hooks/useFavorites";

export function FavoritesScreen() {
  const navigate = useNavigate();
  const { favorites, isLoading, toggle, setNotify } = useFavorites();

  if (isLoading) {
    return (
      <div
        data-testid="favorites-loading"
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
      data-testid="favorites-screen"
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
          Избранные
        </h1>
      </header>

      <div style={{ padding: 16, flex: 1 }}>
        {favorites.length === 0 ? (
          <div
            data-testid="favorites-empty"
            style={{
              textAlign: "center",
              padding: "48px 0",
              color: "var(--brand-sub)",
              fontSize: 14,
            }}
          >
            Нет избранных
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {favorites.map((f) => (
              <FavoriteRow
                key={f.target_id}
                entry={f}
                onNavigate={() => navigate(`/users/${f.target_id}`)}
                onToggleNotify={() => setNotify(f.target_id, !f.notify)}
                onRemove={() => toggle(f.target_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface FavoriteRowProps {
  entry: FavoriteEntry;
  onNavigate: () => void;
  onToggleNotify: () => void;
  onRemove: () => void;
}

function FavoriteRow({ entry, onNavigate, onToggleNotify, onRemove }: FavoriteRowProps) {
  return (
    <div
      data-testid={`fav-${entry.target_id}`}
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "12px 16px",
        border: "1px solid #e5e7eb",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <button
        type="button"
        onClick={onNavigate}
        style={{
          flex: 1,
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--brand-text)" }}>
          {entry.display_name}
        </div>
        {entry.tg_username && (
          <div style={{ fontSize: 12, color: "var(--brand-sub)", marginTop: 2 }}>
            @{entry.tg_username}
          </div>
        )}
      </button>
      <button
        type="button"
        data-testid={`notify-${entry.target_id}`}
        onClick={onToggleNotify}
        aria-label={entry.notify ? "Выключить уведомления" : "Включить уведомления"}
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 4 }}
      >
        {entry.notify ? "🔔" : "🔕"}
      </button>
      <button
        type="button"
        data-testid={`remove-${entry.target_id}`}
        onClick={onRemove}
        aria-label="Убрать из избранного"
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 4 }}
      >
        ❤️
      </button>
    </div>
  );
}
