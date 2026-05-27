// ─────────────────────────────────────────────────────────────
// Avatar: round, colored, initials.
// ─────────────────────────────────────────────────────────────
function Avatar({ user, size = 40, ring = false, dark = false }) {
  if (!user) return null;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: user.avatar, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 600, letterSpacing: 0.3,
      flexShrink: 0,
      boxShadow: ring ? `0 0 0 2px ${dark ? '#1a1a1a' : '#fff'}, 0 0 0 ${2 + 2}px ${user.avatar}55` : 'none',
    }}>{user.initials}</div>
  );
}

// ─────────────────────────────────────────────────────────────
// Status badges (likes count, new, favorited)
// ─────────────────────────────────────────────────────────────
function LikesPill({ count, size = 'sm', accent, dark }) {
  const small = size === 'sm';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: small ? '2px 7px 2px 6px' : '4px 10px 4px 8px',
      borderRadius: 999, fontSize: small ? 12 : 14, fontWeight: 600,
      background: dark ? 'rgba(255,255,255,0.08)' : '#F1F4F8',
      color: dark ? '#E8E8E8' : '#1a1a1a',
      lineHeight: 1,
    }}>
      <Icon name="thumb-fill" size={small ? 11 : 13} style={{ color: accent }}/>
      {count}
    </span>
  );
}

function NewBadge({ dark }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', borderRadius: 6,
      fontSize: 11, fontWeight: 600, lineHeight: 1.2,
      background: dark ? 'rgba(217, 161, 60, 0.18)' : '#FFF6E0',
      color: dark ? '#E8B860' : '#8A6420',
      border: dark ? '1px solid rgba(217, 161, 60, 0.3)' : '1px solid #F5E0A6',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#D9A13C' }} />
      новый
    </span>
  );
}

function VerifiedBadge({ dark, accent }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      width: 14, height: 14, borderRadius: '50%',
      background: accent, color: '#fff',
      flexShrink: 0,
    }}>
      <Icon name="check" size={10} stroke={3} style={{ margin: 'auto' }}/>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Button
// ─────────────────────────────────────────────────────────────
function Button({ children, kind = 'primary', size = 'md', icon, onClick, full = false, accent, dark, style = {} }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
    border: 'none', outline: 'none',
    transition: 'transform 0.08s, background 0.15s, opacity 0.15s',
    width: full ? '100%' : 'auto',
    boxSizing: 'border-box', flexShrink: 0,
  };
  const sizes = {
    sm: { height: 32, padding: '0 12px', borderRadius: 8,  fontSize: 13 },
    md: { height: 44, padding: '0 18px', borderRadius: 12, fontSize: 15 },
    lg: { height: 52, padding: '0 22px', borderRadius: 14, fontSize: 16 },
  };
  const kinds = {
    primary:   { background: accent, color: '#fff' },
    secondary: { background: dark ? 'rgba(255,255,255,0.08)' : '#F1F4F8', color: dark ? '#fff' : '#1a1a1a' },
    ghost:     { background: 'transparent', color: dark ? '#fff' : '#1a1a1a' },
    outline:   { background: 'transparent', color: dark ? '#fff' : '#1a1a1a', boxShadow: dark ? 'inset 0 0 0 1px rgba(255,255,255,0.16)' : 'inset 0 0 0 1px #E2E6EC' },
    danger:    { background: '#E54E5C', color: '#fff' },
  };
  return (
    <button onClick={onClick} style={{ ...base, ...sizes[size], ...kinds[kind], ...style }}
      onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
      onMouseUp={e => e.currentTarget.style.transform = ''}
      onMouseLeave={e => e.currentTarget.style.transform = ''}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 18}/>}
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Card surface
// ─────────────────────────────────────────────────────────────
function Card({ children, dark, padding = 16, style = {}, onClick, radius = 18 }) {
  return (
    <div onClick={onClick} style={{
      background: dark ? '#1C1C1E' : '#fff',
      borderRadius: radius,
      padding,
      boxShadow: dark ? '0 1px 0 rgba(255,255,255,0.04)' : '0 1px 2px rgba(20, 30, 50, 0.04), 0 1px 0 rgba(20, 30, 50, 0.03)',
      cursor: onClick ? 'pointer' : 'default',
      ...style,
    }}>{children}</div>
  );
}

// ─────────────────────────────────────────────────────────────
// Route line: dot → … → pin
// ─────────────────────────────────────────────────────────────
function RouteLine({ from, to, stops = [], compact = false, dark, accent }) {
  const fromP = placeById(from), toP = placeById(to);
  const sub = dark ? 'rgba(235,235,245,0.55)' : '#7C8694';
  const text = dark ? '#fff' : '#15191F';
  const lineColor = dark ? 'rgba(255,255,255,0.16)' : '#E2E6EC';
  const dotSize = compact ? 8 : 10;
  const rowH = compact ? 22 : 28;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: rowH }}>
        <div style={{ width: dotSize, height: dotSize, borderRadius: '50%', background: fromP.color, flexShrink: 0 }}/>
        <div style={{ fontSize: compact ? 13 : 15, fontWeight: 500, color: text }}>{fromP.label}</div>
      </div>
      <div style={{ paddingLeft: dotSize / 2 - 0.5, height: 16, display: 'flex', alignItems: 'center' }}>
        <div style={{ width: 1.5, height: '100%', background: lineColor, borderRadius: 2 }}/>
      </div>
      {stops.map(s => {
        const p = placeById(s);
        return (
          <React.Fragment key={s}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: rowH }}>
              <div style={{ width: dotSize - 2, height: dotSize - 2, borderRadius: '50%', background: 'transparent', border: `1.5px solid ${p.color}`, marginLeft: 1, flexShrink: 0 }}/>
              <div style={{ fontSize: compact ? 12 : 13, color: sub }}>{p.label}</div>
            </div>
            <div style={{ paddingLeft: dotSize / 2 - 0.5, height: 12, display: 'flex', alignItems: 'center' }}>
              <div style={{ width: 1.5, height: '100%', background: lineColor, borderRadius: 2 }}/>
            </div>
          </React.Fragment>
        );
      })}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: rowH }}>
        <Icon name="pin" size={compact ? 12 : 14} style={{ color: toP.color, marginLeft: -1 }}/>
        <div style={{ fontSize: compact ? 13 : 15, fontWeight: 500, color: text }}>{toP.label}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Map preview — stylized SVG, NOT a real map.
