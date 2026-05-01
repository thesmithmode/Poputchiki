// ─────────────────────────────────────────────────────────────
// FEED — route bar + smart matching + compact list
// ─────────────────────────────────────────────────────────────
function FeedScreen({ dark, accent, density, cardVariant, showMap, onOpenRide, onOpenFilters, filters, defaultFilters, me }) {
  const [from, setFrom] = React.useState(me.house || 'h5');
  const [to, setTo]     = React.useState(null);
  const [radius, setRadius] = React.useState(1.5);
  const [picker, setPicker] = React.useState(null); // 'from' | 'to' | null

  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  const text = dark ? '#fff' : '#15191F';

  const swap = () => {
    // can only swap if both sides chosen and "from" is currently a house;
    // if user swaps, we keep current to as new from only if it's a house — otherwise no-op
    if (!to) return;
    // We don't allow non-house "from", so this just doesn't happen meaningfully.
    // Implement as: clear to (we've reversed mental flow).
    setFrom(to.startsWith && to.startsWith('h') ? to : from);
    setTo(from);
  };

  const query = { from, to, radiusKm: radius };
  const trustOn = filters.minAge > 0 || filters.minLikes > 0 || filters.favOnly;
  const opts = {
    trustFilters: trustOn,
    minAge: filters.minAge,
    minLikes: filters.minLikes,
    favOnly: filters.favOnly,
    maxPrice: filters.maxPrice,
  };
  const results = searchRides(query, opts);
  const exactCount = results.filter(r => r.fromMatch === 'exact' || r.fromMatch === 'near').filter(r => !to || r.toMatch === 'exact' || r.toMatch === 'near').length;
  const totalCount = results.length;

  return (
    <div>
      {/* Compact header */}
      <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: sub, fontWeight: 500, marginBottom: 2 }}>ЖК Царёво · Казань</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: text, letterSpacing: -0.3 }}>Попутчики</div>
        </div>
        <IconButton name="filter" dark={dark} onClick={onOpenFilters} badge={trustOn ? '!' : null}/>
      </div>

      <div style={{ padding: '12px 16px 4px' }}>
        <RouteBar
          from={from} to={to} radius={radius}
          onChangeFrom={() => setPicker('from')}
          onChangeTo={() => setPicker('to')}
          onSwap={swap}
          onChangeRadius={to ? setRadius : null}
          dark={dark} accent={accent}
        />
      </div>

      {/* Result summary */}
      <div style={{ padding: '8px 16px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
        {to ? (
          <>
            <div style={{ fontSize: 12.5, color: sub, fontWeight: 500 }}>
              <span style={{ color: text, fontWeight: 600 }}>{totalCount}</span> поездок
              {exactCount < totalCount && totalCount > 0 && <span> · {exactCount} точно по маршруту</span>}
            </div>
            <div style={{ flex: 1 }}/>
            <button onClick={() => setTo(null)} style={{ background: 'transparent', border: 'none', color: accent, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}>Очистить</button>
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: sub, fontWeight: 500 }}>
            Все попутчики из вашего дома · <span style={{ color: text, fontWeight: 600 }}>{totalCount}</span>
          </div>
        )}
      </div>

      {/* Quick destination chips when no "to" */}
      {!to && (
        <div style={{ padding: '8px 16px 4px', display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {[
            { id: 'baum',     label: 'ул. Баумана' },
            { id: 'm_dubr',   label: 'м. Дубравная' },
            { id: 'tc_kolts', label: 'ТЦ Кольцо' },
            { id: 'apo',      label: 'Аэропорт' },
            { id: 'tc_mega',  label: 'МЕГА' },
            { id: 'rail1',    label: 'Вокзал' },
            { id: 'kfu',      label: 'КФУ' },
          ].map(c => (
            <button key={c.id} onClick={() => setTo(c.id)} style={{
              padding: '7px 13px', borderRadius: 999, border: 'none', flexShrink: 0,
              background: dark ? 'rgba(255,255,255,0.07)' : '#fff',
              color: text, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: !dark ? '0 1px 1px rgba(20,30,50,0.04)' : 'none',
            }}>{c.label}</button>
          ))}
        </div>
      )}

      {/* Trust banner */}
      {trustOn && (
        <div style={{ margin: '8px 16px 4px', padding: '10px 12px', borderRadius: 12, background: `${accent}14`, color: accent, fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="shield" size={14}/>
          Активны фильтры доверия
        </div>
      )}

      {/* Results */}
      <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: density === 'compact' ? 8 : 10 }}>
        {results.map(({ ride, ...match }) => (
          <RideCard key={ride.id} ride={ride} match={to ? match : null} variant={cardVariant} density={density} showMap={showMap} dark={dark} accent={accent} onClick={() => onOpenRide(ride.id)}/>
        ))}
        {results.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: sub }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: text, marginBottom: 4 }}>Ничего не найдено</div>
            <div style={{ fontSize: 13 }}>Попробуйте увеличить радиус или сбросить фильтры</div>
          </div>
        )}
      </div>

      <AddressSheet
        open={picker === 'from'} onClose={() => setPicker(null)}
        value={from} onChange={setFrom} mode="from" dark={dark} accent={accent}
      />
      <AddressSheet
        open={picker === 'to'} onClose={() => setPicker(null)}
        value={to} onChange={setTo} mode="to" dark={dark} accent={accent}
      />
    </div>
  );
}

window.FeedScreen = FeedScreen;
