// ─────────────────────────────────────────────────────────────
// Main App — navigation, state, tweaks panel
// ─────────────────────────────────────────────────────────────
const { useState, useEffect } = React;

const ACCENT_PRESETS = {
  telegram: '#2AABEE',
  warm:     '#D9744C',
  forest:   '#4D8E6E',
  violet:   '#7E5BD9',
  graphite: '#3D4A5C',
};

const DEFAULTS = /*EDITMODE-BEGIN*/{
  "platform": "ios",
  "dark": false,
  "accent": "telegram",
  "density": "roomy",
  "cardVariant": "default",
  "showMap": true,
  "role": "seasoned",
  "trustFiltersOn": false
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(DEFAULTS);
  const accent = ACCENT_PRESETS[tweaks.accent] || ACCENT_PRESETS.telegram;
  const dark = tweaks.dark;
  const platform = tweaks.platform;
  const me = tweaks.role === 'fresh' ? ME_FRESH : ME_SEASONED;
  window.__ME__ = me;

  const [tab, setTab] = useState('feed');
  const [stack, setStack] = useState([]); // modal-like sub-screens
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    direction: 'any',
    maxPrice: 1000,
    minSeats: 1,
    minAge: tweaks.trustFiltersOn ? 7 : 0,
    minLikes: tweaks.trustFiltersOn ? 3 : 0,
    favOnly: false,
  });

  useEffect(() => {
    setFilters(f => ({ ...f, minAge: tweaks.trustFiltersOn ? 7 : 0, minLikes: tweaks.trustFiltersOn ? 3 : 0 }));
  }, [tweaks.trustFiltersOn]);

  const top = stack[stack.length - 1];
  const push = (s) => setStack(prev => [...prev, s]);
  const pop = () => setStack(prev => prev.slice(0, -1));

  // Onboarding overlay (one-time per session)
  const [showOnboard, setShowOnboard] = useState(false);
  useEffect(() => { if (tweaks.role === 'fresh') setShowOnboard(true); }, [tweaks.role]);

  let content;
  if (showOnboard) {
    content = <OnboardingScreen dark={dark} accent={accent} onDone={() => setShowOnboard(false)}/>;
  } else if (top?.kind === 'ride') {
    content = <RideDetailScreen rideId={top.id} dark={dark} accent={accent} onBack={pop} onOpenProfile={(id) => push({ kind: 'profile', id })}/>;
  } else if (top?.kind === 'profile') {
    content = <ProfileScreen userId={top.id} dark={dark} accent={accent} onBack={pop} onOpenRide={(id) => push({ kind: 'ride', id })}/>;
  } else if (top?.kind === 'create') {
    content = <CreateRideScreen dark={dark} accent={accent} onBack={pop} onDone={pop}/>;
  } else if (top?.kind === 'confirm') {
    content = <ConfirmScreen dark={dark} accent={accent} onBack={pop} onDone={pop}/>;
  } else if (top?.kind === 'support') {
    content = <SupportScreen dark={dark} accent={accent} onBack={pop}/>;
  } else if (top?.kind === 'admin') {
    content = <AdminScreen dark={dark} accent={accent} onBack={pop}/>;
  } else if (tab === 'feed') {
    content = <FeedScreen dark={dark} accent={accent} density={tweaks.density} cardVariant={tweaks.cardVariant} showMap={tweaks.showMap}
      onOpenRide={(id) => push({ kind: 'ride', id })} onOpenFilters={() => setFiltersOpen(true)} filters={filters} defaultFilters={setFilters} me={me}/>;
  } else if (tab === 'map') {
    content = <MapScreen dark={dark} accent={accent} onOpenRide={(id) => push({ kind: 'ride', id })} onOpenFilters={() => setFiltersOpen(true)}/>;
  } else if (tab === 'notif') {
    content = <NotifScreen dark={dark} accent={accent}/>;
  } else if (tab === 'me') {
    content = <MyRidesScreen dark={dark} accent={accent} me={me}
      onOpenRide={(id) => push({ kind: 'ride', id })}
      onOpenSupport={() => push({ kind: 'support' })}
      onOpenAdmin={() => push({ kind: 'admin' })}
      isAdmin={true}/>;
  }

  // create tab triggers a modal
  useEffect(() => {
    if (tab === 'create') { push({ kind: 'create' }); setTab('feed'); }
  }, [tab]);

  const hideTabs = top?.kind === 'create' || top?.kind === 'confirm' || showOnboard;

  return (
    <>
      <PhoneShell platform={platform} dark={dark} accent={accent} tab={tab} setTab={setTab} hideTabs={hideTabs}>
        {content}
        <FiltersSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} filters={filters} setFilters={setFilters} dark={dark} accent={accent}/>
      </PhoneShell>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Платформа"/>
        <TweakRadio label="OS" value={tweaks.platform} options={[{value:'ios',label:'iOS'},{value:'android',label:'Android'}]} onChange={v => setTweak('platform', v)}/>
        <TweakToggle label="Тёмная тема" value={tweaks.dark} onChange={v => setTweak('dark', v)}/>

        <TweakSection label="Цвет"/>
        <TweakSelect label="Акцент" value={tweaks.accent} options={[
          {value:'telegram',label:'Telegram blue'},
          {value:'warm',label:'Warm orange'},
          {value:'forest',label:'Forest'},
          {value:'violet',label:'Violet'},
          {value:'graphite',label:'Graphite'},
        ]} onChange={v => setTweak('accent', v)}/>

        <TweakSection label="Лента"/>
        <TweakRadio label="Плотность" value={tweaks.density} options={[{value:'roomy',label:'Просторная'},{value:'compact',label:'Компактная'}]} onChange={v => setTweak('density', v)}/>
        <TweakRadio label="Тип карточки" value={tweaks.cardVariant} options={[{value:'default',label:'Обычная'},{value:'hero',label:'Геро'},{value:'compact',label:'Компакт'}]} onChange={v => setTweak('cardVariant', v)}/>
        <TweakToggle label="Карта-превью" value={tweaks.showMap} onChange={v => setTweak('showMap', v)}/>

        <TweakSection label="Профиль"/>
        <TweakRadio label="Аккаунт" value={tweaks.role} options={[{value:'fresh',label:'Новый'},{value:'seasoned',label:'Опытный'}]} onChange={v => setTweak('role', v)}/>
        <TweakToggle label="Фильтры доверия" value={tweaks.trustFiltersOn} onChange={v => setTweak('trustFiltersOn', v)}/>

        <TweakSection label="Быстрая навигация"/>
        <TweakButton label="Лента" onClick={() => { setStack([]); setTab('feed'); }}/>
        <TweakButton label="Карта" onClick={() => { setStack([]); setTab('map'); }}/>
        <TweakButton label="Карточка поездки" onClick={() => { setStack([{ kind: 'ride', id: 'r1' }]); }}/>
        <TweakButton label="Профиль водителя" onClick={() => { setStack([{ kind: 'profile', id: 'u1' }]); }}/>
        <TweakButton label="Создать поездку" onClick={() => { setStack([{ kind: 'create' }]); }}/>
        <TweakButton label="Подтверждение/лайк" onClick={() => { setStack([{ kind: 'confirm' }]); }}/>
        <TweakButton label="Поддержка" onClick={() => { setStack([{ kind: 'support' }]); }}/>
        <TweakButton label="Админ-дашборд" onClick={() => { setStack([{ kind: 'admin' }]); }}/>
        <TweakButton label="Онбординг" onClick={() => setShowOnboard(true)}/>
        <TweakButton label="События" onClick={() => { setStack([]); setTab('notif'); }}/>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