// ─────────────────────────────────────────────────────────────
function MapPreview({ from, to, height = 120, accent, dark, interactive = false, markers = null, onMarker }) {
  const fromP = placeById(from), toP = to ? placeById(to) : null;
  // Project lat/lng to bbox
  const allLats = [fromP.lat]; const allLngs = [fromP.lng];
  if (toP) { allLats.push(toP.lat); allLngs.push(toP.lng); }
  if (markers) markers.forEach(m => { const p = placeById(m.from); allLats.push(p.lat); allLngs.push(p.lng); });
  const padX = 0.04, padY = 0.025;
  const minLat = Math.min(...allLats) - padY, maxLat = Math.max(...allLats) + padY;
  const minLng = Math.min(...allLngs) - padX, maxLng = Math.max(...allLngs) + padX;
  const W = 360, H = height;
  const proj = (lat, lng) => ({
    x: ((lng - minLng) / (maxLng - minLng)) * W,
    y: H - ((lat - minLat) / (maxLat - minLat)) * H,
  });

  const bg = dark ? '#0E1418' : '#E8EEF3';
  const land = dark ? '#161F26' : '#F2F6FA';
  const water = dark ? '#0A1015' : '#D5E2EC';
  const road = dark ? 'rgba(255,255,255,0.10)' : 'rgba(60,75,95,0.10)';
  const road2 = dark ? 'rgba(255,255,255,0.06)' : 'rgba(60,75,95,0.06)';

  // sample roads — a grid + diagonals
  const a = proj(fromP.lat, fromP.lng);
  const b = toP ? proj(toP.lat, toP.lng) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice"
      style={{ display: 'block', width: '100%', height, borderRadius: 14, background: bg }}>
      <rect x="0" y="0" width={W} height={H} fill={land}/>
      {/* River — diagonal shape */}
      <path d={`M -10 ${H*0.7} Q ${W*0.3} ${H*0.55} ${W*0.6} ${H*0.75} T ${W+10} ${H*0.65} L ${W+10} ${H+10} L -10 ${H+10} Z`} fill={water} opacity="0.55"/>
      {/* Park blob */}
      <ellipse cx={W*0.18} cy={H*0.3} rx="40" ry="24" fill={dark ? '#1A2620' : '#DBE8DD'}/>
      {/* Roads */}
      {[0.18, 0.42, 0.68].map(y => (
        <line key={'h'+y} x1="0" y1={H*y} x2={W} y2={H*y} stroke={road} strokeWidth="1.2"/>
      ))}
      {[0.15, 0.4, 0.7, 0.88].map(x => (
        <line key={'v'+x} x1={W*x} y1="0" x2={W*x} y2={H} stroke={road2} strokeWidth="1"/>
      ))}
      <line x1="0" y1={H*0.05} x2={W} y2={H*0.45} stroke={road} strokeWidth="1.4"/>
      <line x1={W*0.05} y1={H} x2={W*0.7} y2="0" stroke={road2} strokeWidth="1"/>

      {/* Route */}
      {b && (
        <g>
          <path d={`M ${a.x} ${a.y} Q ${(a.x+b.x)/2 + 14} ${(a.y+b.y)/2 - 18} ${b.x} ${b.y}`}
            stroke={accent} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeDasharray="0"/>
          <path d={`M ${a.x} ${a.y} Q ${(a.x+b.x)/2 + 14} ${(a.y+b.y)/2 - 18} ${b.x} ${b.y}`}
            stroke="#fff" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.4"/>
        </g>
      )}

      {/* Multi-markers mode */}
      {markers && markers.map((m, i) => {
        const p = placeById(m.from);
        const c = proj(p.lat, p.lng);
        const driver = userById(m.driver);
        return (
          <g key={m.id} style={{ cursor: 'pointer' }} onClick={() => onMarker && onMarker(m.id)}>
            <circle cx={c.x} cy={c.y} r="14" fill={accent} opacity="0.18"/>
            <circle cx={c.x} cy={c.y} r="9" fill={accent} stroke="#fff" strokeWidth="2"/>
            <text x={c.x} y={c.y + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">{driver.initials[0]}</text>
          </g>
        );
      })}

      {/* From marker */}
      {!markers && (
        <g>
          <circle cx={a.x} cy={a.y} r="10" fill={fromP.color} opacity="0.22"/>
          <circle cx={a.x} cy={a.y} r="5" fill={fromP.color} stroke="#fff" strokeWidth="2"/>
        </g>
      )}
      {b && (
        <g transform={`translate(${b.x - 8}, ${b.y - 18})`}>
          <path d="M8 18s8-7 8-12a8 8 0 0 0-16 0c0 5 8 12 8 12z" fill={toP.color} stroke="#fff" strokeWidth="1.5"/>
          <circle cx="8" cy="6" r="2.5" fill="#fff"/>
        </g>
      )}
    </svg>
  );
}

Object.assign(window, { Avatar, LikesPill, NewBadge, VerifiedBadge, Button, Card, RouteLine, MapPreview });
