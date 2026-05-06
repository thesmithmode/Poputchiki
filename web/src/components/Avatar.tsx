import { useState } from "react";

// Deterministic 5x5 mirrored identicon from tg_id
// Colors from Telegram's default avatar palette
const TG_COLORS = [
  "#e17076", // red
  "#7bc862", // green
  "#65aadd", // blue
  "#ee7aae", // pink
  "#6ec9cb", // teal
  "#faa774", // orange
  "#a695e7", // purple
  "#e6821e", // amber
];

function identiconSvg(tgId: number, size: number): string {
  // Hash tg_id into a color index and pixel pattern
  const hash = Math.abs(tgId * 2654435761) >>> 0;
  const color = TG_COLORS[hash % TG_COLORS.length] ?? TG_COLORS[0];
  const cellSize = size / 5;

  // Generate 15 bits (left half of 5x5 grid, mirrored)
  const bits: boolean[] = [];
  let h = hash;
  for (let i = 0; i < 15; i++) {
    bits.push((h & 1) === 1);
    h >>>= 1;
  }

  const rects: string[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (bits[row * 3 + col]) {
        const x = col * cellSize;
        const mirrorCol = 4 - col;
        rects.push(
          `<rect x="${x}" y="${row * cellSize}" width="${cellSize}" height="${cellSize}"/>`,
        );
        if (col !== mirrorCol) {
          rects.push(
            `<rect x="${mirrorCol * cellSize}" y="${row * cellSize}" width="${cellSize}" height="${cellSize}"/>`,
          );
        }
      }
    }
  }

  const bg = "#f0f2f5";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${bg}"/><g fill="${color}">${rects.join("")}</g></svg>`;
}

interface AvatarProps {
  tgId: number;
  photoUrl?: string | null;
  displayName?: string;
  size?: number;
  style?: React.CSSProperties;
}

export function Avatar({ tgId, photoUrl, displayName, size = 48, style }: AvatarProps) {
  const [errored, setErrored] = useState(false);

  const showPhoto = photoUrl && !errored;

  if (showPhoto) {
    return (
      <img
        src={photoUrl}
        alt={displayName ?? "avatar"}
        onError={() => setErrored(true)}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }

  const svg = identiconSvg(tgId, size);
  const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;

  return (
    <img
      src={dataUri}
      alt={displayName ?? "avatar"}
      data-testid="avatar-identicon"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
