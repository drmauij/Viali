// client/src/utils/demoMode.ts

const DEMO_MODE_KEY = "viali_demo_mode";

// --- Toggle ---

export function isDemoMode(): boolean {
  return localStorage.getItem(DEMO_MODE_KEY) === "true";
}

export function toggleDemoMode(): boolean {
  const next = !isDemoMode();
  localStorage.setItem(DEMO_MODE_KEY, next ? "true" : "false");
  return next;
}

// --- Deterministic hash → seed ---

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function seededPick<T>(seed: number, arr: T[]): T {
  return arr[seed % arr.length];
}

// --- Fake data pools (Swiss/German names) ---

const FIRST_NAMES_F = [
  "Laura", "Anna", "Sophie", "Elena", "Lena", "Nina", "Sara", "Julia",
  "Marie", "Lea", "Nadia", "Chiara", "Mia", "Lara", "Eva", "Hanna",
  "Lisa", "Jana", "Alina", "Selina", "Fiona", "Noemi", "Anja", "Petra",
];
const FIRST_NAMES_M = [
  "Lukas", "Noah", "Leon", "David", "Liam", "Elias", "Jonas", "Tim",
  "Marco", "Jan", "Felix", "Nico", "Fabio", "Marc", "Stefan", "Daniel",
  "Patrick", "Thomas", "Simon", "Adrian", "Reto", "Beat", "Urs", "Peter",
];
const FIRST_NAMES = [...FIRST_NAMES_F, ...FIRST_NAMES_M];

const SURNAMES = [
  "Müller", "Meier", "Schmid", "Keller", "Weber", "Huber", "Schneider",
  "Meyer", "Steiner", "Fischer", "Gerber", "Brunner", "Baumann", "Frei",
  "Zimmermann", "Moser", "Widmer", "Wyss", "Graf", "Roth", "Baumgartner",
  "Sutter", "Hofer", "Berger", "Lang", "Kurz", "Vogel", "Lehmann",
];

const STREETS = [
  "Bahnhofstrasse", "Hauptstrasse", "Dorfstrasse", "Kirchgasse",
  "Poststrasse", "Schulstrasse", "Seestrasse", "Bergstrasse",
  "Industriestrasse", "Gartenstrasse", "Birkenweg", "Rosenweg",
  "Lindenstrasse", "Mühlegasse", "Feldstrasse", "Sonnhaldenweg",
];

const CITIES = [
  "Zürich", "Bern", "Luzern", "Basel", "St. Gallen", "Winterthur",
  "Aarau", "Thun", "Olten", "Baden", "Zug", "Biel", "Solothurn",
  "Schaffhausen", "Frauenfeld", "Chur", "Rapperswil", "Wil",
];

const POSTAL_CODES = [
  "8001", "3011", "6003", "4051", "9000", "8400", "5000", "3600",
  "4600", "5400", "6300", "2502", "4500", "8200", "8500", "7000",
];

const EMAIL_DOMAINS = [
  "gmail.com", "bluewin.ch", "sunrise.ch", "gmx.ch", "outlook.com",
  "hispeed.ch", "protonmail.com", "icloud.com",
];

// --- Field-level replacers ---

function fakeFirstName(original: string): string {
  return seededPick(hashString(original), FIRST_NAMES);
}

function fakeSurname(original: string): string {
  return seededPick(hashString(original), SURNAMES);
}

function fakeEmail(original: string): string {
  const seed = hashString(original);
  const first = seededPick(seed, FIRST_NAMES).toLowerCase();
  const last = seededPick(seed + 1, SURNAMES).toLowerCase().replace("ü", "ue").replace("ä", "ae").replace("ö", "oe");
  const domain = seededPick(seed + 2, EMAIL_DOMAINS);
  return `${first}.${last}@${domain}`;
}

function fakePhone(original: string): string {
  const seed = hashString(original);
  const prefix = seededPick(seed, ["076", "077", "078", "079"]);
  const num = String(seed).padStart(7, "0").slice(0, 7);
  return `${prefix} ${num.slice(0, 3)} ${num.slice(3, 5)} ${num.slice(5, 7)}`;
}

