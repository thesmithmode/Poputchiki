interface Props {
  text?: string;
  "data-testid"?: string;
}

export function Loading({
  text = "Загрузка...",
  "data-testid": testId = "loading-indicator",
}: Props) {
  return (
    <div
      data-testid={testId}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 0",
      }}
    >
      <p style={{ color: "#7c8694", fontSize: 14 }}>{text}</p>
    </div>
  );
}
