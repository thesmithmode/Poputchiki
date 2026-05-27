// ─────────────────────────────────────────────────────────────
// MAP — real Leaflet/OSM map with ride markers + selected route
// ─────────────────────────────────────────────────────────────
function MapScreen({ dark, accent, onOpenRide, onOpenFilters }) {
  const containerRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const layersRef = React.useRef({ markers: [], polyline: null });
  const [selected, setSelected] = React.useState(null);
  const [picker, setPicker] = React.useState(null);
  const [from, setFrom] = React.useState((window.__ME__ || ME_SEASONED).house || 'h5');
  const [to, setTo] = React.useState(null);
  const [radius, setRadius] = React.useState(1.5);

  // Filtered rides based on search
  const query = { from, to, radiusKm: radius };
  const results = React.useMemo(() => searchRides(query, {}), [from, to, radius]);
  const visibleRides = results.length ? results : RIDES.map(r => ({ ride: r, fromMatch: 'exact', toMatch: 'exact' }));
  const selectedItem = visibleRides.find(r => r.ride.id === selected) || visibleRides[0];

  // Initialize Leaflet
  React.useEffect(() => {
    if (!window.L || !containerRef.current) return;
    const L = window.L;
    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [55.79, 49.18],
      zoom: 11,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    });

    const tileUrl = dark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png';
    L.tileLayer(tileUrl, {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '© OpenStreetMap contributors, © CARTO',
    }).addTo(map);
    L.control.attribution({ position: 'bottomleft' }).addTo(map);

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 80);

    return () => { map.remove(); mapRef.current = null; };
  }, [dark]);

  // Render markers + selected route
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;
    const L = window.L;

    // clear
    layersRef.current.markers.forEach(m => map.removeLayer(m));
    layersRef.current.markers = [];
    if (layersRef.current.polyline) { map.removeLayer(layersRef.current.polyline); layersRef.current.polyline = null; }
    if (layersRef.current.toMarker) { map.removeLayer(layersRef.current.toMarker); layersRef.current.toMarker = null; }
    if (layersRef.current.fromCircle) { map.removeLayer(layersRef.current.fromCircle); layersRef.current.fromCircle = null; }
    if (layersRef.current.toCircle) { map.removeLayer(layersRef.current.toCircle); layersRef.current.toCircle = null; }

    // From point (rider) — accent ring
    const fromP = pointById(from);
    if (fromP) {
      layersRef.current.fromCircle = L.circleMarker([fromP.lat, fromP.lng], {
        radius: 8, color: '#3D6B8A', weight: 3, fillColor: '#fff', fillOpacity: 1,
      }).addTo(map);
    }

    // To search point — radius circle
    if (to) {
      const toP = pointById(to);
      if (toP) {
        layersRef.current.toCircle = L.circle([toP.lat, toP.lng], {
          radius: radius * 1000,
          color: accent, weight: 1.5, fillColor: accent, fillOpacity: 0.06,
          dashArray: '4 4',
        }).addTo(map);
      }
    }

    // Ride pickup markers
    visibleRides.forEach(({ ride, fromMatch, toMatch }) => {
      const p = pointById(ride.from_house);
      if (!p) return;
      const isSel = ride.id === selectedItem?.ride.id;
      const driver = userById(ride.driver);
      const matchColor = (fromMatch === 'exact' || fromMatch === 'near') && (!to || toMatch === 'exact' || toMatch === 'near')
        ? '#4DAB6E' : accent;
      const html = `
        <div style="position:relative;width:36px;height:42px;transform:translate(-18px,-42px);">
          <div style="width:36px;height:36px;border-radius:50%;background:${driver.avatar};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:13px;font-family:-apple-system,system-ui,sans-serif;border:3px solid ${isSel ? matchColor : '#fff'};box-shadow:0 2px 6px rgba(0,0,0,0.3);">${driver.initials}</div>
          <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${isSel ? matchColor : '#fff'};"></div>
        </div>`;
      const marker = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] }),
        zIndexOffset: isSel ? 1000 : 0,
      });
      marker.on('click', () => setSelected(ride.id));
      marker.addTo(map);
      layersRef.current.markers.push(marker);
    });

    // Selected route polyline (from house → waypoints → destination)
    if (selectedItem) {
      const ride = selectedItem.ride;
      const start = pointById(ride.from_house);
      const end = pointById(ride.to);
      const waypoints = (ride.waypoints || []).map(pointById).filter(Boolean);
      const points = [start, ...waypoints, end].filter(Boolean).map(p => [p.lat, p.lng]);
      if (points.length >= 2) {
        layersRef.current.polyline = L.polyline(points, {
          color: accent, weight: 4, opacity: 0.85, lineCap: 'round', lineJoin: 'round',
        }).addTo(map);

        // dest pin
        const destHtml = `
          <div style="transform:translate(-12px,-28px);">
            <svg width="24" height="30" viewBox="0 0 24 30" fill="none">
              <path d="M12 30s10-12 10-18A10 10 0 0 0 2 12c0 6 10 18 10 18z" fill="${accent}" stroke="#fff" stroke-width="2"/>
              <circle cx="12" cy="11" r="3.5" fill="#fff"/>
            </svg>
          </div>`;
        layersRef.current.toMarker = L.marker([end.lat, end.lng], {
          icon: L.divIcon({ html: destHtml, className: '', iconSize: [0, 0], iconAnchor: [0, 0] }),
          zIndexOffset: 500,
        }).addTo(map);

        // fit
        const bounds = L.latLngBounds(points);
        if (fromP) bounds.extend([fromP.lat, fromP.lng]);
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
      }
    } else if (visibleRides.length > 0) {
      const allPoints = visibleRides.map(r => {
        const p = pointById(r.ride.from_house); return p ? [p.lat, p.lng] : null;
      }).filter(Boolean);
      if (allPoints.length) map.fitBounds(L.latLngBounds(allPoints), { padding: [80, 80] });
    }
  }, [from, to, radius, accent, dark, selectedItem?.ride.id, visibleRides.length]);

  const text = dark ? '#fff' : '#15191F';
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, background: dark ? '#0E1418' : '#E8EEF3' }}/>

      {/* Top floating route bar */}
      <div style={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 5 }}>
        <RouteBar
          from={from} to={to} radius={radius}
          onChangeFrom={() => setPicker('from')}
          onChangeTo={() => setPicker('to')}
          onSwap={() => {}}
          onChangeRadius={to ? setRadius : null}
          dark={dark} accent={accent}
        />
      </div>

      {/* Zoom controls */}
      <div style={{ position: 'absolute', right: 12, bottom: selectedItem ? 156 : 28, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={() => mapRef.current?.zoomIn()} style={{
          width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: dark ? 'rgba(28,28,30,0.92)' : 'rgba(255,255,255,0.96)',
          color: text, boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="plus" size={16}/></button>
        <button onClick={() => mapRef.current?.zoomOut()} style={{
          width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: dark ? 'rgba(28,28,30,0.92)' : 'rgba(255,255,255,0.96)',
          color: text, boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="minus" size={16}/></button>
        <button onClick={() => {
          const fp = pointById(from); if (fp && mapRef.current) mapRef.current.flyTo([fp.lat, fp.lng], 14);
        }} style={{
          width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: dark ? 'rgba(28,28,30,0.92)' : 'rgba(255,255,255,0.96)',
          color: accent, boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="home" size={16}/></button>
      </div>

      {/* Result count chip */}
      <div style={{ position: 'absolute', left: 12, bottom: selectedItem ? 156 : 28, zIndex: 5,
        padding: '8px 12px', borderRadius: 999,
        background: dark ? 'rgba(28,28,30,0.92)' : 'rgba(255,255,255,0.96)',
        color: text, fontSize: 12.5, fontWeight: 600, boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4DAB6E' }}/>
        {visibleRides.length} поездок
      </div>

      {/* Selected ride card */}
      {selectedItem && (
        <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, zIndex: 5 }}>
          <Card dark={dark} padding={12} radius={16} onClick={() => onOpenRide(selectedItem.ride.id)} style={{ boxShadow: '0 12px 28px -6px rgba(15,23,42,0.18), 0 0 0 1px rgba(15,23,42,0.04)' }}>
            <SelectedRideRow item={selectedItem} dark={dark} accent={accent} hasTo={!!to}/>
          </Card>
        </div>
      )}

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

function SelectedRideRow({ item, dark, accent, hasTo }) {
  const { ride } = item;
  const driver = userById(ride.driver);
  const fromP = pointById(ride.from_house);
  const toP = pointById(ride.to);
  const t = formatTime(ride.in_min);
  const seatsLeft = ride.seats_total - ride.seats_taken;
  const text = dark ? '#fff' : '#15191F';
  const sub = dark ? 'rgba(235,235,245,0.6)' : '#7C8694';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar user={driver} size={40}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: text }}>{driver.short}</span>
            {driver.badges?.includes('new') && <NewBadge dark={dark}/>}
            <LikesPill count={driver.likes} size="sm" accent={accent} dark={dark}/>
          </div>
          <div style={{ fontSize: 11.5, color: sub, marginTop: 2 }}>
            {driver.rating > 0 ? <>★ {driver.rating} · {driver.rides} поездок</> : 'новый участник'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: text }}>{ride.price === 'free' ? 'free' : `${ride.price} ₽`}</div>
          <div style={{ fontSize: 11, color: seatsLeft === 0 ? '#E54E5C' : sub }}>{seatsLeft === 0 ? 'нет мест' : `${seatsLeft} мест`}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: sub }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: fromP?.color || '#3D6B8A', flexShrink: 0 }}/>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fromP?.short}</span>
        <Icon name="arrow-r" size={11}/>
        <Icon name="pin" size={11} style={{ color: toP?.color }}/>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{toP?.short}</span>
        <span style={{ flexShrink: 0, fontWeight: 600, color: text }}>{t.time}</span>
      </div>
      {hasTo && <MatchBadge result={item} dark={dark} accent={accent}/>}
    </div>
  );
}

window.MapScreen = MapScreen;