function fakeStreet(original: string): string {
  const seed = hashString(original);
  return `${seededPick(seed, STREETS)} ${(seed % 120) + 1}`;
}

function fakeCity(original: string): string {
  return seededPick(hashString(original), CITIES);
}

function fakePostalCode(original: string): string {
  return seededPick(hashString(original), POSTAL_CODES);
}

function fakeAddress(original: string): string {
  const seed = hashString(original);
  return `${seededPick(seed, STREETS)} ${(seed % 120) + 1}, ${seededPick(seed + 1, POSTAL_CODES)} ${seededPick(seed + 2, CITIES)}`;
}

function fakeInsuranceNumber(original: string): string {
  const seed = hashString(original);
  return `${String(seed).padStart(10, "0").slice(0, 10)}`;
}

function fakeAhv(original: string): string {
  const seed = hashString(original);
  const s = String(seed).padStart(10, "0");
  return `756.${s.slice(0, 4)}.${s.slice(4, 8)}.${s.slice(8, 10)}`;
}

function fakeEmergencyContact(original: string): string {
  const seed = hashString(original);
  const name = `${seededPick(seed, FIRST_NAMES)} ${seededPick(seed + 1, SURNAMES)}`;
  const phone = fakePhone(original);
  return `${name}, ${phone}`;
}

function fakePatientNumber(original: string): string {
  const seed = hashString(original);
  const match = original.match(/^([A-Z]+-\d{4}-)(\d+)$/);
  if (match) {
    return `${match[1]}${String(seed % 9999).padStart(match[2].length, "0")}`;
  }
  return `P-${String(seed % 999999).padStart(6, "0")}`;
}

// --- PII field name → replacer mapping ---

const PII_FIELDS: Record<string, (val: string) => string> = {
  firstName: fakeFirstName,
  surname: fakeSurname,
  email: fakeEmail,
  phone: fakePhone,
  street: fakeStreet,
  city: fakeCity,
  postalCode: fakePostalCode,
  address: fakeAddress,
  insuranceNumber: fakeInsuranceNumber,
  healthInsuranceNumber: fakeAhv,
  emergencyContact: fakeEmergencyContact,
  patientNumber: fakePatientNumber,
  patientFirstName: fakeFirstName,
  patientLastName: fakeSurname,
  patientSurname: fakeSurname,
  patientEmail: fakeEmail,
  patientPhone: fakePhone,
  patientName: (val: string) => {
    const seed = hashString(val);
    return `${seededPick(seed, FIRST_NAMES)} ${seededPick(seed + 1, SURNAMES)}`;
  },
};

const SKIP_PARENT_KEYS = new Set(["provider", "colleague", "user", "createdBy", "updatedBy"]);

// --- Global fetch interceptor ---
// Wraps Response.json() for /api/ calls so demo mode anonymisation
// applies everywhere, even in custom queryFn / raw fetch() calls.

const _origFetch = window.fetch;
window.fetch = async function (...args: Parameters<typeof fetch>) {
  const res = await _origFetch.apply(this, args);
  if (!isDemoMode()) return res;

  // Only intercept our own API calls
  const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
  if (!url.includes("/api/")) return res;

  const origJson = res.json.bind(res);
  let _called = false;
  let _cached: unknown;
  (res as any).json = async () => {
    if (_called) return _cached;
    const data = await origJson();
    _cached = transformDemoResponse(data);
    _called = true;
    return _cached;
  };
  return res;
};

// --- Recursive response transformer ---

export function transformDemoResponse(data: unknown, parentKey?: string): unknown {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map((item) => transformDemoResponse(item, parentKey));
  }

  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (key.endsWith("Url") || key.endsWith("url")) {
        result[key] = val;
        continue;
      }
      if (SKIP_PARENT_KEYS.has(key)) {
        result[key] = val;
        continue;
      }
      if (typeof val === "string" && val.length > 0 && PII_FIELDS[key]) {
        result[key] = PII_FIELDS[key](val);
      } else {
        result[key] = transformDemoResponse(val, key);
      }
    }
    return result;
  }

  return data;
}
