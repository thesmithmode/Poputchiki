interface LoadingScreenProps {
  label: string;
  pct: number;
}

export function LoadingScreen({ label, pct }: LoadingScreenProps) {
  return (
    <div
      style={{
        background: "var(--brand-bg, #f4f5f4)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "0 40px",
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: "var(--brand-primary, #2d5a3d)",
          letterSpacing: "-0.02em",
          fontFamily: "inherit",
        }}
      >
        Попутчики
      </div>
      <div
        style={{
          width: "100%",
          maxWidth: 280,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            width: "100%",
            height: 4,
            borderRadius: 2,
            background: "var(--brand-line, rgba(15,23,42,0.1))",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              borderRadius: 2,
              background: "var(--brand-primary, #2d5a3d)",
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--brand-sub, #6b7a6e)",
            textAlign: "center",
            fontWeight: 500,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}
