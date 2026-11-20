export interface CountryEntry {
  name: string;
  theorgSlug: string;
  aliases?: string[];
}

export interface ContinentEntry {
  id: string;
  name: string;
  countries: CountryEntry[];
}

export const COMPANY_REVENUE_RANGES: string[] = [
  'Under $1M',
  '$1M - $10M',
  '$10M - $50M',
  '$50M - $100M',
  '$100M - $500M',
  '$500M - $1B',
  '$1B - $10B',
  '$10B+',
];

const US_STATES_AND_HUBS = [
  'united states',
  'usa',
  'u.s.',
  'u.s.a.',
  'alabama',
  'alaska',
  'arizona',
  'arkansas',
  'california',
  'colorado',
  'connecticut',
  'delaware',
  'district of columbia',
  'washington, d.c.',
  'florida',
  'georgia',
  'hawaii',
  'idaho',
  'illinois',
  'indiana',
  'iowa',
  'kansas',
  'kentucky',
  'louisiana',
  'maine',
  'maryland',
  'massachusetts',
  'michigan',
  'minnesota',
  'mississippi',
  'missouri',
  'montana',
  'nebraska',
  'nevada',
  'new hampshire',
  'new jersey',
  'new mexico',
  'new york',
  'north carolina',
  'north dakota',
  'ohio',
  'oklahoma',
  'oregon',
  'pennsylvania',
  'rhode island',
  'south carolina',
  'south dakota',
  'tennessee',
  'texas',
  'utah',
  'vermont',
  'virginia',
  'washington',
  'west virginia',
  'wisconsin',
  'wyoming',
  'san francisco',
  'los angeles',
  'chicago',
  'boston',
  'seattle',
  'austin',
  'atlanta',
  'miami',
  'denver',
  'dallas',
  'houston',
  'palo alto',
  'mountain view',
  'cupertino',
  'menlo park',
  'sunnyvale',
  'san jose',
];

const CANADA_PROVINCES = [
  'canada',
  'ontario',
  'quebec',
  'british columbia',
  'alberta',
  'manitoba',
  'saskatchewan',
  'nova scotia',
  'new brunswick',
  'toronto',
  'vancouver',
  'montreal',
  'ottawa',
  'calgary',
  'waterloo',
];

