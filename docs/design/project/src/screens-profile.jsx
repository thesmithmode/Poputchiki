// ─────────────────────────────────────────────────────────────
// Profile screen — public profile for any user (driver or passenger)
// ─────────────────────────────────────────────────────────────
function ProfileScreen({ userId, dark, accent, onBack, onOpenRide }) {
  const u = userById(userId);
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  const text = dark ? '#fff' : '#15191F';
  const isNew = u.badges?.includes('new');
  const stats = publicStats(u);
  const schedule = scheduleForDriver(userId);
  const drives = RIDES.filter(r => r.driver === userId);
  const reviews = REVIEWS_BY_USER[userId] || [];
  const isDriver = drives.length > 0 || u.car;

  const [tab, setTab] = React.useState(schedule.length ? 'schedule' : 'reviews');
  const [favorited, setFavorited] = React.useState(u.fav);
  const [liked, setLiked] = React.useState(false);

  const tabs = [];
  if (schedule.length) tabs.push({ id: 'schedule', label: 'Расписание', count: schedule.length });
  tabs.push({ id: 'reviews', label: 'Отзывы', count: reviews.length });
  tabs.push({ id: 'rides',   label: 'Поездки', count: drives.length });
  tabs.push({ id: 'about',   label: 'О себе' });

  return (
    <div>
      <PageHeader
        title="Профиль"
        dark={dark} accent={accent}
        leading={<IconButton name="chevron-l" dark={dark} onClick={onBack}/>}
        trailing={<>
          <IconButton name="flag" dark={dark} size={36}/>
          <IconButton name={favorited ? 'heart-fill' : 'heart'} dark={dark} size={36} onClick={() => setFavorited(!favorited)}/>
        </>}
      />

      {/* Hero */}
      <div style={{ padding: '12px 16px 0', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Avatar user={u} size={84}/>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: text, letterSpacing: -0.3 }}>{u.name}</span>
          {isNew && <NewBadge dark={dark}/>}
        </div>
        <div style={{ fontSize: 13, color: sub, marginTop: 4 }}>
          ЖК Царёво · кв. {u.apt}{isDriver && u.car && ` · ${u.car}`}
        </div>

        {/* Role tag */}
        <div style={{ display: 'inline-flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 999,
            background: dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8',
            color: text, fontSize: 11.5, fontWeight: 600,
          }}>
            <Icon name={isDriver ? 'wallet' : 'user'} size={11} style={{ color: accent }}/>
            {isDriver ? 'Водитель и пассажир' : 'Пассажир'}
          </span>
        </div>

        {/* Big numbers row */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginTop: 18 }}>
          <BigStat value={u.likes} label="лайков" big accent={accent} dark={dark}/>
          <BigStat value={u.rating > 0 ? u.rating : '—'} label={u.reviews > 0 ? `из ${u.reviews} отз.` : 'нет отзывов'} dark={dark}/>
          <BigStat value={u.rides} label="поездок" dark={dark}/>
        </div>

        {/* Trust callout */}
        {isNew && (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: dark ? 'rgba(217,161,60,0.12)' : '#FFF6E0', color: dark ? '#E8B860' : '#8A6420', fontSize: 13, lineHeight: 1.4, textAlign: 'left', display: 'flex', gap: 10 }}>
            <Icon name="shield" size={16}/>
            <div>Этот участник зарегистрировался недавно. У него ещё нет отзывов и завершённых поездок.</div>
          </div>
        )}
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 8, padding: '20px 16px 0' }}>
        <div style={{ flex: 1 }}>
          <Button kind="primary" size="md" full accent={accent} icon="tg">Написать</Button>
        </div>
        <button onClick={() => setLiked(!liked)} style={{
          height: 40, padding: '0 14px', borderRadius: 12,
          background: liked ? `${accent}` : (dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8'),
          color: liked ? '#fff' : (dark ? '#fff' : text),
          border: 'none', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
        }}>
          <Icon name={liked ? 'thumb-fill' : 'thumb'} size={14}/>
          {liked ? 'Лайк' : 'Лайк'}
        </button>
      </div>

      {/* Public stats grid */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ background: dark ? '#1C1C1E' : '#fff', borderRadius: 14, padding: 12,
          boxShadow: dark ? 'none' : '0 1px 1px rgba(20, 30, 50, 0.04)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 8px' }}>
          <MiniStat icon="check" label="Состоявшихся" value={`${stats.completionPct}%`} accent={accent} dark={dark} good={stats.completionPct >= 90}/>
          <MiniStat icon="clock" label="Отвечает за" value={`~${stats.responseMin} мин`} accent={accent} dark={dark}/>
          <MiniStat icon="user"  label="В сервисе" value={stats.memberSince} accent={accent} dark={dark}/>
          <MiniStat icon="repeat" label="Регулярных" value={stats.recurring} accent={accent} dark={dark}/>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #EDF1F5', margin: '20px 16px 0', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '11px 4px', background: 'transparent', border: 'none', cursor: 'pointer',
            color: tab === t.id ? (dark ? '#fff' : text) : sub,
            fontSize: 13.5, fontWeight: tab === t.id ? 600 : 500,
            borderBottom: tab === t.id ? `2px solid ${accent}` : '2px solid transparent',
            marginBottom: -1, fontFamily: 'inherit', flexShrink: 0, minWidth: 'fit-content', whiteSpace: 'nowrap',
            display: 'inline-flex', gap: 6, alignItems: 'center',
          }}>
            {t.label}
            {typeof t.count === 'number' && t.count > 0 && (
              <span style={{ fontSize: 11, color: tab === t.id ? accent : sub, fontWeight: 600 }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: '14px 16px 28px' }}>
        {tab === 'schedule' && (
          <ScheduleTab schedule={schedule} drives={drives} dark={dark} accent={accent} onOpenRide={onOpenRide}/>
        )}
        {tab === 'reviews' && (
          reviews.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <RatingDistribution reviews={reviews} dark={dark} accent={accent}/>
              {reviews.map(r => <ReviewCard key={r.id} review={r} dark={dark} sub={sub} text={text}/>)}
            </div>
          ) : (
            <EmptyState dark={dark} icon="star" text="Пока нет отзывов"/>
          )
        )}
        {tab === 'rides' && (
          drives.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {drives.map(r => (
                <RideCard key={r.id} ride={r} variant="compact" dark={dark} accent={accent} onClick={onOpenRide ? () => onOpenRide(r.id) : null}/>
              ))}
            </div>
          ) : (
            <EmptyState dark={dark} icon="map" text="Нет активных поездок как водитель"/>
          )
        )}
        {tab === 'about' && (
          <Card dark={dark} padding={16} radius={14}>
            <div style={{ fontSize: 14, color: text, lineHeight: 1.5 }}>
              {userId === 'u1' ? 'Каждое утро в 8:30 еду в офис на ул. Баумана. Готов взять 1–2 попутчиков по пути. Не курю, без музыки на полную, всегда вовремя.'
                : userId === 'u4' ? 'Часто езжу в аэропорт и ТРЦ МЕГА. По пути могу заехать на метро Дубравная.'
                : userId === 'u3' ? 'Студент КАИ. По будням езжу в универ через метро Дубравная.'
                : userId === 'u7' ? 'Регулярно езжу в Иннополис. Можно с багажом.'
                : 'Информация не указана.'}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// Schedule tab — recurring weekly + one-off list
function ScheduleTab({ schedule, drives, dark, accent, onOpenRide }) {
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  const text = dark ? '#fff' : '#15191F';
  const oneoffs = drives.filter(r => !r.recurring);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {schedule.length > 0 && (
        <div>
          <SectionTitle dark={dark}>Регулярные поездки · Пн–Пт</SectionTitle>
          <Card dark={dark} padding={0} radius={14} style={{ overflow: 'hidden' }}>
            {schedule.map((s, i) => (
              <div key={s.id} onClick={onOpenRide ? () => onOpenRide(s.id) : null} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                borderBottom: i === schedule.length - 1 ? 'none' : (dark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #EDF1F5'),
                cursor: onOpenRide ? 'pointer' : 'default',
              }}>
                <div style={{ width: 56, textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: text, letterSpacing: -0.3, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{s.time}</div>
                  <div style={{ fontSize: 10.5, color: sub, marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{s.days}</div>
                </div>
                <div style={{ width: 1, alignSelf: 'stretch', background: dark ? 'rgba(255,255,255,0.06)' : '#EDF1F5' }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: sub, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3D6B8A', flexShrink: 0 }}/>
                    {s.fromShort}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: text, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Icon name="pin" size={11} style={{ color: s.toColor, flexShrink: 0 }}/>
                    {s.toShort}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: text }}>{s.price}</div>
                  <Icon name="chevron-r" size={14} style={{ color: sub, marginTop: 2 }}/>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}
      {oneoffs.length > 0 && (
        <div>
          <SectionTitle dark={dark}>Разовые</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {oneoffs.map(r => (
              <RideCard key={r.id} ride={r} variant="compact" dark={dark} accent={accent} onClick={onOpenRide ? () => onOpenRide(r.id) : null}/>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ dark, children }) {
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  return (
    <div style={{ fontSize: 11.5, color: sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, padding: '4px 4px 8px' }}>{children}</div>
  );
}

function MiniStat({ icon, label, value, accent, dark, good }) {
  const text = dark ? '#fff' : '#15191F';
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: good ? '#4DAB6E1A' : `${accent}1A`,
        color: good ? '#4DAB6E' : accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={icon} size={15}/>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: text, lineHeight: 1.1, letterSpacing: -0.2 }}>{value}</div>
        <div style={{ fontSize: 11, color: sub, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

function ReviewCard({ review, dark, sub, text }) {
  const author = userById(review.author);
  return (
    <Card dark={dark} padding={14} radius={14}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Avatar user={author} size={32}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{author.short}</div>
          <div style={{ fontSize: 11.5, color: sub, marginTop: 1 }}>{review.when}</div>
        </div>
        <div style={{ display: 'flex', gap: 1 }}>
          {[1,2,3,4,5].map(i => (
            <Icon key={i} name={i <= review.rating ? 'star-fill' : 'star'} size={13} style={{ color: i <= review.rating ? '#F5A623' : (dark ? 'rgba(255,255,255,0.2)' : '#D8DEE6') }}/>
          ))}
        </div>
      </div>
      {review.text && <div style={{ fontSize: 13.5, color: text, lineHeight: 1.45 }}>{review.text}</div>}
    </Card>
  );
}

function RatingDistribution({ reviews, dark, accent }) {
  const text = dark ? '#fff' : '#15191F';
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  const counts = [5,4,3,2,1].map(n => ({ n, count: reviews.filter(r => r.rating === n).length }));
  const max = Math.max(...counts.map(c => c.count), 1);
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;

  return (
    <Card dark={dark} padding={14} radius={14}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: text, letterSpacing: -0.5, lineHeight: 1 }}>{avg.toFixed(1)}</div>
          <div style={{ display: 'flex', gap: 1, justifyContent: 'center', marginTop: 6 }}>
            {[1,2,3,4,5].map(i => (
              <Icon key={i} name={i <= Math.round(avg) ? 'star-fill' : 'star'} size={11} style={{ color: '#F5A623' }}/>
            ))}
          </div>
          <div style={{ fontSize: 11, color: sub, marginTop: 4 }}>{reviews.length} отз.</div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {counts.map(c => (
            <div key={c.n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: sub, width: 8, fontWeight: 600 }}>{c.n}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: dark ? 'rgba(255,255,255,0.08)' : '#EDF1F5', overflow: 'hidden' }}>
                <div style={{ width: `${(c.count / max) * 100}%`, height: '100%', background: '#F5A623', borderRadius: 3 }}/>
              </div>
              <span style={{ fontSize: 11, color: sub, width: 16, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.count}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function EmptyState({ dark, icon, text: msg }) {
  const sub = dark ? 'rgba(235,235,245,0.55)' : '#7C8694';
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: sub }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%',
        background: dark ? 'rgba(255,255,255,0.04)' : '#F1F4F8', color: sub,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
        <Icon name={icon} size={20}/>
      </div>
      <div style={{ fontSize: 13.5 }}>{msg}</div>
    </div>
  );
}

function BigStat({ value, label, big, accent, dark }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: big ? 26 : 22, fontWeight: 700, color: big ? accent : (dark ? '#fff' : '#15191F'), letterSpacing: -0.5, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: dark ? 'rgba(235,235,245,0.55)' : '#7C8694', marginTop: 5, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

window.ProfileScreen = ProfileScreen;
