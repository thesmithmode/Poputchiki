// ─────────────────────────────────────────────────────────────
// Address picker: full-screen sheet with category tabs + search
// ─────────────────────────────────────────────────────────────
function AddressSheet({ open, onClose, value, onChange, dark, accent, mode = 'to' }) {
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState('all');
  React.useEffect(() => { if (open) { setQ(''); setCat('all'); } }, [open]);
  if (!open) return null;
  const text = dark ? '#fff' : '#15191F';
  const sub = dark ? 'rgba(235,235,245,0.55)' : '#7C8694';
  const bg = dark ? '#000' : '#F2F4F7';

  const isFrom = mode === 'from';
  const showHouses = isFrom;

  // candidate items
  const houses = TSAREVO_HOUSES.map(h => ({
    id: h.id, kind: 'house', name: `${h.street}, д.${h.num}`, addr: 'ЖК Царёво', short: `Дом ${h.num}`,
    cat: 'tsarevo', icon: 'home',
  }));
  const pois = POI.map(p => ({ id: p.id, kind: 'poi', name: p.name, addr: p.addr, short: p.short, cat: p.cat, icon: POI_CATS[p.cat]?.icon }));
  const items = [...(showHouses ? houses : []), ...pois];

  const cats = isFrom
    ? [{ id: 'all', label: 'Все' }, { id: 'tsarevo', label: 'Царёво' }, ...Object.entries(POI_CATS).map(([id, c]) => ({ id, label: c.label }))]
    : [{ id: 'all', label: 'Все' }, ...Object.entries(POI_CATS).map(([id, c]) => ({ id, label: c.label }))];

  const filtered = items.filter(it => {
    if (cat !== 'all' && it.cat !== cat) return false;
    if (q && !(it.name.toLowerCase().includes(q.toLowerCase()) || it.addr.toLowerCase().includes(q.toLowerCase()) || it.short.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  // recents (mocked)
  const recentIds = isFrom ? ['h5'] : ['baum', 'm_dubr', 'tc_kolts', 'apo'];
  const recents = recentIds.map(id => items.find(x => x.id === id)).filter(Boolean);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 200,
      background: bg, color: text,
      display: 'flex', flexDirection: 'column',
      animation: 'slideUp 0.25s ease-out',
    }}>
      <div style={{ padding: '12px 12px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onClose} style={{
          width: 38, height: 38, borderRadius: 12, border: 'none',
          background: dark ? 'rgba(255,255,255,0.07)' : '#fff', color: text,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="x" size={18}/>
        </button>
        <div style={{
          flex: 1, height: 38, padding: '0 12px',
          background: dark ? 'rgba(255,255,255,0.07)' : '#fff',
          borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="search" size={16} style={{ color: sub }}/>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={isFrom ? 'Дом или адрес' : 'Адрес, ТЦ, метро…'} style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 14, color: text, fontFamily: 'inherit',
          }}/>
          {q && <button onClick={() => setQ('')} style={{ background: 'transparent', border: 'none', color: sub, cursor: 'pointer', padding: 4 }}><Icon name="x" size={14}/></button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '4px 12px 8px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {cats.map(c => {
          const a = cat === c.id;
          return (
            <button key={c.id} onClick={() => setCat(c.id)} style={{
              padding: '6px 12px', borderRadius: 999, border: 'none', flexShrink: 0,
              background: a ? (dark ? '#fff' : '#15191F') : (dark ? 'rgba(255,255,255,0.07)' : '#fff'),
              color: a ? (dark ? '#000' : '#fff') : text,
              fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
            }}>{c.label}</button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 24px' }}>
        {!q && cat === 'all' && (
          <>
            <div style={{ fontSize: 11.5, color: sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, padding: '12px 4px 8px' }}>Недавнее</div>
            <div style={{ background: dark ? '#1C1C1E' : '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: 8 }}>
              {recents.map((it, i) => (
                <AddressRow key={it.id} item={it} dark={dark} accent={accent} last={i === recents.length - 1} onClick={() => { onChange(it.id); onClose(); }}/>
              ))}
            </div>
          </>
        )}
        <div style={{ fontSize: 11.5, color: sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, padding: '12px 4px 8px' }}>
          {q ? `Найдено · ${filtered.length}` : 'Все адреса'}
        </div>
        <div style={{ background: dark ? '#1C1C1E' : '#fff', borderRadius: 14, overflow: 'hidden' }}>
          {filtered.map((it, i) => (
            <AddressRow key={it.id} item={it} dark={dark} accent={accent} active={value === it.id} last={i === filtered.length - 1} onClick={() => { onChange(it.id); onClose(); }}/>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: sub, fontSize: 13 }}>Ничего не найдено</div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddressRow({ item, dark, accent, last, active, onClick }) {
  const text = dark ? '#fff' : '#15191F';
  const sub = dark ? 'rgba(235,235,245,0.55)' : '#7C8694';
  const iconColor = item.kind === 'house' ? '#3D6B8A' : catColor(item.cat);
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      borderBottom: last ? 'none' : (dark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #EDF1F5'),
      cursor: 'pointer',
      background: active ? (dark ? 'rgba(255,255,255,0.04)' : '#F7F9FC') : 'transparent',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${iconColor}1A`, color: iconColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={item.icon || 'pin'} size={16}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
        <div style={{ fontSize: 12, color: sub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.addr}</div>
      </div>
      {active && <Icon name="check" size={16} style={{ color: accent }}/>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compact route bar — used at top of feed/map.
// ─────────────────────────────────────────────────────────────
function RouteBar({ from, to, radius, onChangeFrom, onChangeTo, onSwap, onChangeRadius, dark, accent }) {
  const text = dark ? '#fff' : '#15191F';
  const sub = dark ? 'rgba(235,235,245,0.55)' : '#7C8694';
  const fromP = pointById(from);
  const toP = to ? pointById(to) : null;

  return (
    <div style={{
      background: dark ? '#1C1C1E' : '#fff',
      borderRadius: 16,
      padding: 8,
      boxShadow: dark ? '0 1px 0 rgba(255,255,255,0.04)' : '0 1px 2px rgba(20, 30, 50, 0.05), 0 1px 0 rgba(20,30,50,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <button onClick={onChangeFrom} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', border: 'none', background: 'transparent',
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            borderRadius: 10,
          }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: fromP?.color || '#3D6B8A', flexShrink: 0 }}/>
            <span style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: sub, fontWeight: 500, marginBottom: 1 }}>Откуда</div>
              <div style={{ fontSize: 14, color: text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fromP ? fromP.label : 'Выберите дом'}
              </div>
            </span>
          </button>
          <div style={{ height: 1, background: dark ? 'rgba(255,255,255,0.06)' : '#EDF1F5', marginLeft: 31 }}/>
          <button onClick={onChangeTo} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', border: 'none', background: 'transparent',
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            borderRadius: 10,
          }}>
            <Icon name="pin" size={13} style={{ color: toP?.color || '#7C8694', flexShrink: 0, marginLeft: -2 }}/>
            <span style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: sub, fontWeight: 500, marginBottom: 1 }}>Куда</div>
              <div style={{ fontSize: 14, color: toP ? text : sub, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {toP ? toP.label : 'Адрес, ТЦ, метро…'}
              </div>
            </span>
          </button>
        </div>
        <button onClick={onSwap} style={{
          width: 36, height: 36, borderRadius: 10, border: 'none', marginRight: 4,
          background: dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8', color: text,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon name="swap" size={16}/>
        </button>
      </div>
      {to && onChangeRadius && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px 6px', borderTop: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #EDF1F5', marginTop: 4 }}>
          <Icon name="radius" size={14} style={{ color: sub }}/>
          <span style={{ fontSize: 12, color: sub, fontWeight: 500 }}>Радиус</span>
          <input type="range" min="0.5" max="3" step="0.1" value={radius} onChange={e => onChangeRadius(+e.target.value)} style={{ flex: 1, accentColor: accent, height: 4 }}/>
          <span style={{ fontSize: 12, color: text, fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'right' }}>{radius.toFixed(1)} км</span>
        </div>
      )}
    </div>
  );
}

// Match badge — visualizes how good the match is
function MatchBadge({ result, dark, accent }) {
  const { fromMatch, toMatch, toReason, detourMin } = result;
  const sub = dark ? 'rgba(235,235,245,0.55)' : '#7C8694';

  let label, color;
  if (fromMatch === 'exact' && toMatch === 'exact') {
    label = 'Точное совпадение';
    color = '#4DAB6E';
  } else if ((fromMatch === 'exact' || fromMatch === 'near') && (toMatch === 'exact' || toMatch === 'near')) {
    label = toReason === 'waypoint' ? 'По пути · точка водителя' : 'По пути';
    color = accent;
  } else if (toReason === 'onroute' || toReason === 'waypoint') {
    label = `+${detourMin || 3} мин крюк`;
    color = '#D9A13C';
  } else {
    label = `+${detourMin} мин крюк`;
    color = '#D9A13C';
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px 3px 7px', borderRadius: 999,
      background: `${color}1A`, color, fontSize: 11.5, fontWeight: 600,
      lineHeight: 1.2,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }}/>
      {label}
    </span>
  );
}

Object.assign(window, { AddressSheet, AddressRow, RouteBar, MatchBadge });
