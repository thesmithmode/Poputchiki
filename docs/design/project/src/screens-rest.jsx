// ─────────────────────────────────────────────────────────────
// Remaining screens: my rides, confirm, onboarding, support, notif, admin
// ─────────────────────────────────────────────────────────────

function MyRidesScreen({ dark, accent, me, onOpenRide, onOpenSupport, onOpenAdmin, isAdmin }) {
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  const text = dark ? '#fff' : '#15191F';
  const isNew = me.badges?.includes('new');
  const myRides = isNew ? [] : [RIDES[0], RIDES[8]];

  return (
    <div>
      <PageHeader large title="Мой профиль" dark={dark} accent={accent}
        trailing={<IconButton name="sliders" dark={dark}/>}
      />
      <div style={{ padding: '12px 16px 24px' }}>
        <Card dark={dark} padding={16} radius={20} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar user={me} size={56}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 17, fontWeight: 600, color: text }}>{me.name}</span>
                {isNew && <NewBadge dark={dark}/>}
              </div>
              <div style={{ fontSize: 12.5, color: sub, marginTop: 3 }}>{me.apt}</div>
            </div>
            <Icon name="edit" size={18} style={{ color: sub }}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 16, paddingTop: 14, borderTop: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #EDF1F5' }}>
            <BigStat value={me.likes} label="лайков" big accent={accent} dark={dark}/>
            <BigStat value={me.rating > 0 ? me.rating : '—'} label={`из ${me.reviews} отз.`} dark={dark}/>
            <BigStat value={me.rides} label="поездок" dark={dark}/>
          </div>
        </Card>

        {isNew && (
          <Card dark={dark} padding={14} radius={14} style={{ marginBottom: 14, background: dark ? 'rgba(217,161,60,0.08)' : '#FFF6E0' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <Icon name="shield" size={18} style={{ color: '#D9A13C', marginTop: 1 }}/>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: dark ? '#E8B860' : '#8A6420' }}>Новый аккаунт · 5 дней до полного доступа</div>
                <div style={{ fontSize: 12.5, color: dark ? 'rgba(232,184,96,0.8)' : '#A07530', marginTop: 4, lineHeight: 1.45 }}>
                  Пока можно публиковать 1 поездку. После 7 дней или 1 лайка — без ограничений.
                </div>
              </div>
            </div>
          </Card>
        )}

        <SectionTitle dark={dark}>Активные поездки</SectionTitle>
        {myRides.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {myRides.map(r => <RideCard key={r.id} ride={r} variant="compact" dark={dark} accent={accent} onClick={() => onOpenRide(r.id)}/>)}
          </div>
        ) : (
          <Card dark={dark} padding={20} radius={14} style={{ marginBottom: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: sub }}>Нет активных поездок</div>
          </Card>
        )}

        <SectionTitle dark={dark}>Меню</SectionTitle>
        <Card dark={dark} padding={0} radius={16}>
          <MenuRow icon="repeat" label="Шаблоны регулярных рейсов" detail="2" dark={dark} accent={accent}/>
          <MenuRow icon="heart" label="Избранные водители" detail="3" dark={dark} accent={accent}/>
          <MenuRow icon="bell" label="Уведомления" dark={dark} accent={accent}/>
          <MenuRow icon="support" label="Поддержка" dark={dark} accent={accent} onClick={onOpenSupport}/>
          {isAdmin && <MenuRow icon="shield" label="Админ-дашборд" dark={dark} accent={accent} onClick={onOpenAdmin} highlight/>}
          <MenuRow icon="x" label="Выйти" dark={dark} accent={accent} last/>
        </Card>
      </div>
    </div>
  );
}

function SectionTitle({ children, dark }) {
  return <div style={{ fontSize: 12, color: dark ? 'rgba(235,235,245,0.55)' : '#7C8694', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, padding: '4px 4px 8px' }}>{children}</div>;
}
function MenuRow({ icon, label, detail, dark, accent, last, highlight, onClick }) {
  const text = dark ? '#fff' : '#15191F';
  const sub = dark ? 'rgba(235,235,245,0.55)' : '#7C8694';
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: last ? 'none' : (dark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #EDF1F5'), cursor: onClick ? 'pointer' : 'default' }}>
      <Icon name={icon} size={18} style={{ color: highlight ? accent : (dark ? '#fff' : '#5B6573') }}/>
      <span style={{ flex: 1, fontSize: 15, color: highlight ? accent : text, fontWeight: highlight ? 600 : 500 }}>{label}</span>
      {detail && <span style={{ fontSize: 13, color: sub }}>{detail}</span>}
      <Icon name="chevron-r" size={15} style={{ color: sub }}/>
    </div>
  );
}

