// ─────────────────────────────────────────────────────────────
// Mock data — ЖК Царёво (Казань), реальные координаты.
// ─────────────────────────────────────────────────────────────

// ЖК Царёво Village — посёлок к востоку от Казани (~55.787, 49.265)
// 10 домов с реальной развязкой. Пользователи привязаны к домам.
const TSAREVO_HOUSES = [
  { id: 'h1',  num: '1',  street: 'ул. Тургенева', lat: 55.7883, lng: 49.2622 },
  { id: 'h2',  num: '2',  street: 'ул. Тургенева', lat: 55.7878, lng: 49.2638 },
  { id: 'h3',  num: '3',  street: 'ул. Тургенева', lat: 55.7872, lng: 49.2654 },
  { id: 'h4',  num: '4',  street: 'ул. Пушкина',   lat: 55.7864, lng: 49.2635 },
  { id: 'h5',  num: '5',  street: 'ул. Пушкина',   lat: 55.7858, lng: 49.2651 },
  { id: 'h6',  num: '6',  street: 'ул. Пушкина',   lat: 55.7852, lng: 49.2667 },
  { id: 'h7',  num: '7',  street: 'ул. Лермонтова',lat: 55.7847, lng: 49.2628 },
  { id: 'h8',  num: '8',  street: 'ул. Лермонтова',lat: 55.7841, lng: 49.2644 },
  { id: 'h9',  num: '9',  street: 'ул. Лермонтова',lat: 55.7835, lng: 49.2660 },
  { id: 'h10', num: '10', street: 'ул. Гоголя',    lat: 55.7829, lng: 49.2640 },
];

