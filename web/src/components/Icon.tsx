import type { CSSProperties, SVGProps } from "react";

interface IconProps {
  name: string;
  size?: number;
  stroke?: number;
  style?: CSSProperties;
}

type CommonSVGProps = SVGProps<SVGSVGElement>;

export function Icon({ name, size = 22, stroke = 1.8, style = {} }: IconProps) {
  const s = size;
  const w = stroke;
  const common: CommonSVGProps = {
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: w,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2v-9z" />
        </svg>
      );
    case "map":
      return (
        <svg {...common}>
          <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" />
          <path d="M9 4v16M15 6v16" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8z" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      );
    case "filter":
      return (
        <svg {...common}>
          <path d="M3 5h18M6 12h12M10 19h4" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path d="M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18l-5.9 3 1.2-6.5L2.5 9.9 9.1 9 12 3z" />
        </svg>
      );
    case "star-fill":
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 3l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18l-5.9 3 1.2-6.5L2.5 9.9 9.1 9 12 3z" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common}>
          <path d="M12 21s-7-4.5-9-9.5C1.5 7 4 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 3 0 5.5 3 4 7.5C19 16.5 12 21 12 21z" />
        </svg>
      );
    case "heart-fill":
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 21s-7-4.5-9-9.5C1.5 7 4 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 3 0 5.5 3 4 7.5C19 16.5 12 21 12 21z" />
        </svg>
      );
    case "thumb":
      return (
        <svg {...common}>
          <path d="M7 11v9H4v-9h3zm0 0l5-8c1.5 0 2.5 1 2.5 2.5V9h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 18.3 20H7" />
        </svg>
      );
    case "thumb-fill":
      return (
        <svg {...common} fill="currentColor">
          <path d="M7 11v9H4v-9h3zm0 0l5-8c1.5 0 2.5 1 2.5 2.5V9h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 18.3 20H7" />
        </svg>
      );
    case "chevron-r":
      return (
        <svg {...common}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case "chevron-l":
      return (
        <svg {...common}>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      );
    case "chevron-d":
      return (
        <svg {...common}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case "chevron-u":
      return (
        <svg {...common}>
          <path d="M6 15l6-6 6 6" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M5 5l14 14M19 5L5 19" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M5 12l5 5L20 7" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common}>
          <path d="M12 22s8-7.5 8-13a8 8 0 0 0-16 0c0 5.5 8 13 8 13z" />
          <circle cx="12" cy="9" r="3" />
        </svg>
      );
    case "circle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="6" />
        </svg>
      );
    case "circle-fill":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <circle cx="12" cy="12" r="5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "repeat":
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 0 1 14-7.5L21 4M21 12a9 9 0 0 1-14 7.5L3 20" />
          <path d="M16 4l5 0 0 5M8 20l-5 0 0-5" />
        </svg>
      );
    case "tg":
      return (
        <svg {...common} viewBox="0 0 24 24">
          <path d="M21.5 4.5L2.5 11.5l5 2 1.5 6 3-3 5 4 4-16z" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "flag":
      return (
        <svg {...common}>
          <path d="M5 3v18M5 4h13l-2 4 2 4H5" />
        </svg>
      );
    case "message":
      return (
        <svg {...common}>
          <path d="M21 12a8 8 0 0 1-12 7l-5 1 1-5a8 8 0 1 1 16-3z" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="14" rx="2" />
          <path d="M16 13h2" />
        </svg>
      );
    case "arrow-r":
      return (
        <svg {...common}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "send":
      return (
        <svg {...common}>
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      );
    case "sliders":
      return (
        <svg {...common}>
          <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
        </svg>
      );
    case "minus":
      return (
        <svg {...common}>
          <path d="M5 12h14" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5l4 4L8 20l-4.5.5L4 16 16.5 3.5z" />
        </svg>
      );
    case "support":
      return (
        <svg {...common}>
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-9-8.4A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
          <path d="M9 10a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01" />
        </svg>
      );
    case "logo":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={style}>
          <path
            d="M5 14C5 9 8 6 12 6s7 3 7 8"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="8" cy="17" r="2.5" fill="currentColor" />
          <circle cx="17" cy="17" r="2.5" fill="currentColor" />
        </svg>
      );
    case "swap":
      return (
        <svg {...common}>
          <path d="M7 4v16M3 8l4-4 4 4M17 4v16M13 16l4 4 4-4" />
        </svg>
      );
    case "radius":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="9" strokeDasharray="2 3" />
        </svg>
      );
    case "metro":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M7 16l1.5-8 3.5 5 3.5-5 1.5 8" />
        </svg>
      );
    case "shop":
      return (
        <svg {...common}>
          <path d="M3 9h18l-1 11H4L3 9z" />
          <path d="M8 9V6a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "plane":
      return (
        <svg {...common}>
          <path d="M3 12l3 1 3-3 4 8 2-2-1-4 6-4c1-1 0-2-1-2l-5 2-4-1-2 2 3 1-3 3-2-1-3 0z" />
        </svg>
      );
    case "edu":
      return (
        <svg {...common}>
          <path d="M3 9l9-4 9 4-9 4-9-4z" />
          <path d="M7 11v5c0 1 2 3 5 3s5-2 5-3v-5" />
        </svg>
      );
    case "briefcase":
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case "layers":
      return (
        <svg {...common}>
          <path d="M12 3l9 5-9 5-9-5 9-5z" />
          <path d="M3 13l9 5 9-5M3 18l9 5 9-5" />
        </svg>
      );
    case "list":
      return (
        <svg {...common}>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="3" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="3" cy="18" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "seat":
      return (
        <svg {...common}>
          <path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8H5V5z" />
          <path d="M3 13h18v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2z" />
          <path d="M7 19v2M17 19v2" />
        </svg>
      );
    default:
      return null;
  }
}
