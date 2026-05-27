// ─────────────────────────────────────────────────────────────
// Create ride, my rides, confirm, onboarding, support, notif, admin
// ─────────────────────────────────────────────────────────────

function CreateRideScreen({ dark, accent, onBack, onDone }) {
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  const text = dark ? '#fff' : '#15191F';
  const [form, setForm] = React.useState({ from: 'home', to: 'center', when: 'now30', price: 200, seats: 2, recurring: false, days: ['mon','tue','wed','thu','fri'], comment: '' });
  const setF = (k, v) => setForm({ ...form, [k]: v });

  return (
    <div>
      <PageHeader title="Новая поездка" dark={dark} accent={accent} leading={<IconButton name="x" dark={dark} onClick={onBack}/>}/>
      <div style={{ padding: '12px 16px 120px' }}>
        <Card dark={dark} padding={16} radius={18} style={{ marginBottom: 12 }}>
          <Field label="Откуда" dark={dark}>
            <PlacePicker value={form.from} onChange={v => setF('from', v)} dark={dark} accent={accent}/>
          </Field>
          <Divider dark={dark}/>
          <Field label="Куда" dark={dark}>
            <PlacePicker value={form.to} onChange={v => setF('to', v)} dark={dark} accent={accent} exclude={['home']} preset/>
          </Field>
        </Card>

        <Card dark={dark} padding={16} radius={18} style={{ marginBottom: 12 }}>
          <Field label="Когда" dark={dark}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { id: 'now30', label: 'Через 30 мин' },
                { id: 'now60', label: 'Через час' },
                { id: 'evening', label: 'Сегодня вечером' },
                { id: 'tomorrow', label: 'Завтра' },
                { id: 'custom', label: 'Выбрать…' },
              ].map(o => {
                const a = form.when === o.id;
                return (
                  <button key={o.id} onClick={() => setF('when', o.id)} style={{
                    padding: '8px 12px', borderRadius: 999, border: 'none',
                    background: a ? accent : (dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8'),
                    color: a ? '#fff' : text, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  }}>{o.label}</button>
                );
              })}
            </div>
          </Field>
        </Card>

        <Card dark={dark} padding={16} radius={18} style={{ marginBottom: 12 }}>
          <Field label="Цена" dark={dark}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="number" value={form.price} onChange={e => setF('price', +e.target.value)} style={{
                flex: 1, height: 44, borderRadius: 12, border: 'none', padding: '0 14px',
                background: dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8', color: text,
                fontSize: 16, fontFamily: 'inherit', outline: 'none',
              }}/>
              <span style={{ fontSize: 15, fontWeight: 600, color: text }}>₽</span>
              <button onClick={() => setF('price', 0)} style={{ padding: '8px 12px', borderRadius: 10, border: 'none', background: dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8', color: text, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Бесплатно</button>
            </div>
          </Field>
          <Divider dark={dark}/>
          <Field label="Мест" dark={dark}>
            <Stepper value={form.seats} onChange={v => setF('seats', v)} min={1} max={4} dark={dark} accent={accent}/>
          </Field>
        </Card>

        <Card dark={dark} padding={16} radius={18} style={{ marginBottom: 12 }}>
          <Toggle label="Регулярная поездка" sub="Будет публиковаться по расписанию" value={form.recurring} onChange={v => setF('recurring', v)} dark={dark} accent={accent}/>
          {form.recurring && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #EDF1F5' }}>
              <div style={{ fontSize: 12, color: sub, fontWeight: 600, marginBottom: 8 }}>Дни недели</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['пн','вт','ср','чт','пт','сб','вс'].map((d, i) => {
                  const ids = ['mon','tue','wed','thu','fri','sat','sun'];
                  const a = form.days.includes(ids[i]);
                  return (
                    <button key={d} onClick={() => setF('days', a ? form.days.filter(x => x !== ids[i]) : [...form.days, ids[i]])} style={{
                      flex: 1, height: 38, borderRadius: 10, border: 'none',
                      background: a ? accent : (dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8'),
                      color: a ? '#fff' : text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}>{d}</button>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <Card dark={dark} padding={16} radius={18}>
          <Field label="Комментарий" dark={dark} optional>
            <textarea value={form.comment} onChange={e => setF('comment', e.target.value)} placeholder="Например: без багажа, не курю" maxLength={200} style={{
              width: '100%', minHeight: 70, borderRadius: 12, border: 'none', padding: '10px 14px',
              background: dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8', color: text,
              fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'none',
              boxSizing: 'border-box',
            }}/>
            <div style={{ fontSize: 11, color: sub, textAlign: 'right', marginTop: 4 }}>{form.comment.length} / 200</div>
          </Field>
        </Card>
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '12px 16px', background: dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderTop: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.05)',
        zIndex: 30,
      }}>
        <Button kind="primary" size="lg" full accent={accent} icon="check" onClick={onDone}>Опубликовать поездку</Button>
      </div>
    </div>
  );
}

function Field({ label, optional, children, dark }) {
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  return (
    <div>
      <div style={{ fontSize: 12, color: sub, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
        {label} {optional && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· необязательно</span>}
      </div>
      {children}
    </div>
  );
}
function Divider({ dark }) {
  return <div style={{ height: 1, background: dark ? 'rgba(255,255,255,0.06)' : '#EDF1F5', margin: '14px 0' }}/>;
}
function Stepper({ value, onChange, min = 1, max = 9, dark, accent }) {
  const text = dark ? '#fff' : '#15191F';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button onClick={() => onChange(Math.max(min, value - 1))} style={{ width: 44, height: 44, borderRadius: 12, border: 'none', background: dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8', color: text, cursor: 'pointer', fontFamily: 'inherit' }}><Icon name="minus" size={18}/></button>
      <div style={{ flex: 1, textAlign: 'center', fontSize: 22, fontWeight: 700, color: text }}>{value}</div>
      <button onClick={() => onChange(Math.min(max, value + 1))} style={{ width: 44, height: 44, borderRadius: 12, border: 'none', background: accent, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}><Icon name="plus" size={18}/></button>
    </div>
  );
}
function PlacePicker({ value, onChange, dark, accent, exclude = [], preset }) {
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  const text = dark ? '#fff' : '#15191F';
  const cur = placeById(value);
  const list = Object.values(PLACES).filter(p => !exclude.includes(p.id));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8', marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cur.color }}/>
        <span style={{ flex: 1, fontSize: 15, color: text, fontWeight: 500 }}>{cur.label}</span>
        <Icon name="chevron-d" size={16} style={{ color: sub }}/>
      </div>
      {preset && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {list.slice(0, 5).map(p => {
            const a = value === p.id;
            return (
              <button key={p.id} onClick={() => onChange(p.id)} style={{
                padding: '6px 10px', borderRadius: 999, border: 'none',
                background: a ? accent : (dark ? 'rgba(255,255,255,0.07)' : '#fff'),
                color: a ? '#fff' : text, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: !a && !dark ? 'inset 0 0 0 1px #E2E6EC' : 'none',
              }}>{p.short}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}

window.CreateRideScreen = CreateRideScreen;