// CONFIRM PARTICIPATION — also has rate/like stage
function ConfirmScreen({ dark, accent, onBack, onDone }) {
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  const text = dark ? '#fff' : '#15191F';
  const driver = userById('u3');
  const ride = RIDES[1];
  const [step, setStep] = React.useState(1);
  const [rating, setRating] = React.useState(0);
  const [liked, setLiked] = React.useState(false);
  const [reviewText, setReviewText] = React.useState('');

  return (
    <div>
      <PageHeader title="Подтверждение" dark={dark} accent={accent} leading={<IconButton name="x" dark={dark} onClick={onBack}/>}/>

      <div style={{ padding: '20px 16px 100px' }}>
        {step === 1 && <>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: `${accent}1A`, color: accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Icon name="clock" size={32}/>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: text, marginBottom: 6 }}>Поездка состоялась?</div>
            <div style={{ fontSize: 14, color: sub, lineHeight: 1.45, padding: '0 24px' }}>Подтвердите, чтобы оставить отзыв и лайк водителю.</div>
          </div>
          <Card dark={dark} padding={14} radius={16} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar user={driver} size={44}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: text }}>{driver.short}</div>
                <div style={{ fontSize: 12, color: sub, marginTop: 2 }}>{placeById(ride.from).short} → {placeById(ride.to).short} · сегодня в 09:15</div>
              </div>
            </div>
          </Card>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button kind="secondary" size="lg" full dark={dark} accent={accent}>Не состоялась</Button>
            <Button kind="primary" size="lg" full accent={accent} icon="check" onClick={() => setStep(2)}>Да, ездили</Button>
          </div>
        </>}

        {step === 2 && <>
          <div style={{ textAlign: 'center', padding: '12px 0 18px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: text, marginBottom: 6 }}>Как прошла поездка?</div>
            <div style={{ fontSize: 13, color: sub }}>Поставьте лайк и оставьте отзыв</div>
          </div>
          <Card dark={dark} padding={20} radius={18} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <Avatar user={driver} size={48}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: text }}>{driver.short}</div>
                <div style={{ fontSize: 12, color: sub }}>{driver.likes} лайков</div>
              </div>
              <button onClick={() => setLiked(!liked)} style={{
                width: 56, height: 44, borderRadius: 14, border: 'none',
                background: liked ? accent : (dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8'),
                color: liked ? '#fff' : (dark ? '#fff' : '#15191F'),
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              }}>
                <Icon name={liked ? 'thumb-fill' : 'thumb'} size={16}/>
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
              {[1,2,3,4,5].map(i => (
                <button key={i} onClick={() => setRating(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <Icon name={i <= rating ? 'star-fill' : 'star'} size={32} style={{ color: i <= rating ? '#F5A623' : (dark ? 'rgba(255,255,255,0.2)' : '#D8DEE6') }}/>
                </button>
              ))}
            </div>
            <textarea value={reviewText} onChange={e => setReviewText(e.target.value)} placeholder="Расскажите, как прошло (необязательно)" maxLength={300} style={{
              width: '100%', minHeight: 80, borderRadius: 12, border: 'none', padding: '10px 14px',
              background: dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8', color: text,
              fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box',
            }}/>
          </Card>
        </>}
      </div>

      {step === 2 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 16px', background: dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.05)', zIndex: 30 }}>
          <Button kind="primary" size="lg" full accent={accent} icon="check" onClick={onDone}>Отправить</Button>
        </div>
      )}
    </div>
  );
}

