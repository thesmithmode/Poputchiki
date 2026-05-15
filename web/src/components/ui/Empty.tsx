interface Props {
  text: string;
  "data-testid"?: string;
}

export function Empty({ text, "data-testid": testId = "empty-state" }: Props) {
  return (
    <div
      data-testid={testId}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 40 }}>🚗</span>
      <p style={{ color: "var(--brand-sub)", fontSize: 14, textAlign: "center", margin: 0 }}>
        {text}
      </p>
    </div>
  );
}
