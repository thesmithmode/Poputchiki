interface Props {
  lines?: number;
  "data-testid"?: string;
}

export function Skeleton({ lines = 3, "data-testid": testId = "skeleton" }: Props) {
  return (
    <div data-testid={testId} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
          key={i}
          style={{
            height: 16,
            borderRadius: 8,
            background:
              "linear-gradient(90deg, var(--brand-surface-2) 25%, var(--brand-inset) 50%, var(--brand-surface-2) 75%)",
            width: i === lines - 1 ? "60%" : "100%",
          }}
        />
      ))}
    </div>
  );
}
