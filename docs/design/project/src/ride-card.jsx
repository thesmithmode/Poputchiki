// ─────────────────────────────────────────────────────────────
// RideCard — address-first compact card with match badge.
// variants: compact (default, no map), default, hero (with mini map)
// ─────────────────────────────────────────────────────────────
function RideCard({ ride, variant = 'compact', density = 'roomy', showMap = false, dark, accent, match, onClick }) {
  const driver = userById(ride.driver);
  const fromP = pointById(ride.from_house);
  const toP = pointById(ride.to);
  const t = formatTime(ride.in_min);
  const isNew = driver.badges?.includes('new');
  const seatsLeft = ride.seats_total - ride.seats_taken;
  const sub = dark ? 'rgba(235,235,245,0.55)' : '#7C8694';
  const text = dark ? '#fff' : '#15191F';

  const priceLabel = ride.price === 'free' ? 'бесплатно' : `${ride.price} ₽`;

  // ── HERO variant — full bleed map at top
  if (variant === 'hero') {
    return (
      <Card dark={dark} padding={0} radius={20} onClick={onClick} style={{ overflow: 'hidden' }}>
        <MapPreview from={ride.from_house} to={ride.to} height={130} accent={accent} dark={dark}/>
        <div style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Avatar user={driver} size={38}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: text }}>{driver.short}</span>
                {isNew && <NewBadge dark={dark}/>}
                {driver.fav && <Icon name="heart-fill" size={12} style={{ color: '#E54E5C' }}/>}
              </div>
              <div style={{ fontSize: 11.5, color: sub, marginTop: 1 }}>
                {driver.rating > 0 ? <>★ {driver.rating} · {driver.reviews} отз.</> : 'без отзывов'}
              </div>
            </div>
            <LikesPill count={driver.likes} accent={accent} dark={dark}/>
          </div>
          <RouteBlock fromP={fromP} toP={toP} dark={dark} accent={accent} compact/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 10, borderTop: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #EDF1F5' }}>
            {match && <MatchBadge result={match} dark={dark} accent={accent}/>}
            <span style={{ fontSize: 12.5, color: sub, fontWeight: 500 }}><Icon name="clock" size={11}/> {t.time}</span>
            <div style={{ flex: 1 }}/>
            <div style={{ fontSize: 16, fontWeight: 700, color: text, letterSpacing: -0.3 }}>{priceLabel}</div>
            <div style={{ fontSize: 11, color: seatsLeft === 0 ? '#E54E5C' : sub }}>· {seatsLeft === 0 ? 'нет мест' : `${seatsLeft} м.`}</div>
          </div>
        </div>
      </Card>
    );
  }

  // ── DEFAULT variant — slightly bigger compact, optional map
  if (variant === 'default') {
    return (
      <Card dark={dark} padding={14} radius={16} onClick={onClick}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Avatar user={driver} size={40}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: text }}>{driver.short}</span>
              {isNew && <NewBadge dark={dark}/>}
              {driver.fav && <Icon name="heart-fill" size={11} style={{ color: '#E54E5C' }}/>}
              {ride.recurring && <Icon name="repeat" size={11} style={{ color: accent }}/>}
            </div>
            <div style={{ fontSize: 11.5, color: sub, marginTop: 2 }}>
              {driver.rating > 0
                ? <>★ {driver.rating} · {driver.rides} поездок</>
                : <>новый участник</>}
            </div>
          </div>
          <LikesPill count={driver.likes} accent={accent} dark={dark}/>
        </div>

        <RouteBlock fromP={fromP} toP={toP} dark={dark} accent={accent}/>

        {showMap && (
          <div style={{ marginTop: 10 }}>
            <MapPreview from={ride.from_house} to={ride.to} height={88} accent={accent} dark={dark}/>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 10, borderTop: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #EDF1F5' }}>
          {match ? <MatchBadge result={match} dark={dark} accent={accent}/> : null}
          <span style={{ fontSize: 12.5, color: sub, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="clock" size={11}/>{t.time}
          </span>
          <div style={{ flex: 1 }}/>
          <div style={{ fontSize: 11.5, color: seatsLeft === 0 ? '#E54E5C' : sub }}>{seatsLeft === 0 ? 'нет мест' : `${seatsLeft} м.`}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: text, letterSpacing: -0.3 }}>{priceLabel}</div>
        </div>
      </Card>
    );
  }

  // ── COMPACT (default look) — address-first, no map
  return (
    <Card dark={dark} padding={12} radius={14} onClick={onClick}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Avatar user={driver} size={36}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{driver.short}</span>
            {isNew && <NewBadge dark={dark}/>}
            {driver.fav && <Icon name="heart-fill" size={11} style={{ color: '#E54E5C' }}/>}
            {ride.recurring && <Icon name="repeat" size={11} style={{ color: accent }}/>}
            <span style={{ flex: 1 }}/>
            <LikesPill count={driver.likes} size="sm" accent={accent} dark={dark}/>
          </div>

          <RouteBlock fromP={fromP} toP={toP} dark={dark} accent={accent} compact/>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            {match && <MatchBadge result={match} dark={dark} accent={accent}/>}
            <span style={{ fontSize: 12, color: sub, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Icon name="clock" size={10}/>{t.time}
            </span>
            <div style={{ flex: 1 }}/>
            <span style={{ fontSize: 11.5, color: seatsLeft === 0 ? '#E54E5C' : sub, fontWeight: 500 }}>{seatsLeft === 0 ? 'нет мест' : `${seatsLeft} м.`}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: text, letterSpacing: -0.3 }}>{priceLabel}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// Two-line route summary used inside cards
function RouteBlock({ fromP, toP, dark, accent, compact = false }) {
  const text = dark ? '#fff' : '#15191F';
  const sub = dark ? 'rgba(235,235,245,0.55)' : '#7C8694';
  const fontMain = compact ? 12.5 : 13.5;
  const fontSub = compact ? 11 : 11.5;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4, flexShrink: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: fromP?.color || '#3D6B8A' }}/>
          <span style={{ width: 1.5, height: compact ? 12 : 16, background: dark ? 'rgba(255,255,255,0.15)' : '#D8DEE6', marginTop: 2 }}/>
          <Icon name="pin" size={compact ? 10 : 11} style={{ color: toP?.color || '#7C8694', marginTop: 2 }}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: fontMain, color: text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
            {fromP?.short || fromP?.label}
          </div>
          {fromP?.kind === 'house' && (
            <div style={{ fontSize: fontSub, color: sub, marginTop: 1, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fromP.street}
            </div>
          )}
          {fromP?.kind !== 'house' && <div style={{ height: compact ? 4 : 8 }}/>}
          <div style={{ fontSize: fontMain, color: text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
            {toP?.name || toP?.label}
          </div>
          {toP?.addr && (
            <div style={{ fontSize: fontSub, color: sub, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {toP.addr}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.RideCard = RideCard;
window.RouteBlock = RouteBlock;