// Точки в Казани — реальные адреса/POI
const POI = [
  // Метро
  { id: 'm_dubr',  cat: 'metro',  name: 'м. «Дубравная»',      addr: 'ул. Дубравная, 30',         short: 'Дубравная',    lat: 55.7510, lng: 49.1652 },
  { id: 'm_prosp', cat: 'metro',  name: 'м. «Проспект Победы»',addr: 'пр. Победы, 92',            short: 'Пр. Победы',   lat: 55.7693, lng: 49.1900 },
  { id: 'm_amir',  cat: 'metro',  name: 'м. «Аметьево»',       addr: 'ул. Даурская, 27',          short: 'Аметьево',     lat: 55.7745, lng: 49.1429 },
  { id: 'm_sukon', cat: 'metro',  name: 'м. «Суконная сл.»',   addr: 'ул. Островского, 75',       short: 'Суконная',     lat: 55.7836, lng: 49.1244 },
  { id: 'm_pl_t',  cat: 'metro',  name: 'м. «Пл. Тукая»',      addr: 'ул. Пушкина, 11',           short: 'Пл. Тукая',    lat: 55.7900, lng: 49.1230 },
  { id: 'm_kreml', cat: 'metro',  name: 'м. «Кремлёвская»',    addr: 'ул. Баумана, 78',           short: 'Кремлёвская',  lat: 55.7969, lng: 49.1090 },
  { id: 'm_gor',   cat: 'metro',  name: 'м. «Горки»',          addr: 'пр. Победы, 16',            short: 'Горки',        lat: 55.7585, lng: 49.2090 },
  { id: 'm_kozya', cat: 'metro',  name: 'м. «Козья слобода»',  addr: 'ул. Чистопольская, 38',     short: 'Козья сл.',    lat: 55.8197, lng: 49.0855 },

  // ТЦ
  { id: 'tc_kolts',cat: 'mall',   name: 'ТЦ «Кольцо»',         addr: 'ул. Петербургская, 1',      short: 'Кольцо',       lat: 55.7868, lng: 49.1250 },
  { id: 'tc_mega', cat: 'mall',   name: 'ТРК «МЕГА»',          addr: 'пр. Победы, 141',           short: 'МЕГА',         lat: 55.8254, lng: 49.1697 },
  { id: 'tc_park', cat: 'mall',   name: 'ТРК «Парк Хаус»',     addr: 'пр. Ямашева, 46',           short: 'Парк Хаус',    lat: 55.8307, lng: 49.1100 },
  { id: 'tc_tand', cat: 'mall',   name: 'ТРК «Тандем»',        addr: 'пр. Ибрагимова, 56',        short: 'Тандем',       lat: 55.8198, lng: 49.0992 },
  { id: 'tc_juzh', cat: 'mall',   name: 'ТРК «Южный»',         addr: 'пр. Победы, 91',            short: 'Южный',        lat: 55.7724, lng: 49.1936 },

  // Транспорт
  { id: 'apo',     cat: 'travel', name: 'Аэропорт Казань',     addr: 'аэропорт, корп. 1',         short: 'Аэропорт',     lat: 55.6062, lng: 49.2786 },
  { id: 'rail1',   cat: 'travel', name: 'ЖД Казань-1',         addr: 'Привокзальная пл., 1',      short: 'Вокзал',       lat: 55.7945, lng: 49.0938 },
  { id: 'rail2',   cat: 'travel', name: 'ЖД Казань-2',         addr: 'ул. Воровского, 31',        short: 'Восстание',    lat: 55.8497, lng: 49.0937 },
  { id: 'bus_yuzh',cat: 'travel', name: 'Автовокзал Южный',    addr: 'Оренбургский тракт, 207',   short: 'Автовокзал',   lat: 55.7345, lng: 49.1827 },

  // Универы
  { id: 'kfu',     cat: 'edu',    name: 'КФУ (главное)',       addr: 'ул. Кремлёвская, 18',       short: 'КФУ',          lat: 55.7926, lng: 49.1219 },
  { id: 'knitu',   cat: 'edu',    name: 'КНИТУ-КАИ',           addr: 'ул. К. Маркса, 10',         short: 'КАИ',          lat: 55.7955, lng: 49.1268 },
  { id: 'kgmu',    cat: 'edu',    name: 'КГМУ',                addr: 'ул. Бутлерова, 49',         short: 'КГМУ',         lat: 55.7892, lng: 49.1438 },

  // Центр / достопримечательности
  { id: 'baum',    cat: 'place',  name: 'ул. Баумана',         addr: 'ул. Баумана, 1',            short: 'Баумана',      lat: 55.7926, lng: 49.1141 },
  { id: 'kreml',   cat: 'place',  name: 'Казанский Кремль',    addr: 'Кремль',                    short: 'Кремль',       lat: 55.7989, lng: 49.1063 },
  { id: 'gorky',   cat: 'place',  name: 'Парк Горького',       addr: 'ул. Н. Ершова, 1',          short: 'Парк Горького',lat: 55.7811, lng: 49.1376 },
  { id: 'kazaarn', cat: 'place',  name: 'Казань Арена',        addr: 'пр. Ямашева, 115А',         short: 'Казань Арена', lat: 55.8204, lng: 49.1572 },
  { id: 'kaban',   cat: 'place',  name: 'оз. Нижний Кабан',    addr: 'ул. Татарстан',             short: 'Кабан',        lat: 55.7820, lng: 49.1248 },

  // Больницы
  { id: 'hosp_rkb',cat: 'med',    name: 'РКБ',                 addr: 'Оренбургский тракт, 138',   short: 'РКБ',          lat: 55.7227, lng: 49.1668 },
  { id: 'hosp_dr', cat: 'med',    name: 'ДРКБ',                addr: 'ул. Оренбургский тр., 140', short: 'ДРКБ',         lat: 55.7250, lng: 49.1683 },

  // Бизнес
  { id: 'idea',    cat: 'biz',    name: 'IT-парк',             addr: 'ул. Петербургская, 52',     short: 'IT-парк',      lat: 55.7799, lng: 49.1280 },
  { id: 'innopol', cat: 'biz',    name: 'Иннополис',           addr: 'Университетская, 1',        short: 'Иннополис',    lat: 55.7517, lng: 48.7440 },
];

const POI_CATS = {
  metro:  { label: 'Метро',    icon: 'metro' },
  mall:   { label: 'ТЦ',       icon: 'shop' },
  travel: { label: 'Транспорт',icon: 'plane' },
  edu:    { label: 'Учёба',    icon: 'edu' },
  place:  { label: 'Места',    icon: 'pin' },
  med:    { label: 'Медицина', icon: 'heart' },
  biz:    { label: 'Работа',   icon: 'briefcase' },
};

