/**
 * Country normalizer for the CLI.
 * Converts "Belgium", "belgie", "BE", "belg" etc. → "BE"
 */

const COUNTRY_ALIASES: Record<string, string> = {
  // ISO codes
  "us": "US", "gb": "GB", "uk": "GB", "fr": "FR", "de": "DE", "it": "IT",
  "ca": "CA", "au": "AU", "be": "BE", "nl": "NL", "ie": "IE", "pl": "PL",
  "se": "SE", "dk": "DK", "no": "NO", "fi": "FI", "at": "AT", "ch": "CH",
  "es": "ES", "pt": "PT", "cz": "CZ", "sk": "SK", "hu": "HU", "ro": "RO",
  "bg": "BG", "hr": "HR", "si": "SI", "gr": "GR", "ee": "EE", "lv": "LV",
  "lt": "LT", "lu": "LU", "li": "LI", "mc": "MC", "sm": "SM", "mx": "MX",
  "pr": "PR", "nz": "NZ", "ae": "AE", "br": "BR", "jp": "JP", "cn": "CN",
  "kr": "KR", "in": "IN", "sg": "SG", "za": "ZA", "il": "IL", "tr": "TR",
  "ru": "RU", "ua": "UA", "ph": "PH", "co": "CO", "ar": "AR", "cl": "CL",
  "th": "TH", "my": "MY", "id": "ID", "vn": "VN", "tw": "TW",
  // English names
  "united states": "US", "united states of america": "US", "usa": "US", "america": "US",
  "united kingdom": "GB", "great britain": "GB", "england": "GB", "scotland": "GB", "wales": "GB", "britain": "GB",
  "france": "FR", "germany": "DE", "italy": "IT", "spain": "ES", "portugal": "PT",
  "canada": "CA", "australia": "AU", "new zealand": "NZ",
  "belgium": "BE", "netherlands": "NL", "holland": "NL", "the netherlands": "NL",
  "ireland": "IE", "poland": "PL", "sweden": "SE", "denmark": "DK",
  "norway": "NO", "finland": "FI", "austria": "AT", "switzerland": "CH",
  "czech republic": "CZ", "czechia": "CZ", "slovakia": "SK", "hungary": "HU",
  "romania": "RO", "bulgaria": "BG", "croatia": "HR", "slovenia": "SI",
  "greece": "GR", "estonia": "EE", "latvia": "LV", "lithuania": "LT",
  "luxembourg": "LU", "liechtenstein": "LI", "monaco": "MC", "san marino": "SM",
  "mexico": "MX", "puerto rico": "PR",
  "united arab emirates": "AE", "emirates": "AE", "uae": "AE",
  "brazil": "BR", "japan": "JP", "china": "CN", "south korea": "KR", "korea": "KR",
  "india": "IN", "singapore": "SG", "south africa": "ZA", "israel": "IL", "turkey": "TR",
  "russia": "RU", "russian federation": "RU", "ukraine": "UA",
  "philippines": "PH", "colombia": "CO", "argentina": "AR", "chile": "CL",
  "thailand": "TH", "malaysia": "MY", "indonesia": "ID", "vietnam": "VN", "taiwan": "TW",
  // Native names
  "deutschland": "DE", "italia": "IT", "espana": "ES", "españa": "ES",
  "belgique": "BE", "belgie": "BE", "belgië": "BE", "belgien": "BE",
  "nederland": "NL", "osterreich": "AT", "österreich": "AT",
  "schweiz": "CH", "suisse": "CH", "svizzera": "CH",
  "polska": "PL", "sverige": "SE", "danmark": "DK", "norge": "NO", "suomi": "FI",
  "hrvatska": "HR", "slovensko": "SK", "slovenija": "SI",
  "eesti": "EE", "latvija": "LV", "lietuva": "LT", "luxemburg": "LU",
  "magyarorszag": "HU", "magyarország": "HU",
  "turkiye": "TR", "türkiye": "TR", "brasil": "BR", "méxico": "MX",
  // Common typos
  "belguim": "BE", "belgum": "BE", "nethrelands": "NL", "sweeden": "SE",
  "philipines": "PH", "phillipines": "PH", "columbia": "CO",
};

const CODE_TO_NAME: Record<string, string> = {
  US: "United States", GB: "United Kingdom", FR: "France", DE: "Germany",
  IT: "Italy", CA: "Canada", AU: "Australia", BE: "Belgium", NL: "Netherlands",
  IE: "Ireland", PL: "Poland", SE: "Sweden", DK: "Denmark", NO: "Norway",
  FI: "Finland", AT: "Austria", CH: "Switzerland", ES: "Spain", PT: "Portugal",
  CZ: "Czech Republic", SK: "Slovakia", HU: "Hungary", RO: "Romania",
  BG: "Bulgaria", HR: "Croatia", SI: "Slovenia", GR: "Greece", EE: "Estonia",
  LV: "Latvia", LT: "Lithuania", LU: "Luxembourg", LI: "Liechtenstein",
  MC: "Monaco", SM: "San Marino", MX: "Mexico", PR: "Puerto Rico",
  NZ: "New Zealand", AE: "United Arab Emirates", BR: "Brazil", JP: "Japan",
  CN: "China", KR: "South Korea", IN: "India", SG: "Singapore",
  ZA: "South Africa", IL: "Israel", TR: "Turkey", RU: "Russia", UA: "Ukraine",
  PH: "Philippines", CO: "Colombia", AR: "Argentina", CL: "Chile",
  TH: "Thailand", MY: "Malaysia", ID: "Indonesia", VN: "Vietnam", TW: "Taiwan",
};

function stripDiacritics(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export interface CountryResult {
  code: string | null;
  name: string | null;
  exact: boolean;
}

export function normalizeCountry(input: string): CountryResult {
  if (!input?.trim()) return { code: null, name: null, exact: false };

  const lower = input.trim().toLowerCase();
  const stripped = stripDiacritics(lower);

  // 1. Direct lookup
  const direct = COUNTRY_ALIASES[lower] || COUNTRY_ALIASES[stripped];
  if (direct) {
    return { code: direct, name: CODE_TO_NAME[direct] || direct, exact: true };
  }

  // 2. Already 2-letter code?
  if (/^[a-zA-Z]{2}$/.test(input.trim())) {
    const upper = input.trim().toUpperCase();
    const name = CODE_TO_NAME[upper];
    if (name) return { code: upper, name, exact: true };
    return { code: upper, name: null, exact: false };
  }

  // 3. Prefix match
  const keys = Object.keys(COUNTRY_ALIASES);
  const prefixMatch = keys.find(k => k.length > 2 && (k.startsWith(lower) || k.startsWith(stripped)));
  if (prefixMatch) {
    const code = COUNTRY_ALIASES[prefixMatch];
    return { code, name: CODE_TO_NAME[code] || code, exact: false };
  }

  // 4. Substring match
  const subMatch = keys.find(k => k.length > 2 && (k.includes(lower) || k.includes(stripped)));
  if (subMatch) {
    const code = COUNTRY_ALIASES[subMatch];
    return { code, name: CODE_TO_NAME[code] || code, exact: false };
  }

  return { code: null, name: null, exact: false };
}

export function getCountryName(code: string): string | null {
  return CODE_TO_NAME[code.toUpperCase()] || null;
}
