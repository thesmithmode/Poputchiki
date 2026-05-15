interface Props {
  message: string;
  onRetry?: () => void;
}

export function ErrorView({ message, onRetry }: Props) {
  return (
    <div
      data-testid="error-view"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        gap: 12,
      }}
    >
      <p style={{ color: "var(--brand-danger)", fontSize: 14, textAlign: "center", margin: 0 }}>
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          data-testid="retry-btn"
          onClick={onRetry}
          style={{
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 20px",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Повторить
        </button>
      )}
    </div>
  );
}