const USERS = [
  { id: 'u1',  name: 'Игорь Соколов',     short: 'Игорь С.',     house: 'h5', apt: '142', avatar: '#E0734A', initials: 'ИС', likes: 47, rides: 312, rating: 4.9, reviews: 86, age_days: 412, completed: 0.96, fav: true,  badges: [], car: 'Hyundai Solaris · серый' },
  { id: 'u2',  name: 'Елена Васильева',   short: 'Лена В.',      house: 'h3', apt: '88',  avatar: '#7A9E6E', initials: 'ЕВ', likes: 12, rides: 38,  rating: 4.7, reviews: 11, age_days: 94,  completed: 0.92, fav: false, badges: [], car: null },
  { id: 'u3',  name: 'Дмитрий Хайруллин', short: 'Дмитрий Х.',   house: 'h7', apt: '24',  avatar: '#3B6BB0', initials: 'ДХ', likes: 23, rides: 142, rating: 4.8, reviews: 31, age_days: 220, completed: 0.94, fav: false, badges: [], car: 'Kia Rio · белый' },
  { id: 'u4',  name: 'Анна Гилязова',     short: 'Анна Г.',      house: 'h1', apt: '56',  avatar: '#B85E8E', initials: 'АГ', likes: 31, rides: 88,  rating: 4.9, reviews: 22, age_days: 188, completed: 0.97, fav: true,  badges: [], car: 'Lada Vesta · синий' },
  { id: 'u5',  name: 'Рустам Гарипов',    short: 'Рустам Г.',    house: 'h9', apt: '201', avatar: '#5B7C99', initials: 'РГ', likes: 8,  rides: 19,  rating: 4.6, reviews: 6,  age_days: 41,  completed: 0.89, fav: false, badges: [], car: 'Renault Logan · чёрный' },
  { id: 'u6',  name: 'Марат Сафин',       short: 'Марат С.',     house: 'h4', apt: '17',  avatar: '#8A6A4A', initials: 'МС', likes: 0,  rides: 1,   rating: 0,   reviews: 0,  age_days: 1,   completed: 0,    fav: false, badges: ['new'], car: null },
  { id: 'u7',  name: 'Ольга Шарифуллина', short: 'Ольга Ш.',     house: 'h2', apt: '45',  avatar: '#9C6BB8', initials: 'ОШ', likes: 19, rides: 64,  rating: 4.8, reviews: 17, age_days: 156, completed: 0.95, fav: false, badges: [], car: 'Skoda Rapid · красный' },
  { id: 'u8',  name: 'Тимур Закиров',     short: 'Тимур З.',     house: 'h6', apt: '88',  avatar: '#D49B3F', initials: 'ТЗ', likes: 14, rides: 49,  rating: 4.7, reviews: 12, age_days: 119, completed: 0.93, fav: false, badges: [], car: 'Volkswagen Polo · серебро' },
  { id: 'u9',  name: 'Алия Минниханова',  short: 'Алия М.',      house: 'h8', apt: '33',  avatar: '#6B9080', initials: 'АМ', likes: 4,  rides: 7,   rating: 4.5, reviews: 2,  age_days: 18,  completed: 0.85, fav: false, badges: [], car: null },
];

const ME_FRESH    = { id: 'me', name: 'Антон Соколов', short: 'Антон С.', house: 'h5', apt: '78',  avatar: '#3D6B8A', initials: 'АС', likes: 0,  rides: 0,   rating: 0,   reviews: 0, age_days: 2,   completed: 0,    fav: false, badges: ['new'], car: null };
const ME_SEASONED = { id: 'me', name: 'Антон Соколов', short: 'Антон С.', house: 'h5', apt: '78',  avatar: '#3D6B8A', initials: 'АС', likes: 28, rides: 96,  rating: 4.8, reviews: 24, age_days: 287, completed: 0.95, fav: false, badges: [],     car: 'Toyota Camry · чёрный' };

