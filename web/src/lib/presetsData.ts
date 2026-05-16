// Хардкод адресов. Координаты из OSM/Nominatim — изменять только подтверждёнными значениями.
// Aliases: альтернативные написания для smart matching (нормализованы при сравнении).
// Дома ЖК Царёво вне списка ищутся через backend structured Nominatim (см. geocodeRouter.ts).

export interface PresetEntry {
  label: string;
  lat: number;
  lng: number;
  aliases?: string[];
}

function tsarevoAliases(house: number): string[] {
  const h = String(house);
  return [
    `тукая ${h}`,
    `ул тукая ${h}`,
    `ул. тукая ${h}`,
    `ул. тукая, ${h}`,
    `ул. тукая, д. ${h}`,
    `г. тукая ${h}`,
    `г.тукая ${h}`,
    `габдуллы тукая ${h}`,
    `царёво ${h}`,
    `царево ${h}`,
    `царёво village ${h}`,
    `царево village ${h}`,
  ];
}

export const PRESETS_RAW: PresetEntry[] = [
  // ЖК Царёво Village — ул. Габдуллы Тукая, с. Новое Шигалеево
  {
    label: "Царёво Village, ул. Тукая, д. 4",
    lat: 55.8110744,
    lng: 49.4335157,
    aliases: tsarevoAliases(4),
  },
  {
    label: "Царёво Village, ул. Тукая, д. 9",
    lat: 55.8094182,
    lng: 49.4328414,
    aliases: tsarevoAliases(9),
  },
  {
    label: "Царёво Village, ул. Тукая, д. 13",
    lat: 55.8096715,
    lng: 49.4343073,
    aliases: tsarevoAliases(13),
  },
  {
    label: "Царёво Village, ул. Тукая, д. 28",
    lat: 55.8122459,
    lng: 49.4402452,
    aliases: tsarevoAliases(28),
  },
  {
    label: "Царёво Village, ул. Тукая, д. 30",
    lat: 55.8123295,
    lng: 49.4407201,
    aliases: tsarevoAliases(30),
  },
  {
    label: "Царёво Village, ул. Тукая, д. 47",
    lat: 55.8112623,
    lng: 49.4433695,
    aliases: tsarevoAliases(47),
  },

  // Ближайшие сёла
  {
    label: "с. Новое Шигалеево, Пестречинский р-н",
    lat: 55.8133985,
    lng: 49.454154,
    aliases: ["новое шигалеево", "шигалеево"],
  },
  {
    label: "с. Старое Шигалеево, Пестречинский р-н",
    lat: 55.8237152,
    lng: 49.5081757,
    aliases: ["старое шигалеево"],
  },
  {
    label: "с. Кощаково, Пестречинский р-н",
    lat: 55.7985239,
    lng: 49.4054564,
    aliases: ["кощаково"],
  },
  { label: "д. Званка, Пестречинский р-н", lat: 55.8103593, lng: 49.3775579, aliases: ["званка"] },

  // Казань — частые точки
  {
    label: "Казанский аэропорт (KZN)",
    lat: 55.6062,
    lng: 49.2784,
    aliases: ["аэропорт", "kzn", "казанский аэропорт"],
  },
  {
    label: "ТЦ Кольцо, ул. Петербургская, Казань",
    lat: 55.7933,
    lng: 49.1205,
    aliases: ["кольцо", "тц кольцо"],
  },
  {
    label: "Казань, ж.д. вокзал (Казань-Пасс.)",
    lat: 55.796,
    lng: 49.1073,
    aliases: ["вокзал", "жд вокзал", "казань пасс"],
  },
  { label: "ТЦ МЕГА Казань, пр. Победы", lat: 55.863, lng: 49.099, aliases: ["мега", "тц мега"] },
  {
    label: "Казань, ул. Баумана (центр)",
    lat: 55.7867,
    lng: 49.1218,
    aliases: ["баумана", "центр казани"],
  },
];
