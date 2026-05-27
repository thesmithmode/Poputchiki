// ─────────────────────────────────────────────────────────────
// Filters sheet
// ─────────────────────────────────────────────────────────────
function FiltersSheet({ open, onClose, filters, setFilters, dark, accent }) {
  if (!open) return null;
  const sub = dark ? 'rgba(235,235,245,0.55)' : '#7C8694';
  const text = dark ? '#fff' : '#15191F';
  const bg = dark ? '#1C1C1E' : '#fff';

  const setF = (k, v) => setFilters({ ...filters, [k]: v });
  const directions = [
    { id: 'any',     label: 'Любое' },
    { id: 'center',  label: 'Центр' },
    { id: 'metro',   label: 'Метро' },
    { id: 'airport', label: 'Аэропорт' },
    { id: 'station', label: 'Вокзал' },
    { id: 'ikea',    label: 'МЕГА' },
  ];

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'flex-end',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: bg, color: text,
        width: '100%', borderRadius: '24px 24px 0 0',
        padding: '12px 0 24px',
        maxHeight: '85%', overflowY: 'auto',
        animation: 'slideUp 0.25s ease-out',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: dark ? 'rgba(255,255,255,0.2)' : '#D8DEE6', margin: '4px auto 14px' }}/>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 16px' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Фильтры</div>
          <button onClick={() => setFilters({ direction: 'any', maxPrice: 500, minSeats: 1, minAge: 0, minLikes: 0, favOnly: false })} style={{ background: 'transparent', border: 'none', color: accent, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Сбросить</button>
        </div>

        <div style={{ padding: '0 16px 8px' }}>
          <div style={{ fontSize: 13, color: sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>Направление</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {directions.map(d => (
              <button key={d.id} onClick={() => setF('direction', d.id)} style={{
                padding: '8px 14px', borderRadius: 999, border: 'none',
                background: filters.direction === d.id ? accent : (dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8'),
                color: filters.direction === d.id ? '#fff' : text,
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>{d.label}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: '20px 16px 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Цена до</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{filters.maxPrice === 1000 ? 'любая' : `${filters.maxPrice} ₽`}</div>
          </div>
          <input type="range" min="100" max="1000" step="50" value={filters.maxPrice} onChange={e => setF('maxPrice', +e.target.value)} style={{ width: '100%', accentColor: accent }}/>
        </div>

        <div style={{ padding: '20px 16px 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Мест минимум</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{filters.minSeats}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1,2,3,4].map(n => (
              <button key={n} onClick={() => setF('minSeats', n)} style={{
                flex: 1, height: 44, borderRadius: 12, border: 'none',
                background: filters.minSeats === n ? accent : (dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8'),
                color: filters.minSeats === n ? '#fff' : text,
                fontSize: 16, fontWeight: 600, cursor: 'pointer',
              }}>{n}+</button>
            ))}
          </div>
        </div>

        {/* Trust filters — emphasized */}
        <div style={{ margin: '20px 16px 0', padding: 16, borderRadius: 16, background: dark ? 'rgba(255,255,255,0.04)' : '#F7F9FC', border: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #E8EDF3' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Icon name="shield" size={16} style={{ color: accent }}/>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Доверие</div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <div style={{ fontSize: 13, color: sub }}>Аккаунт старше</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{filters.minAge === 0 ? 'без ограничений' : `${filters.minAge} дней`}</div>
            </div>
            <input type="range" min="0" max="30" step="1" value={filters.minAge} onChange={e => setF('minAge', +e.target.value)} style={{ width: '100%', accentColor: accent }}/>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <div style={{ fontSize: 13, color: sub }}>Лайков минимум</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{filters.minLikes === 0 ? 'не важно' : `${filters.minLikes}+`}</div>
            </div>
            <input type="range" min="0" max="10" step="1" value={filters.minLikes} onChange={e => setF('minLikes', +e.target.value)} style={{ width: '100%', accentColor: accent }}/>
          </div>

          <Toggle label="Только избранные водители" value={filters.favOnly} onChange={v => setF('favOnly', v)} dark={dark} accent={accent}/>
        </div>

        <div style={{ padding: '20px 16px 0' }}>
          <Button kind="primary" size="lg" full accent={accent} dark={dark} onClick={onClose}>Показать поездки</Button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange, dark, accent, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: dark ? 'rgba(235,235,245,0.5)' : '#7C8694', marginTop: 2 }}>{sub}</div>}
      </div>
      <button onClick={() => onChange(!value)} style={{
        width: 50, height: 30, borderRadius: 999, border: 'none',
        background: value ? accent : (dark ? 'rgba(120,120,128,0.3)' : '#E0E5EC'),
        position: 'relative', cursor: 'pointer', transition: 'background 0.18s',
        flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: 2, left: value ? 22 : 2,
          width: 26, height: 26, borderRadius: '50%', background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.18s',
        }}/>
      </button>
    </div>
  );
}

Object.assign(window, { FiltersSheet, Toggle });