// Поездки. from_house — id дома Царёво. to_id — POI. waypoints — POI которые водитель готов проезжать.
const RIDES = [
  { id: 'r1', driver: 'u1', from_house: 'h5', to: 'baum',     in_min: 8,    price: 200, seats_total: 3, seats_taken: 1, passengers: ['u4'], recurring: true,  comment: 'Каждое утро в офис на Баумана. Подвезу к метро Дубравная или Кремлёвская, как удобнее.', waypoints: ['m_dubr','m_kreml'] },
  { id: 'r2', driver: 'u3', from_house: 'h7', to: 'm_dubr',   in_min: 15,   price: 100, seats_total: 2, seats_taken: 0, passengers: [],     recurring: false, comment: 'Без багажа.', waypoints: [] },
  { id: 'r3', driver: 'u4', from_house: 'h1', to: 'apo',      in_min: 32,   price: 600, seats_total: 3, seats_taken: 2, passengers: ['u7','u8'], recurring: false, comment: 'Самолёт в 14:20. Могу заехать на Дубравную по пути.', waypoints: ['m_dubr'] },
  { id: 'r4', driver: 'u7', from_house: 'h2', to: 'kfu',      in_min: 45,   price: 180, seats_total: 4, seats_taken: 1, passengers: ['u9'], recurring: true,  comment: 'В универ. По пути ТЦ Кольцо.', waypoints: ['tc_kolts','m_kreml'] },
  { id: 'r5', driver: 'u8', from_house: 'h6', to: 'tc_mega',  in_min: 70,   price: 250, seats_total: 3, seats_taken: 0, passengers: [],     recurring: false, comment: 'За покупками. Обратно тоже могу.', waypoints: ['tc_park'] },
  { id: 'r6', driver: 'u2', from_house: 'h3', to: 'rail1',    in_min: 110,  price: 220, seats_total: 2, seats_taken: 0, passengers: [],     recurring: false, comment: 'На поезд в 18:40.', waypoints: ['m_kreml'] },
  { id: 'r7', driver: 'u5', from_house: 'h9', to: 'baum',     in_min: 130,  price: 150, seats_total: 4, seats_taken: 0, passengers: [],     recurring: false, comment: 'Свежий аккаунт, простите если что.', waypoints: ['m_dubr','m_pl_t'] },
  { id: 'r8', driver: 'u6', from_house: 'h4', to: 'm_dubr',   in_min: 160,  price: 'free', seats_total: 1, seats_taken: 0, passengers: [], recurring: false, comment: 'Бесплатно, по пути.', waypoints: [] },
  { id: 'r9', driver: 'u1', from_house: 'h5', to: 'baum',     in_min: 480,  price: 200, seats_total: 3, seats_taken: 0, passengers: [],     recurring: true,  comment: 'Возвращаюсь домой с работы.', waypoints: ['m_kreml','m_dubr'] },
  { id: 'r10',driver: 'u9', from_house: 'h8', to: 'kgmu',     in_min: 55,   price: 140, seats_total: 3, seats_taken: 0, passengers: [],     recurring: true,  comment: 'В мед. По пути универ.', waypoints: ['kfu','tc_kolts'] },
  { id: 'r11',driver: 'u3', from_house: 'h7', to: 'tc_kolts', in_min: 95,   price: 180, seats_total: 2, seats_taken: 0, passengers: [],     recurring: false, comment: '', waypoints: ['m_dubr','m_amir'] },
  { id: 'r12',driver: 'u7', from_house: 'h2', to: 'innopol',  in_min: 210,  price: 350, seats_total: 3, seats_taken: 0, passengers: [],     recurring: true,  comment: 'В Иннополис, по пути могу подвезти к метро.', waypoints: ['m_dubr'] },
];