function NotifScreen({ dark, accent }) {
  const text = dark ? '#fff' : '#15191F';
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  return (
    <div>
      <PageHeader large title="События" subtitle="3 новых уведомления" dark={dark} accent={accent}
        trailing={<IconButton name="sliders" dark={dark}/>}/>
      <div style={{ padding: '8px 16px 24px' }}>
        {NOTIFS.map(n => {
          const actor = n.actor ? userById(n.actor) : null;
          return (
            <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 4px', borderBottom: dark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #EDF1F5', position: 'relative' }}>
              {n.unread && <div style={{ position: 'absolute', left: -10, top: 22, width: 6, height: 6, borderRadius: '50%', background: accent }}/>}
              {actor ? <Avatar user={actor} size={40}/> : (
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent }}>
                  <Icon name="bell" size={18}/>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: text, lineHeight: 1.4 }}>
                  {actor && <span style={{ fontWeight: 600 }}>{actor.short} </span>}
                  <span>{n.text}</span>
                </div>
                <div style={{ fontSize: 12, color: sub, marginTop: 4 }}>{n.when}</div>
                {n.type === 'confirm_participation' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <Button kind="primary" size="sm" accent={accent}>Подтвердить</Button>
                    <Button kind="secondary" size="sm" dark={dark}>Не ездили</Button>
                  </div>
                )}
                {n.type === 'ride_request' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <Button kind="primary" size="sm" accent={accent}>Принять</Button>
                    <Button kind="secondary" size="sm" dark={dark}>Отклонить</Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OnboardingScreen({ dark, accent, onDone }) {
  const text = dark ? '#fff' : '#15191F';
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  const [step, setStep] = React.useState(0);
  const steps = [
    { icon: 'logo', title: 'Попутчики Царёво', text: 'Структурированный поиск попутчиков для жителей нашего ЖК. Без потерянных сообщений и анонимных таксистов.' },
    { icon: 'shield', title: 'Доверие через лайки', text: 'У каждого участника — счётчик лайков от соседей. Фильтруйте поездки по возрасту аккаунта и количеству лайков.' },
    { icon: 'tg', title: 'Авторизация Telegram', text: 'Войдите через свой Telegram-аккаунт. Имя и фото подгрузятся автоматически.' },
  ];
  const cur = steps[step];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '40px 24px 24px' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ width: 96, height: 96, borderRadius: 28, background: `${accent}14`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
          <Icon name={cur.icon} size={48}/>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: text, letterSpacing: -0.5, marginBottom: 12 }}>{cur.title}</div>
        <div style={{ fontSize: 15, color: sub, lineHeight: 1.5, padding: '0 8px' }}>{cur.text}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
        {steps.map((_, i) => (
          <div key={i} style={{ width: i === step ? 24 : 6, height: 6, borderRadius: 3, background: i === step ? accent : (dark ? 'rgba(255,255,255,0.18)' : '#D8DEE6'), transition: 'width 0.2s' }}/>
        ))}
      </div>
      <Button kind="primary" size="lg" full accent={accent} onClick={() => step < steps.length - 1 ? setStep(step + 1) : onDone()}>
        {step < steps.length - 1 ? 'Дальше' : 'Войти через Telegram'}
      </Button>
      {step < steps.length - 1 && (
        <button onClick={onDone} style={{ marginTop: 12, background: 'transparent', border: 'none', color: sub, fontSize: 14, padding: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Пропустить</button>
      )}
    </div>
  );
}

function SupportScreen({ dark, accent, onBack }) {
  const text = dark ? '#fff' : '#15191F';
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  const [text2, setText2] = React.useState('');
  return (
    <div>
      <PageHeader title="Поддержка" dark={dark} accent={accent} leading={<IconButton name="chevron-l" dark={dark} onClick={onBack}/>}/>
      <div style={{ padding: '12px 16px 24px' }}>
        <Card dark={dark} padding={16} radius={16} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Новое обращение</div>
          <textarea value={text2} onChange={e => setText2(e.target.value)} placeholder="Опишите вопрос или проблему. Админ ответит в Telegram." maxLength={2000} style={{
            width: '100%', minHeight: 100, borderRadius: 12, border: 'none', padding: '10px 14px',
            background: dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8', color: text,
            fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: 10,
          }}/>
          <Button kind="primary" size="md" full accent={accent} icon="send">Отправить</Button>
        </Card>

        <SectionTitle dark={dark}>Мои обращения</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SUPPORT_THREADS.map(t => (
            <Card key={t.id} dark={dark} padding={14} radius={14}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: text }}>{t.subject}</div>
                <div style={{ fontSize: 11, color: sub }}>{t.when}</div>
              </div>
              <div style={{ fontSize: 12.5, color: sub, lineHeight: 1.4 }}>{t.last}</div>
              <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 999, background: dark ? 'rgba(255,255,255,0.05)' : '#F1F4F8', fontSize: 11, color: sub, fontWeight: 500 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.status === 'replied' ? '#4DAB6E' : sub }}/>
                {t.status === 'replied' ? 'Отвечено' : 'Закрыто'}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminScreen({ dark, accent, onBack }) {
  const text = dark ? '#fff' : '#15191F';
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  return (
    <div>
      <PageHeader title="Админ" subtitle="Anton · @thesmithmode" dark={dark} accent={accent} leading={<IconButton name="chevron-l" dark={dark} onClick={onBack}/>}/>
      <div style={{ padding: '12px 16px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <KPI label="MAU" value="142" trend="+8" accent={accent} dark={dark}/>
          <KPI label="Активных поездок" value="9" trend="+3" accent={accent} dark={dark}/>
          <KPI label="Match rate" value="74%" trend="+2%" accent={accent} dark={dark}/>
          <KPI label="Жалоб (7д)" value="2" trend="0" warn dark={dark}/>
        </div>

        <SectionTitle dark={dark}>Очередь жалоб · 2</SectionTitle>
        <Card dark={dark} padding={14} radius={14} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Avatar user={USERS[5]} size={32}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: text }}>Жалоба на {USERS[5].short}</div>
              <div style={{ fontSize: 11.5, color: sub }}>1 жалоба · «спам»</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button kind="secondary" size="sm" dark={dark}>Открыть</Button>
            <Button kind="danger" size="sm" icon="x">Бан</Button>
            <Button kind="ghost" size="sm" dark={dark}>Отклонить</Button>
          </div>
        </Card>

        <SectionTitle dark={dark}>Поддержка · 1 открыта</SectionTitle>
        <Card dark={dark} padding={14} radius={14} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Avatar user={USERS[0]} size={32}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: text }}>Не приходят пуши</div>
              <div style={{ fontSize: 11.5, color: sub }}>от {USERS[0].short} · 5 мин назад</div>
            </div>
          </div>
          <Button kind="primary" size="sm" accent={accent} icon="send">Ответить</Button>
        </Card>

        <SectionTitle dark={dark}>Система</SectionTitle>
        <Card dark={dark} padding={0} radius={14}>
          <SysRow label="Бэкап БД" value="OK · 2 ч назад" ok dark={dark}/>
          <SysRow label="Restore drill" value="OK · 4 дня назад" ok dark={dark}/>
          <SysRow label="Supabase quota" value="22% / 500MB" ok dark={dark}/>
          <SysRow label="p95 latency" value="143ms" ok last dark={dark}/>
        </Card>
      </div>
    </div>
  );
}
function KPI({ label, value, trend, accent, warn, dark }) {
  const text = dark ? '#fff' : '#15191F';
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  return (
    <Card dark={dark} padding={14} radius={14}>
      <div style={{ fontSize: 11.5, color: sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: text, letterSpacing: -0.5 }}>{value}</div>
        {trend && <div style={{ fontSize: 12, color: warn ? '#E54E5C' : '#4DAB6E', fontWeight: 600 }}>{trend}</div>}
      </div>
    </Card>
  );
}
function SysRow({ label, value, ok, last, dark }) {
  const text = dark ? '#fff' : '#15191F';
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: last ? 'none' : (dark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #EDF1F5') }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? '#4DAB6E' : '#E54E5C' }}/>
      <span style={{ flex: 1, fontSize: 13.5, color: text }}>{label}</span>
      <span style={{ fontSize: 12.5, color: sub }}>{value}</span>
    </div>
  );
}

Object.assign(window, { MyRidesScreen, ConfirmScreen, NotifScreen, OnboardingScreen, SupportScreen, AdminScreen });
