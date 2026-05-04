// ─────────────────────────────────────────────────────────────
// Ride detail screen
// ─────────────────────────────────────────────────────────────
function RideDetailScreen({ rideId, dark, accent, onBack, onOpenProfile, onRespond }) {
  const ride = RIDES.find(r => r.id === rideId);
  if (!ride) return null;
  const driver = userById(ride.driver);
  const fromP = pointById(ride.from_house), toP = pointById(ride.to);
  const t = formatTime(ride.in_min);
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  const text = dark ? '#fff' : '#15191F';
  const seatsLeft = ride.seats_total - ride.seats_taken;
  const isNew = driver.badges?.includes('new');

  const [responded, setResponded] = React.useState(false);
  const [favorited, setFavorited] = React.useState(driver.fav);

  return (
    <div>
      <PageHeader
        title="Поездка"
        dark={dark} accent={accent}
        leading={<IconButton name="chevron-l" dark={dark} onClick={onBack}/>}
        trailing={<>
          <IconButton name="flag" dark={dark} size={36}/>
          <IconButton name={favorited ? 'heart-fill' : 'heart'} dark={dark} size={36} onClick={() => setFavorited(!favorited)}/>
        </>}
      />

      <div style={{ padding: '12px 16px 100px' }}>
        <Card dark={dark} padding={0} radius={20} style={{ overflow: 'hidden', marginBottom: 12 }}>
          <MapPreview from={ride.from_house} to={ride.to} height={180} accent={accent} dark={dark}/>
        </Card>

        <Card dark={dark} padding={18} radius={20} style={{ marginBottom: 12 }}>
          <RouteLine from={ride.from_house} to={ride.to} stops={ride.waypoints} dark={dark} accent={accent}/>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 18, paddingTop: 16, borderTop: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #EDF1F5' }}>
            <Stat label="Отправление" value={t.time} sub={t.rel} dark={dark} accent={accent}/>
            <Stat label="Цена" value={ride.price === 'free' ? 'бесплатно' : `${ride.price} ₽`} sub="за место" dark={dark}/>
            <Stat label="Свободно" value={`${seatsLeft} из ${ride.seats_total}`} sub="мест" dark={dark} highlight={seatsLeft === 0}/>
            <Stat label="Тип" value={ride.recurring ? 'Регулярная' : 'Разовая'} sub={ride.recurring ? 'Пн–Пт' : null} dark={dark}/>
          </div>
        </Card>

        {ride.comment && (
          <Card dark={dark} padding={16} radius={16} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Комментарий</div>
            <div style={{ fontSize: 14, color: text, lineHeight: 1.45 }}>{ride.comment}</div>
          </Card>
        )}

        <div style={{ fontSize: 13, color: sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, padding: '12px 4px 8px' }}>Водитель</div>
        <Card dark={dark} padding={16} radius={18} onClick={() => onOpenProfile(driver.id)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar user={driver} size={52}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: text }}>{driver.name}</span>
                {isNew && <NewBadge dark={dark}/>}
              </div>
              <div style={{ fontSize: 12.5, color: sub, marginTop: 3 }}>{driver.apt}{driver.car && ` · ${driver.car}`}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <LikesPill count={driver.likes} accent={accent} dark={dark}/>
                {driver.rating > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600, color: text }}>
                    <Icon name="star-fill" size={11} style={{ color: '#F5A623' }}/>
                    {driver.rating} <span style={{ color: sub, fontWeight: 500 }}>· {driver.reviews}</span>
                  </span>
                )}
                {driver.completed > 0 && (
                  <span style={{ fontSize: 12, color: sub }}>{Math.round(driver.completed*100)}% состоялось</span>
                )}
              </div>
            </div>
            <Icon name="chevron-r" size={18} style={{ color: sub }}/>
          </div>
        </Card>

        {ride.passengers && ride.passengers.length > 0 && (
          <>
            <div style={{ fontSize: 13, color: sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, padding: '16px 4px 8px' }}>
              Едут с водителем · {ride.passengers.length}
            </div>
            <Card dark={dark} padding={0} radius={16} style={{ overflow: 'hidden' }}>
              {ride.passengers.map((pid, i) => {
                const p = userById(pid);
                if (!p) return null;
                const last = i === ride.passengers.length - 1;
                return (
                  <div key={pid} onClick={() => onOpenProfile(pid)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    borderBottom: last ? 'none' : (dark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #EDF1F5'),
                    cursor: 'pointer',
                  }}>
                    <Avatar user={p} size={36}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: text }}>{p.short}</span>
                        {p.badges?.includes('new') && <NewBadge dark={dark}/>}
                      </div>
                      <div style={{ fontSize: 12, color: sub, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>кв. {p.apt}</span>
                        {p.likes > 0 && <span>· 👍 {p.likes}</span>}
                        {p.rating > 0 && <span>· ★ {p.rating}</span>}
                      </div>
                    </div>
                    <Icon name="chevron-r" size={16} style={{ color: sub, flexShrink: 0 }}/>
                  </div>
                );
              })}
            </Card>
          </>
        )}
      </div>

      {/* Bottom action bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '12px 16px 12px',
        background: dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderTop: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.05)',
        display: 'flex', gap: 8, zIndex: 30,
      }}>
        <Button kind="secondary" size="lg" icon="message" dark={dark} accent={accent} style={{ flex: 1 }}>В Telegram</Button>
        <Button kind="primary" size="lg" full accent={accent} dark={dark} onClick={() => { setResponded(true); onRespond && onRespond(); }} style={{ flex: 1.6 }}>
          {responded ? 'Отклик отправлен ✓' : 'Откликнуться'}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, dark, accent, highlight }) {
  const text = dark ? '#fff' : '#15191F';
  const muted = dark ? 'rgba(235,235,245,0.55)' : '#7C8694';
  return (
    <div>
      <div style={{ fontSize: 11, color: muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: highlight ? '#E54E5C' : text, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

window.RideDetailScreen = RideDetailScreen;