const REVIEWS_BY_USER = {
  u1: [
    { id: 'rv1', author: 'u4', rating: 5, when: '3 дня назад',  text: 'Игорь возит спокойно, без музыки на полную, всегда вовремя. Уже четвёртый раз с ним.' },
    { id: 'rv2', author: 'u3', rating: 5, when: '1 неделю назад', text: 'Подобрал вовремя, помог с багажом. Рекомендую.' },
    { id: 'rv3', author: 'u7', rating: 4, when: '2 недели назад', text: 'Всё хорошо, только немного опоздал из-за пробок (предупредил).' },
    { id: 'rv4', author: 'u2', rating: 5, when: 'месяц назад',  text: '' },
    { id: 'rv5', author: 'u8', rating: 5, when: 'месяц назад',  text: 'Удобно, что регулярная поездка. Знаю когда ехать, всегда место есть.' },
  ],
  u3: [
    { id: 'rv6', author: 'u1', rating: 5, when: '5 дней назад', text: 'Дмитрий — отличный водитель, аккуратный.' },
    { id: 'rv7', author: 'u4', rating: 5, when: '2 недели назад', text: '' },
    { id: 'rv8', author: 'u2', rating: 4, when: 'месяц назад', text: 'Всё ок, спасибо.' },
  ],
  u4: [
    { id: 'rv9', author: 'u7', rating: 5, when: 'неделю назад', text: 'Анна довезла до аэропорта вовремя, было приятно поговорить.' },
    { id: 'rv10', author: 'u8', rating: 5, when: 'месяц назад', text: '' },
  ],
  u7: [
    { id: 'rv11', author: 'u3', rating: 5, when: 'неделю назад', text: 'Ольга, спасибо! Удобно, по пути.' },
    { id: 'rv12', author: 'u1', rating: 4, when: '2 недели назад', text: 'Хороший водитель.' },
  ],
};
// Back-compat shim
const REVIEWS_U1 = REVIEWS_BY_USER.u1;

const NOTIFS = [
  { id: 'n1', type: 'ride_request',         actor: 'u4', when: '5 мин назад',   text: 'откликнулась на твою поездку в Центр',  unread: true,  ride: 'r1' },
  { id: 'n2', type: 'confirm_participation',actor: 'u3', when: '2 ч назад',     text: 'подтверди, что вы ездили в Дубравную',  unread: true,  ride: 'r2' },
  { id: 'n3', type: 'like_received',        actor: 'u7', when: 'вчера',         text: 'поставила тебе лайк',                    unread: false, ride: null },
  { id: 'n4', type: 'review_received',      actor: 'u4', when: '3 дня назад',   text: 'оставила отзыв 5★',                       unread: false, ride: null },
  { id: 'n5', type: 'favorite_new_ride',    actor: 'u1', when: '4 дня назад',   text: 'опубликовал поездку в Аэропорт',         unread: false, ride: 'r3' },
  { id: 'n6', type: 'system',               actor: null, when: '1 неделю назад',text: 'Добро пожаловать в Попутчики Царёво!',    unread: false, ride: null },
];

const SUPPORT_THREADS = [
  { id: 's1', subject: 'Не приходят пуши', last: 'Спасибо, проверим настройки бота.', when: '2 дня назад', status: 'replied', unread: false },
  { id: 's2', subject: 'Как удалить отзыв?', last: 'Отзывы редактируются в течение 24 часов после публикации.', when: '1 неделю назад', status: 'closed', unread: false },
];

// ─── helpers ─────────────────────────────────────────────────
function userById(id) { return id === 'me' ? window.__ME__ || ME_SEASONED : USERS.find(u => u.id === id); }
function houseById(id) { return TSAREVO_HOUSES.find(h => h.id === id); }
function poiById(id) { return POI.find(p => p.id === id); }

// Точка может быть либо домом Царёво (h_id), либо POI.
function pointById(id) {
  if (!id) return null;
  if (id.startsWith('h')) {
    const h = houseById(id);
    return h ? { ...h, kind: 'house', label: `${h.street}, д.${h.num}`, short: `Дом ${h.num}`, color: '#3D6B8A' } : null;
  }
  if (id === 'tsarevo') return { id: 'tsarevo', kind: 'district', label: 'ЖК Царёво', short: 'Царёво', lat: 55.7855, lng: 49.2645, color: '#3D6B8A' };
  const p = poiById(id);
  return p ? { ...p, kind: 'poi', label: p.name, color: catColor(p.cat) } : null;
}

