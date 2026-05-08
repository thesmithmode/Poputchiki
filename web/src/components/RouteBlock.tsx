import { Icon } from "./Icon";

interface RouteBlockProps {
  fromLabel: string;
  toLabel: string;
  fromColor?: string;
  toColor?: string;
  compact?: boolean;
  dark?: boolean;
}

export function RouteBlock({
  fromLabel,
  toLabel,
  fromColor = "#3D6B8A",
  toColor = "#7C8694",
  compact = false,
  dark = false,
}: RouteBlockProps) {
  const textColor = dark ? "#ffffff" : "#15191F";
  const lineColor = dark ? "rgba(255,255,255,0.15)" : "#D8DEE6";
  const fontMain = compact ? 12.5 : 13.5;
  const lineH = compact ? 12 : 16;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 4,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: fromColor,
          }}
        />
        <span
          style={{
            width: 1.5,
            height: lineH,
            background: lineColor,
            marginTop: 2,
            marginBottom: 2,
          }}
        />
        <Icon name="pin" size={compact ? 10 : 11} style={{ color: toColor }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: fontMain,
            color: textColor,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.3,
            marginBottom: compact ? 4 : 6,
          }}
        >
          {fromLabel || "—"}
        </div>
        <div
          style={{
            fontSize: fontMain,
            color: textColor,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.3,
          }}
        >
          {toLabel || "—"}
        </div>
      </div>
    </div>
  );
}