export const CONTINENTS_CATALOG: ContinentEntry[] = [
  {
    id: 'north-america',
    name: 'North America',
    countries: [
      { name: 'United States', theorgSlug: 'united-states', aliases: US_STATES_AND_HUBS },
      { name: 'Canada', theorgSlug: 'canada', aliases: CANADA_PROVINCES },
      { name: 'Mexico', theorgSlug: 'mexico', aliases: ['mexico', 'mexico city', 'monterrey', 'guadalajara'] },
      { name: 'Costa Rica', theorgSlug: 'costa-rica', aliases: ['costa rica', 'san jose, costa rica'] },
      { name: 'Panama', theorgSlug: 'panama', aliases: ['panama'] },
      { name: 'Puerto Rico', theorgSlug: 'puerto-rico', aliases: ['puerto rico', 'san juan'] },
      { name: 'Dominican Republic', theorgSlug: 'dominican-republic', aliases: ['dominican republic', 'santo domingo'] },
      { name: 'Guatemala', theorgSlug: 'guatemala', aliases: ['guatemala'] },
      { name: 'Jamaica', theorgSlug: 'jamaica', aliases: ['jamaica', 'kingston'] },
      { name: 'Bahamas', theorgSlug: 'bahamas', aliases: ['bahamas', 'nassau'] },
      { name: 'Barbados', theorgSlug: 'barbados', aliases: ['barbados'] },
      { name: 'Trinidad and Tobago', theorgSlug: 'trinidad-and-tobago', aliases: ['trinidad', 'tobago'] },
      { name: 'Honduras', theorgSlug: 'honduras', aliases: ['honduras'] },
      { name: 'El Salvador', theorgSlug: 'el-salvador', aliases: ['el salvador'] },
      { name: 'Nicaragua', theorgSlug: 'nicaragua', aliases: ['nicaragua'] },
      { name: 'Belize', theorgSlug: 'belize', aliases: ['belize'] },
      { name: 'Bermuda', theorgSlug: 'bermuda', aliases: ['bermuda', 'hamilton, bermuda'] },
      { name: 'Cayman Islands', theorgSlug: 'cayman-islands', aliases: ['cayman islands', 'grand cayman'] },
      { name: 'Cuba', theorgSlug: 'cuba', aliases: ['cuba', 'havana'] },
      { name: 'Haiti', theorgSlug: 'haiti', aliases: ['haiti'] },
    ],
  },
  {
    id: 'europe',
    name: 'Europe',
    countries: [
      {
        name: 'United Kingdom',
        theorgSlug: 'united-kingdom',
        aliases: ['united kingdom', 'uk', 'england', 'scotland', 'wales', 'northern ireland', 'london', 'manchester', 'edinburgh', 'cambridge', 'oxford'],
      },
      { name: 'France', theorgSlug: 'france', aliases: ['france', 'paris', 'lyon', 'marseille', 'toulouse'] },
      { name: 'Germany', theorgSlug: 'germany', aliases: ['germany', 'berlin', 'munich', 'frankfurt', 'hamburg', 'stuttgart', 'cologne'] },
      { name: 'Netherlands', theorgSlug: 'netherlands', aliases: ['netherlands', 'amsterdam', 'rotterdam', 'utrecht', 'eindhoven'] },
      { name: 'Spain', theorgSlug: 'spain', aliases: ['spain', 'madrid', 'barcelona', 'valencia'] },
      { name: 'Italy', theorgSlug: 'italy', aliases: ['italy', 'milan', 'rome', 'turin', 'bologna'] },
      { name: 'Switzerland', theorgSlug: 'switzerland', aliases: ['switzerland', 'zurich', 'zürich', 'geneva', 'basel', 'zug', 'lausanne'] },
      { name: 'Sweden', theorgSlug: 'sweden', aliases: ['sweden', 'stockholm', 'gothenburg', 'malmö'] },
      { name: 'Belgium', theorgSlug: 'belgium', aliases: ['belgium', 'brussels', 'antwerp', 'ghent'] },
      { name: 'Poland', theorgSlug: 'poland', aliases: ['poland', 'warsaw', 'krakow', 'wroclaw'] },
      { name: 'Ireland', theorgSlug: 'ireland', aliases: ['ireland', 'dublin', 'cork', 'galway'] },
      { name: 'Denmark', theorgSlug: 'denmark', aliases: ['denmark', 'copenhagen', 'aarhus'] },
      { name: 'Norway', theorgSlug: 'norway', aliases: ['norway', 'oslo', 'bergen', 'stavanger'] },
      { name: 'Finland', theorgSlug: 'finland', aliases: ['finland', 'helsinki', 'espoo'] },
      { name: 'Austria', theorgSlug: 'austria', aliases: ['austria', 'vienna', 'graz', 'linz'] },
      { name: 'Portugal', theorgSlug: 'portugal', aliases: ['portugal', 'lisbon', 'porto'] },
      { name: 'Czech Republic', theorgSlug: 'czech-republic', aliases: ['czech republic', 'czechia', 'prague'] },
      { name: 'Romania', theorgSlug: 'romania', aliases: ['romania', 'bucharest', 'cluj'] },
      { name: 'Greece', theorgSlug: 'greece', aliases: ['greece', 'athens'] },
      { name: 'Hungary', theorgSlug: 'hungary', aliases: ['hungary', 'budapest'] },
      { name: 'Ukraine', theorgSlug: 'ukraine', aliases: ['ukraine', 'kyiv'] },
      { name: 'Luxembourg', theorgSlug: 'luxembourg', aliases: ['luxembourg'] },
      { name: 'Estonia', theorgSlug: 'estonia', aliases: ['estonia', 'tallinn'] },
      { name: 'Bulgaria', theorgSlug: 'bulgaria', aliases: ['bulgaria', 'sofia'] },
      { name: 'Croatia', theorgSlug: 'croatia', aliases: ['croatia', 'zagreb'] },
      { name: 'Serbia', theorgSlug: 'serbia', aliases: ['serbia', 'belgrade'] },
      { name: 'Slovakia', theorgSlug: 'slovakia', aliases: ['slovakia', 'bratislava'] },
      { name: 'Slovenia', theorgSlug: 'slovenia', aliases: ['slovenia', 'ljubljana'] },
      { name: 'Lithuania', theorgSlug: 'lithuania', aliases: ['lithuania', 'vilnius'] },
      { name: 'Latvia', theorgSlug: 'latvia', aliases: ['latvia', 'riga'] },
      { name: 'Cyprus', theorgSlug: 'cyprus', aliases: ['cyprus', 'limassol', 'nicosia'] },
      { name: 'Malta', theorgSlug: 'malta', aliases: ['malta'] },
      { name: 'Iceland', theorgSlug: 'iceland', aliases: ['iceland', 'reykjavik'] },
      { name: 'Monaco', theorgSlug: 'monaco', aliases: ['monaco'] },
      { name: 'Moldova', theorgSlug: 'moldova-republic-of', aliases: ['moldova', 'chisinau'] },
    ],
  },
  {
    id: 'asia',
    name: 'Asia',
    countries: [
      { name: 'India', theorgSlug: 'india', aliases: ['india', 'bengaluru', 'bangalore', 'mumbai', 'new delhi', 'delhi', 'gurgaon', 'gurugram', 'hyderabad', 'pune', 'chennai', 'noida'] },
      { name: 'Japan', theorgSlug: 'japan', aliases: ['japan', 'tokyo', 'osaka', 'yokohama', 'kyoto', 'nagoya'] },
      { name: 'Singapore', theorgSlug: 'singapore', aliases: ['singapore'] },
      { name: 'China', theorgSlug: 'china', aliases: ['china', 'beijing', 'shanghai', 'shenzhen', 'hangzhou', 'guangzhou'] },
      { name: 'United Arab Emirates', theorgSlug: 'united-arab-emirates', aliases: ['united arab emirates', 'uae', 'dubai', 'abu dhabi'] },
      { name: 'Israel', theorgSlug: 'israel', aliases: ['israel', 'tel aviv', 'jerusalem', 'herzliya', 'haifa'] },
      { name: 'Hong Kong', theorgSlug: 'hong-kong', aliases: ['hong kong'] },
      { name: 'Indonesia', theorgSlug: 'indonesia', aliases: ['indonesia', 'jakarta'] },
      { name: 'Turkey', theorgSlug: 'turkey', aliases: ['turkey', 'türkiye', 'istanbul', 'ankara'] },
      { name: 'South Korea', theorgSlug: 'korea-republic-of', aliases: ['south korea', 'korea', 'republic of korea', 'seoul', 'seongnam', 'busan'] },
      { name: 'Malaysia', theorgSlug: 'malaysia', aliases: ['malaysia', 'kuala lumpur'] },
      { name: 'Philippines', theorgSlug: 'philippines', aliases: ['philippines', 'manila', 'makati', 'taguig'] },
      { name: 'Pakistan', theorgSlug: 'pakistan', aliases: ['pakistan', 'karachi', 'lahore', 'islamabad'] },
      { name: 'Saudi Arabia', theorgSlug: 'saudi-arabia', aliases: ['saudi arabia', 'riyadh', 'jeddah'] },
      { name: 'Thailand', theorgSlug: 'thailand', aliases: ['thailand', 'bangkok'] },
      { name: 'Vietnam', theorgSlug: 'viet-nam', aliases: ['vietnam', 'viet nam', 'ho chi minh', 'hanoi'] },
      { name: 'Taiwan', theorgSlug: 'taiwan-province-of-china', aliases: ['taiwan', 'taipei', 'hsinchu'] },
      { name: 'Bangladesh', theorgSlug: 'bangladesh', aliases: ['bangladesh', 'dhaka'] },
      { name: 'Sri Lanka', theorgSlug: 'sri-lanka', aliases: ['sri lanka', 'colombo'] },
      { name: 'Qatar', theorgSlug: 'qatar', aliases: ['qatar', 'doha'] },
      { name: 'Lebanon', theorgSlug: 'lebanon', aliases: ['lebanon', 'beirut'] },
      { name: 'Jordan', theorgSlug: 'jordan', aliases: ['jordan', 'amman'] },
      { name: 'Kuwait', theorgSlug: 'kuwait', aliases: ['kuwait'] },
      { name: 'Bahrain', theorgSlug: 'bahrain', aliases: ['bahrain', 'manama'] },
      { name: 'Oman', theorgSlug: 'oman', aliases: ['oman', 'muscat'] },
      { name: 'Kazakhstan', theorgSlug: 'kazakhstan', aliases: ['kazakhstan', 'almaty', 'astana'] },
      { name: 'Nepal', theorgSlug: 'nepal', aliases: ['nepal', 'kathmandu'] },
      { name: 'Cambodia', theorgSlug: 'cambodia', aliases: ['cambodia', 'phnom penh'] },
      { name: 'Brunei', theorgSlug: 'brunei-darussalam', aliases: ['brunei'] },
    ],
  },
  {
    id: 'south-america',
    name: 'South America',
    countries: [
      { name: 'Brazil', theorgSlug: 'brazil', aliases: ['brazil', 'brasil', 'são paulo', 'sao paulo', 'rio de janeiro', 'curitiba', 'belo horizonte'] },
      { name: 'Argentina', theorgSlug: 'argentina', aliases: ['argentina', 'buenos aires', 'córdoba'] },
      { name: 'Colombia', theorgSlug: 'colombia', aliases: ['colombia', 'bogotá', 'bogota', 'medellín', 'medellin'] },
      { name: 'Chile', theorgSlug: 'chile', aliases: ['chile', 'santiago'] },
      { name: 'Peru', theorgSlug: 'peru', aliases: ['peru', 'lima'] },
      { name: 'Uruguay', theorgSlug: 'uruguay', aliases: ['uruguay', 'montevideo'] },
      { name: 'Ecuador', theorgSlug: 'ecuador', aliases: ['ecuador', 'quito', 'guayaquil'] },
      { name: 'Venezuela', theorgSlug: 'venezuela-bolivarian-republic-of', aliases: ['venezuela', 'caracas'] },
      { name: 'Bolivia', theorgSlug: 'bolivia-plurinational-state-of', aliases: ['bolivia', 'la paz', 'santa cruz'] },
      { name: 'Paraguay', theorgSlug: 'paraguay', aliases: ['paraguay', 'asunción', 'asuncion'] },
      { name: 'Guyana', theorgSlug: 'guyana', aliases: ['guyana', 'georgetown'] },
      { name: 'Suriname', theorgSlug: 'suriname', aliases: ['suriname'] },
    ],
  },
  {
    id: 'africa',
    name: 'Africa',
    countries: [
      { name: 'South Africa', theorgSlug: 'south-africa', aliases: ['south africa', 'johannesburg', 'cape town', 'durban', 'pretoria'] },
      { name: 'Nigeria', theorgSlug: 'nigeria', aliases: ['nigeria', 'lagos', 'abuja'] },
      { name: 'Egypt', theorgSlug: 'egypt', aliases: ['egypt', 'cairo', 'alexandria'] },
      { name: 'Kenya', theorgSlug: 'kenya', aliases: ['kenya', 'nairobi'] },
      { name: 'Morocco', theorgSlug: 'morocco', aliases: ['morocco', 'casablanca', 'rabat'] },
      { name: 'Ghana', theorgSlug: 'ghana', aliases: ['ghana', 'accra'] },
      { name: 'Tunisia', theorgSlug: 'tunisia', aliases: ['tunisia', 'tunis'] },
      { name: 'Uganda', theorgSlug: 'uganda', aliases: ['uganda', 'kampala'] },
      { name: 'Tanzania', theorgSlug: 'tanzania-united-republic-of', aliases: ['tanzania', 'dar es salaam'] },
      { name: 'Algeria', theorgSlug: 'algeria', aliases: ['algeria', 'algiers'] },
      { name: 'Rwanda', theorgSlug: 'rwanda', aliases: ['rwanda', 'kigali'] },
      { name: 'Mauritius', theorgSlug: 'mauritius', aliases: ['mauritius', 'port louis'] },
      { name: 'Senegal', theorgSlug: 'senegal', aliases: ['senegal', 'dakar'] },
      { name: 'Côte d’Ivoire', theorgSlug: "côte-d'ivoire", aliases: ["cote d'ivoire", "côte d'ivoire", 'ivory coast', 'abidjan'] },
      { name: 'Ethiopia', theorgSlug: 'ethiopia', aliases: ['ethiopia', 'addis ababa'] },
      { name: 'Zimbabwe', theorgSlug: 'zimbabwe', aliases: ['zimbabwe', 'harare'] },
      { name: 'Zambia', theorgSlug: 'zambia', aliases: ['zambia', 'lusaka'] },
      { name: 'Cameroon', theorgSlug: 'cameroon', aliases: ['cameroon', 'douala', 'yaounde'] },
      { name: 'Botswana', theorgSlug: 'botswana', aliases: ['botswana', 'gaborone'] },
      { name: 'Namibia', theorgSlug: 'namibia', aliases: ['namibia', 'windhoek'] },
      { name: 'DR Congo', theorgSlug: 'congo-the-democratic-republic-of-the', aliases: ['democratic republic of the congo', 'kinshasa', 'drc'] },
    ],
  },
  {
    id: 'oceania',
    name: 'Oceania',
    countries: [
      {
        name: 'Australia',
        theorgSlug: 'australia',
        aliases: ['australia', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'canberra', 'new south wales', 'victoria', 'queensland'],
      },
      { name: 'New Zealand', theorgSlug: 'new-zealand', aliases: ['new zealand', 'auckland', 'wellington', 'christchurch'] },
      { name: 'Fiji', theorgSlug: 'fiji', aliases: ['fiji', 'suva'] },
      { name: 'Papua New Guinea', theorgSlug: 'papua-new-guinea', aliases: ['papua new guinea', 'port moresby'] },
    ],
  },
  {
    id: 'antarctica',
    name: 'Antarctica',
    countries: [
      { name: 'Antarctica', theorgSlug: 'antarctica', aliases: ['antarctica', 'mcmurdo', 'south pole'] },
    ],
  },
];

