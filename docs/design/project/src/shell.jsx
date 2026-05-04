// ─────────────────────────────────────────────────────────────
// Phone shell: minimal, OS-aware. Uses tweak.platform.
// Renders status bar, content area, optional bottom tab bar.
// ─────────────────────────────────────────────────────────────
function PhoneShell({ children, platform, dark, accent, tab, setTab, hideTabs = false }) {
  const isIOS = platform === 'ios';
  const W = isIOS ? 390 : 412;
  const H = isIOS ? 844 : 892;

  const bg = dark ? '#000' : (isIOS ? '#F2F4F7' : '#F4F7FA');
  const fg = dark ? '#fff' : '#000';

  return (
    <div style={{
      width: W, height: H, position: 'relative',
      borderRadius: isIOS ? 48 : 38,
      overflow: 'hidden',
      background: bg, color: fg,
      fontFamily: '-apple-system, "SF Pro Text", "Inter", "Segoe UI", Roboto, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased',
      boxShadow: '0 36px 80px -20px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.08)',
    }}>
      {/* Status bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: isIOS ? 54 : 40,
        zIndex: 50, display: 'flex', alignItems: 'center',
        padding: isIOS ? '18px 32px 0' : '0 18px',
        justifyContent: 'space-between', pointerEvents: 'none',
        color: fg, fontSize: isIOS ? 16 : 14, fontWeight: isIOS ? 600 : 500,
      }}>
        <span>{isIOS ? '9:41' : '9:30'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.95 }}>
          {/* signal */}
          <svg width="16" height="11"><rect x="0" y="7" width="3" height="4" rx="0.5" fill={fg}/><rect x="4.5" y="5" width="3" height="6" rx="0.5" fill={fg}/><rect x="9" y="3" width="3" height="8" rx="0.5" fill={fg}/><rect x="13" y="0" width="3" height="11" rx="0.5" fill={fg}/></svg>
          {/* battery */}
          <svg width="24" height="11"><rect x="0.5" y="0.5" width="20" height="10" rx="2" fill="none" stroke={fg} strokeOpacity="0.5"/><rect x="2" y="2" width="17" height="7" rx="1" fill={fg}/><rect x="21.5" y="3.5" width="2" height="4" rx="0.5" fill={fg} opacity="0.5"/></svg>
        </div>
      </div>

      {/* iOS dynamic island / Android punch hole */}
      {isIOS ? (
        <div style={{ position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)', width: 120, height: 35, borderRadius: 22, background: '#000', zIndex: 60 }}/>
      ) : (
        <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 11, height: 11, borderRadius: '50%', background: '#0A0A0A', zIndex: 60 }}/>
      )}

      {/* Content viewport */}
      <div style={{
        position: 'absolute',
        top: isIOS ? 54 : 40,
        bottom: hideTabs ? (isIOS ? 34 : 24) : (isIOS ? 88 : 76),
        left: 0, right: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>{children}</div>

      {/* Tab bar */}
      {!hideTabs && (
        <TabBar platform={platform} dark={dark} accent={accent} tab={tab} setTab={setTab}/>
      )}

      {/* Home indicator */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: isIOS ? 34 : 24,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingBottom: isIOS ? 8 : 8, zIndex: 70, pointerEvents: 'none',
      }}>
        <div style={{
          width: isIOS ? 134 : 108, height: isIOS ? 5 : 4, borderRadius: 100,
          background: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.3)',
        }}/>
      </div>
    </div>
  );
}

function TabBar({ platform, dark, accent, tab, setTab }) {
  const isIOS = platform === 'ios';
  const tabs = [
    { id: 'feed',    label: 'Поездки',    icon: 'home' },
    { id: 'map',     label: 'Карта',      icon: 'map' },
    { id: 'create',  label: '',           icon: 'plus', big: true },
    { id: 'notif',   label: 'События',    icon: 'bell' },
    { id: 'me',      label: 'Профиль',    icon: 'user' },
  ];
  const fg = dark ? 'rgba(235,235,245,0.55)' : '#9099A8';
  const bg = dark ? 'rgba(20,20,22,0.85)' : 'rgba(255,255,255,0.92)';
  return (
    <div style={{
      position: 'absolute', bottom: isIOS ? 34 : 24, left: 0, right: 0,
      height: isIOS ? 54 : 52,
      backdropFilter: 'blur(20px) saturate(160%)',
      WebkitBackdropFilter: 'blur(20px) saturate(160%)',
      background: bg,
      borderTop: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.06)',
      display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
      zIndex: 40, padding: '6px 6px 0',
    }}>
      {tabs.map(t => {
        const active = tab === t.id;
        if (t.big) {
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <button onClick={() => setTab(t.id)} style={{
                width: 48, height: 48, borderRadius: '50%',
                background: accent, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer',
                boxShadow: `0 6px 18px -4px ${accent}99, 0 0 0 4px ${dark ? '#000' : '#fff'}`,
                marginTop: -10,
              }}>
                <Icon name="plus" size={22} stroke={2.4}/>
              </button>
            </div>
          );
        }
        return (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            color: active ? accent : fg, padding: 0,
            fontFamily: 'inherit',
          }}>
            <Icon name={t.icon} size={22} stroke={active ? 2 : 1.7}/>
            <span style={{ fontSize: 10, fontWeight: active ? 600 : 500, letterSpacing: 0.1 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Page header (in-screen, not the OS status bar)
// ─────────────────────────────────────────────────────────────
function PageHeader({ title, subtitle, leading, trailing, dark, large = false, sticky = true, accent }) {
  return (
    <div style={{
      position: sticky ? 'sticky' : 'static', top: 0, zIndex: 10,
      backdropFilter: 'blur(18px) saturate(160%)',
      WebkitBackdropFilter: 'blur(18px) saturate(160%)',
      background: dark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.78)',
      borderBottom: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(15,23,42,0.05)',
      padding: large ? '12px 16px 14px' : '10px 16px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 32 }}>
        {leading}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: large ? 26 : 17, fontWeight: large ? 700 : 600,
            letterSpacing: large ? -0.4 : -0.2,
            color: dark ? '#fff' : '#0F1722',
            lineHeight: 1.15,
          }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: dark ? 'rgba(235,235,245,0.55)' : '#7C8694', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {trailing}
      </div>
    </div>
  );
}

// Round icon button (header actions)
function IconButton({ name, onClick, dark, size = 36, badge, accent }) {
  return (
    <button onClick={onClick} style={{
      width: size, height: size, borderRadius: size / 2,
      border: 'none', background: dark ? 'rgba(255,255,255,0.07)' : '#F1F4F8',
      color: dark ? '#fff' : '#1F2937',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', position: 'relative', flexShrink: 0,
    }}>
      <Icon name={name} size={18}/>
      {badge && (
        <span style={{
          position: 'absolute', top: 1, right: 1,
          minWidth: 16, height: 16, padding: '0 4px',
          borderRadius: 8, background: '#E54E5C', color: '#fff',
          fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: dark ? '2px solid #000' : '2px solid #fff',
        }}>{badge}</span>
      )}
    </button>
  );
}

Object.assign(window, { PhoneShell, TabBar, PageHeader, IconButton });