function catColor(cat) {
  return ({
    metro: '#8B5C9E', mall: '#E0734A', travel: '#456A8C',
    edu: '#5A7D6B', place: '#B07735', med: '#C25A65', biz: '#3D6B8A',
  })[cat] || '#7C8694';
}

// Haversine (km)
function distKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const aa = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(aa));
}

// Distance from point P to segment A→B (km, on flat earth ok at city scale)
function distToSegmentKm(p, a, b) {
  const ax = a.lng, ay = a.lat, bx = b.lng, by = b.lat, px = p.lng, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx*dx + dy*dy;
  if (len2 < 1e-10) return distKm(p, a);
  let t = ((px - ax)*dx + (py - ay)*dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const proj = { lat: ay + t*dy, lng: ax + t*dx };
  return distKm(p, proj);
}

// Score a ride for a search query (fromId, toId, radiusKm).
// Returns { score, fromMatch: 'exact'|'near'|'detour'|'far', fromKm, toMatch, toKm, detourMin }
function scoreRide(ride, query) {
  const rideFrom = pointById(ride.from_house);
  const rideTo   = pointById(ride.to);
  const wpPoints = (ride.waypoints || []).map(pointById).filter(Boolean);

  const qFrom = pointById(query.from);
  const qTo   = pointById(query.to);
  const radius = query.radiusKm ?? 1.5;

  // FROM matching: distance from rider's pickup to ride's pickup
  const fromKm = qFrom ? distKm(qFrom, rideFrom) : 0;
  let fromMatch;
  if (qFrom && qFrom.id === rideFrom.id) fromMatch = 'exact';
  else if (fromKm < 0.25) fromMatch = 'exact';
  else if (fromKm < 0.7)  fromMatch = 'near';
  else if (fromKm < radius) fromMatch = 'detour';
  else fromMatch = 'far';

  // TO matching: distance from rider's dropoff either to ride's dropoff,
  // or to nearest waypoint, or to the closest point on the route line.
  let toKm = qTo ? distKm(qTo, rideTo) : 0;
  let toMatch = 'far';
  let toReason = 'dest';
  if (qTo) {
    if (qTo.id === rideTo.id) { toMatch = 'exact'; toKm = 0; toReason = 'dest'; }
    else {
      // nearest waypoint
      let bestWp = null, bestWpKm = Infinity;
      for (const wp of wpPoints) {
        const d = distKm(qTo, wp);
        if (d < bestWpKm) { bestWpKm = d; bestWp = wp; }
      }
      // distance to route line (from→to)
      const routeKm = distToSegmentKm(qTo, rideFrom, rideTo);

      const cand = Math.min(toKm, bestWpKm, routeKm);
      if (cand === bestWpKm && bestWp) toReason = 'waypoint';
      else if (cand === routeKm)        toReason = 'onroute';
      else                              toReason = 'dest';
      toKm = cand;

      if (toKm < 0.25)        toMatch = 'exact';
      else if (toKm < 0.8)    toMatch = 'near';
      else if (toKm < radius) toMatch = 'detour';
      else                    toMatch = 'far';
    }
  }

  // Approx detour minutes — 1 km ≈ 2 min in city
  const detourMin = Math.round((Math.max(0, fromKm - 0.1) + Math.max(0, toKm - 0.1)) * 2);

  // Composite score (lower = better)
  const score = fromKm * 1.5 + toKm * 1.0 + (toReason === 'waypoint' ? 0 : 0.2);

  return { score, fromMatch, fromKm, toMatch, toKm, toReason, detourMin };
}

function searchRides(query, opts = {}) {
  const { trustFilters = false, minAge = 0, minLikes = 0, favOnly = false, maxPrice = 1000 } = opts;
  const radius = query.radiusKm ?? 1.5;

  return RIDES.map(r => {
    const m = scoreRide(r, query);
    return { ride: r, ...m };
  }).filter(({ ride, fromMatch, toMatch }) => {
    const driver = userById(ride.driver);
    if (typeof ride.price === 'number' && ride.price > maxPrice && maxPrice < 1000) return false;
    if (trustFilters) {
      if (driver.age_days < minAge) return false;
      if (driver.likes < minLikes) return false;
    }
    if (favOnly && !driver.fav) return false;
    if (query.from && fromMatch === 'far') return false;
    if (query.to && toMatch === 'far') return false;
    return true;
  }).sort((a, b) => a.score - b.score);
}

function formatTime(in_min) {
  const now = new Date(2026, 4, 1, 8, 12);
  const dep = new Date(now.getTime() + in_min * 60000);
  const hh = String(dep.getHours()).padStart(2, '0');
  const mm = String(dep.getMinutes()).padStart(2, '0');
  let rel;
  if (in_min < 60)        rel = `через ${in_min} мин`;
  else if (in_min < 24*60){
    const h = Math.floor(in_min / 60), m = in_min % 60;
    rel = m === 0 ? `через ${h} ч` : `через ${h} ч ${m} мин`;
  } else {
    const d = Math.floor(in_min / (24*60));
    rel = d === 1 ? 'завтра' : `через ${d} дн`;
  }
  return { time: `${hh}:${mm}`, rel };
}

// Driver public schedule — derived from recurring rides
function scheduleForDriver(driverId) {
  const rides = RIDES.filter(r => r.driver === driverId && r.recurring);
  return rides.map(r => {
    const t = formatTime(r.in_min);
    const toP = pointById(r.to);
    const fromP = pointById(r.from_house);
    return {
      id: r.id,
      days: 'Пн–Пт',
      time: t.time,
      fromShort: fromP?.short,
      toShort: toP?.short,
      toColor: toP?.color,
      price: r.price === 'free' ? 'free' : `${r.price} ₽`,
    };
  });
}

// Public stats for a profile (driver or passenger view)
function publicStats(user) {
  const drives = RIDES.filter(r => r.driver === user.id);
  const recurring = drives.filter(r => r.recurring).length;
  const oneoff = drives.length - recurring;
  // mock passenger-side trips
  const tripsAsPassenger = Math.max(0, user.rides - drives.length * 8);
  const responseMin = user.likes > 20 ? 4 : user.likes > 5 ? 12 : 30;
  const memberSince = (() => {
    const d = user.age_days;
    if (d < 30) return `${d} дн`;
    if (d < 365) return `${Math.round(d/30)} мес`;
    return `${Math.floor(d/365)} г ${Math.round((d % 365)/30)} мес`;
  })();
  return {
    activeDrives: drives.length,
    recurring, oneoff, tripsAsPassenger,
    responseMin, memberSince,
    completionPct: Math.round(user.completed * 100),
  };
}

window.scheduleForDriver = scheduleForDriver;
window.publicStats = publicStats;

Object.assign(window, {
  TSAREVO_HOUSES, POI, POI_CATS, USERS, ME_FRESH, ME_SEASONED, RIDES,
  REVIEWS_U1, REVIEWS_BY_USER, NOTIFS, SUPPORT_THREADS,
  userById, houseById, poiById, pointById, catColor,
  distKm, distToSegmentKm, scoreRide, searchRides, formatTime,
});

// Backwards-compat shims for screens still referencing old API
window.PLACES = {
  home:     pointById('tsarevo'),
  center:   { ...pointById('baum'),    short: 'Центр' },
  metro:    { ...pointById('m_dubr'),  short: 'Дубравная' },
  airport:  { ...pointById('apo'),     short: 'Аэропорт' },
  station:  { ...pointById('rail1'),   short: 'Вокзал' },
  kremlin:  { ...pointById('kreml'),   short: 'Кремль' },
  univer:   { ...pointById('kfu'),     short: 'КФУ' },
  ikea:     { ...pointById('tc_mega'), short: 'МЕГА' },
  park:     { ...pointById('gorky'),   short: 'Парк' },
};
window.placeById = function(id) {
  if (!id) return null;
  // Old screens pass legacy ids ('home','center'…) OR new pointIds. Try both.
  if (window.PLACES[id]) return window.PLACES[id];
  return pointById(id);
};