/**
 * Resolves exact server-side country slugs when Continents or Countries are selected in the Sidebar.
 */
export function resolveCountrySlugsFromFilters(
  selectedContinents: string[],
  selectedCountries: string[]
): string[] {
  const slugs: string[] = [];
  const seen = new Set<string>();

  for (const continent of CONTINENTS_CATALOG) {
    const continentActive = selectedContinents.includes(continent.name);
    for (const country of continent.countries) {
      if (continentActive || selectedCountries.includes(country.name)) {
        if (!seen.has(country.theorgSlug)) {
          seen.add(country.theorgSlug);
          slugs.push(country.theorgSlug);
        }
      }
    }
  }

  return slugs;
}

const US_STATE_CODES = new Set([
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'dc', 'fl',
  'ga', 'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky', 'la', 'me',
  'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh',
  'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri',
  'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy',
]);

const CA_PROVINCE_CODES = new Set([
  'on', 'qc', 'bc', 'ab', 'mb', 'sk', 'ns', 'nb', 'nl', 'pe',
]);

function locationMatchesCountry(locLower: string, country: CountryEntry): boolean {
  if (locLower.includes(country.name.toLowerCase())) return true;
  if (locLower.includes(country.theorgSlug.replace(/-/g, ' '))) return true;

  if (country.theorgSlug === 'united-states') {
    const parts = locLower.split(',').map((s) => s.trim());
    if (parts.length >= 2 && US_STATE_CODES.has(parts[parts.length - 1])) {
      return true;
    }
  }
  if (country.theorgSlug === 'canada') {
    const parts = locLower.split(',').map((s) => s.trim());
    if (parts.length >= 2 && CA_PROVINCE_CODES.has(parts[parts.length - 1])) {
      return true;
    }
  }

  if (country.aliases) {
    for (const alias of country.aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(^|[,\\s])${escaped}($|[,\\s])`, 'i');
      if (regex.test(locLower)) return true;
    }
  }
  return false;
}

export function matchesGeographyFilter(
  locationText: string,
  selectedContinents: string[],
  selectedCountries: string[],
  freeTextQuery: string,
  sourceCountrySlug?: string,
  domain?: string
): boolean {
  const locLower = (locationText || '').trim().toLowerCase();
  const q = freeTextQuery.trim().toLowerCase();

  if (q && !locLower.includes(q) && !(sourceCountrySlug || '').replace(/-/g, ' ').includes(q)) {
    return false;
  }

  if (selectedContinents.length === 0 && selectedCountries.length === 0) {
    return true;
  }

  const allowedSlugs = resolveCountrySlugsFromFilters(
    selectedContinents,
    selectedCountries
  );

  // If the HQ location explicitly identifies a specific country (e.g. "Pittsburgh, PA, United States"),
  // that explicit HQ country ALWAYS takes precedence over a conflicting directory sourceCountrySlug!
  const explicitLocCountry =
    locLower && locLower !== 'global' && locLower !== 'worldwide'
      ? inferCountrySlugFromLocation(locationText)
      : undefined;

  if (explicitLocCountry) {
    return allowedSlugs.includes(explicitLocCountry);
  }

  // When location is "Global" or empty, honor the company's verified directory country slug
  if (sourceCountrySlug && allowedSlugs.includes(sourceCountrySlug)) {
    return true;
  }

  // Fallback to ccTLD (e.g. .ca, .co.uk, .de) when location is Global and sourceCountrySlug is empty
  if (!sourceCountrySlug && domain) {
    const ccSlug = inferCountrySlugFromLocation('', domain);
    if (ccSlug && allowedSlugs.includes(ccSlug)) {
      return true;
    }
  }

  if (!locLower) return false;

  if (selectedCountries.length > 0) {
    for (const continent of CONTINENTS_CATALOG) {
      for (const country of continent.countries) {
        if (
          selectedCountries.includes(country.name) &&
          locationMatchesCountry(locLower, country)
        ) {
          return true;
        }
      }
    }
  }

  if (selectedContinents.length > 0) {
    for (const continent of CONTINENTS_CATALOG) {
      if (selectedContinents.includes(continent.name)) {
        if (locLower.includes(continent.name.toLowerCase())) return true;
        for (const country of continent.countries) {
          if (locationMatchesCountry(locLower, country)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

const TEN_BILLION_PLUS_COMPANIES = new Set([
  'amazon',
  'walmart',
  'apple',
  'cvs health',
  'mckesson',
  'costco wholesale',
  'totalenergies',
  'toyota motor corporation',
  'ford',
  'lg electronics',
  'target',
  'shell',
  'tesla',
  'canon',
  'microsoft',
  'alphabet',
  'google',
  'meta',
  'samsung',
  'jpmorgan chase',
  'bank of america',
  'citigroup',
  'wells fargo',
  'goldman sachs',
  'morgan stanley',
  'stripe',
  'oracle',
  'salesforce',
  'sap',
  'accenture',
  'ibm',
  'intel',
  'nvidia',
  'cisco',
  'sony',
  'nike',
  'home depot',
  'kroger',
  'pfizer',
  'johnson & johnson',
  'merck',
  'abbvie',
  'siemens',
  'bosch',
  'volkswagen',
  'bmw',
  'mercedes-benz',
  'unilever',
  'nestle',
  'nestlé',
  'pepsico',
  'coca-cola',
  'procter & gamble',
  'deloitte',
  'pwc',
  'ey',
  'kpmg',
]);

export function estimateCompanyRevenueRange(
  employeeRange: string,
  companyName = ''
): string {
  const normName = companyName.trim().toLowerCase();
  if (TEN_BILLION_PLUS_COMPANIES.has(normName)) {
    return '$10B+';
  }

  let hash = 0;
  for (let i = 0; i < normName.length; i++) {
    hash = (hash * 31 + normName.charCodeAt(i)) >>> 0;
  }
  const bucket = hash % 10;

  switch (employeeRange) {
    case '10,000+':
      if (bucket < 5) return '$10B+';
      if (bucket < 9) return '$1B - $10B';
      return '$500M - $1B';
    case '5,001 - 10,000':
      if (bucket < 2) return '$10B+';
      if (bucket < 6) return '$1B - $10B';
      if (bucket < 9) return '$500M - $1B';
      return '$100M - $500M';
    case '1,001 - 5,000':
      if (bucket === 0) return '$1B - $10B';
      if (bucket < 5) return '$500M - $1B';
      if (bucket < 9) return '$100M - $500M';
      return '$50M - $100M';
    case '501 - 1,000':
      if (bucket === 0) return '$500M - $1B';
      if (bucket < 5) return '$100M - $500M';
      if (bucket < 9) return '$50M - $100M';
      return '$10M - $50M';
    case '201 - 500':
      if (bucket < 2) return '$100M - $500M';
      if (bucket < 6) return '$50M - $100M';
      if (bucket < 9) return '$10M - $50M';
      return '$1M - $10M';
    case '51 - 200':
      if (bucket === 0) return '$50M - $100M';
      if (bucket < 5) return '$10M - $50M';
      if (bucket < 9) return '$1M - $10M';
      return 'Under $1M';
    case '1 - 50':
      if (bucket === 0) return '$10M - $50M';
      if (bucket < 6) return '$1M - $10M';
      return 'Under $1M';
    default:
      return '$10M - $50M';
  }
}

const CCTLD_TO_COUNTRY_SLUG: Record<string, string> = {
  // North America & Caribbean
  us: 'united-states',
  ca: 'canada',
  mx: 'mexico',
  cr: 'costa-rica',
  pa: 'panama',
  pr: 'puerto-rico',
  do: 'dominican-republic',
  gt: 'guatemala',
  jm: 'jamaica',
  bs: 'bahamas',
  bb: 'barbados',
  tt: 'trinidad-and-tobago',
  hn: 'honduras',
  sv: 'el-salvador',
  ni: 'nicaragua',
  bz: 'belize',
  bm: 'bermuda',
  ky: 'cayman-islands',
  cu: 'cuba',
  ht: 'haiti',
  // Europe
  uk: 'united-kingdom',
  gb: 'united-kingdom',
  de: 'germany',
  fr: 'france',
  nl: 'netherlands',
  es: 'spain',
  it: 'italy',
  ch: 'switzerland',
  se: 'sweden',
  no: 'norway',
  dk: 'denmark',
  fi: 'finland',
  be: 'belgium',
  at: 'austria',
  pl: 'poland',
  ie: 'ireland',
  pt: 'portugal',
  cz: 'czech-republic',
  ro: 'romania',
  gr: 'greece',
  hu: 'hungary',
  ua: 'ukraine',
  lu: 'luxembourg',
  ee: 'estonia',
  bg: 'bulgaria',
  hr: 'croatia',
  rs: 'serbia',
  sk: 'slovakia',
  si: 'slovenia',
  lt: 'lithuania',
  lv: 'latvia',
  cy: 'cyprus',
  mt: 'malta',
  is: 'iceland',
  mc: 'monaco',
  md: 'moldova-republic-of',
  // Asia & Middle East
  in: 'india',
  jp: 'japan',
  sg: 'singapore',
  cn: 'china',
  ae: 'united-arab-emirates',
  il: 'israel',
  hk: 'hong-kong',
  id: 'indonesia',
  tr: 'turkey',
  kr: 'korea-republic-of',
  my: 'malaysia',
  ph: 'philippines',
  pk: 'pakistan',
  sa: 'saudi-arabia',
  th: 'thailand',
  vn: 'viet-nam',
  tw: 'taiwan-province-of-china',
  bd: 'bangladesh',
  lk: 'sri-lanka',
  qa: 'qatar',
  lb: 'lebanon',
  jo: 'jordan',
  kw: 'kuwait',
  bh: 'bahrain',
  om: 'oman',
  kz: 'kazakhstan',
  np: 'nepal',
  kh: 'cambodia',
  bn: 'brunei-darussalam',
  // South America
  br: 'brazil',
  ar: 'argentina',
  cl: 'chile',
  pe: 'peru',
  uy: 'uruguay',
  ec: 'ecuador',
  ve: 'venezuela-bolivarian-republic-of',
  bo: 'bolivia-plurinational-state-of',
  py: 'paraguay',
  gy: 'guyana',
  sr: 'suriname',
  // Africa
  za: 'south-africa',
  ng: 'nigeria',
  eg: 'egypt',
  ke: 'kenya',
  ma: 'morocco',
  gh: 'ghana',
  tn: 'tunisia',
  ug: 'uganda',
  tz: 'tanzania-united-republic-of',
  dz: 'algeria',
  rw: 'rwanda',
  mu: 'mauritius',
  sn: 'senegal',
  ci: "côte-d'ivoire",
  et: 'ethiopia',
  zw: 'zimbabwe',
  zm: 'zambia',
  cm: 'cameroon',
  bw: 'botswana',
  na: 'namibia',
  cd: 'congo-the-democratic-republic-of-the',
  // Oceania & Antarctica
  au: 'australia',
  nz: 'new-zealand',
  fj: 'fiji',
  pg: 'papua-new-guinea',
  aq: 'antarctica',
};

/**
 * Infers canonical TheOrg country slug from freeform HQ location text and/or corporate domain ccTLD.
 */
export function inferCountrySlugFromLocation(
  locationText?: string | null,
  domain?: string | null
): string | undefined {
  const locLower = (locationText || '').trim().toLowerCase();
  if (locLower && locLower !== 'global' && locLower !== 'worldwide') {
    const commaParts = locLower
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const tail = commaParts[commaParts.length - 1] || '';

    // Fast exact check on trailing segment first (e.g. "San Francisco, CA, United States" or "Austin, TX")
    if (
      tail === 'united states' ||
      tail === 'usa' ||
      tail === 'us' ||
      tail === 'u.s.' ||
      tail === 'u.s.a.' ||
      (commaParts.length >= 2 && US_STATE_CODES.has(tail))
    ) {
      return 'united-states';
    }
    if (
      tail === 'canada' ||
      (commaParts.length >= 2 && CA_PROVINCE_CODES.has(tail))
    ) {
      return 'canada';
    }

    for (const continent of CONTINENTS_CATALOG) {
      for (const country of continent.countries) {
        if (locationMatchesCountry(locLower, country)) {
          return country.theorgSlug;
        }
      }
    }
  }

  if (domain) {
    const cleanDom = domain.trim().toLowerCase();
    const parts = cleanDom.split('.');
    const tld = parts[parts.length - 1] || '';
    // Note: generic commercial ccTLDs like .io, .ai, .co, .me, .tv, .gg are global tech TLDs, not country indicators
    if (tld && CCTLD_TO_COUNTRY_SLUG[tld]) {
      return CCTLD_TO_COUNTRY_SLUG[tld];
    }
  }

  return undefined;
}

export function estimateIndexedContactsForRange(employeeRange: string): number {
  switch (employeeRange) {
    case '10,000+':
      return 1850;
    case '5,001 - 10,000':
      return 920;
    case '1,001 - 5,000':
      return 410;
    case '501 - 1,000':
      return 180;
    case '201 - 500':
      return 88;
    case '51 - 200':
      return 36;
    case '1 - 50':
      return 12;
    default:
      return 38;
  }
}

