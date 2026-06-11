// Metadatos de los 48 equipos del Mundial 2026.
// key: nombre en español usado en el fixture de Firestore.
// flag: código ISO 3166-1 alpha-2 para flagcdn.com
// en: nombre en inglés usado por la API de openfootball (worldcup.json)
export const TEAMS = {
    'México':               { flag: 'mx',     en: 'Mexico' },
    'Sudáfrica':            { flag: 'za',     en: 'South Africa' },
    'Corea del Sur':        { flag: 'kr',     en: 'South Korea' },
    'Chequia':              { flag: 'cz',     en: 'Czech Republic' },
    'Canadá':               { flag: 'ca',     en: 'Canada' },
    'Bosnia y Herzegovina': { flag: 'ba',     en: 'Bosnia & Herzegovina' },
    'Estados Unidos':       { flag: 'us',     en: 'USA' },
    'EE. UU.':              { flag: 'us',     en: 'USA' },
    'Paraguay':             { flag: 'py',     en: 'Paraguay' },
    'Catar':                { flag: 'qa',     en: 'Qatar' },
    'Suiza':                { flag: 'ch',     en: 'Switzerland' },
    'Brasil':               { flag: 'br',     en: 'Brazil' },
    'Marruecos':            { flag: 'ma',     en: 'Morocco' },
    'Haití':                { flag: 'ht',     en: 'Haiti' },
    'Escocia':              { flag: 'gb-sct', en: 'Scotland' },
    'Australia':            { flag: 'au',     en: 'Australia' },
    'Turquía':              { flag: 'tr',     en: 'Turkey' },
    'Alemania':             { flag: 'de',     en: 'Germany' },
    'Curazao':              { flag: 'cw',     en: 'Curaçao' },
    'Países Bajos':         { flag: 'nl',     en: 'Netherlands' },
    'Japón':                { flag: 'jp',     en: 'Japan' },
    'Costa de Marfil':      { flag: 'ci',     en: 'Ivory Coast' },
    'Ecuador':              { flag: 'ec',     en: 'Ecuador' },
    'Suecia':               { flag: 'se',     en: 'Sweden' },
    'Túnez':                { flag: 'tn',     en: 'Tunisia' },
    'España':               { flag: 'es',     en: 'Spain' },
    'Cabo Verde':           { flag: 'cv',     en: 'Cape Verde' },
    'Bélgica':              { flag: 'be',     en: 'Belgium' },
    'Egipto':               { flag: 'eg',     en: 'Egypt' },
    'Arabia Saudita':       { flag: 'sa',     en: 'Saudi Arabia' },
    'Uruguay':              { flag: 'uy',     en: 'Uruguay' },
    'Irán':                 { flag: 'ir',     en: 'Iran' },
    'Nueva Zelanda':        { flag: 'nz',     en: 'New Zealand' },
    'Francia':              { flag: 'fr',     en: 'France' },
    'Senegal':              { flag: 'sn',     en: 'Senegal' },
    'Irak':                 { flag: 'iq',     en: 'Iraq' },
    'Noruega':              { flag: 'no',     en: 'Norway' },
    'Argentina':            { flag: 'ar',     en: 'Argentina' },
    'Argelia':              { flag: 'dz',     en: 'Algeria' },
    'Austria':              { flag: 'at',     en: 'Austria' },
    'Jordania':             { flag: 'jo',     en: 'Jordan' },
    'Portugal':             { flag: 'pt',     en: 'Portugal' },
    'RD Congo':             { flag: 'cd',     en: 'DR Congo' },
    'Inglaterra':           { flag: 'gb-eng', en: 'England' },
    'Croacia':              { flag: 'hr',     en: 'Croatia' },
    'Ghana':                { flag: 'gh',     en: 'Ghana' },
    'Panamá':               { flag: 'pa',     en: 'Panama' },
    'Uzbekistán':           { flag: 'uz',     en: 'Uzbekistan' },
    'Colombia':             { flag: 'co',     en: 'Colombia' }
};

// La API a veces entrega 'Curaçao' con encoding raro; normalizamos por si acaso.
const EN_ALIASES = { 'Curacao': 'Curaçao', 'United States': 'USA', 'Czechia': 'Czech Republic', 'Türkiye': 'Turkey', "Côte d'Ivoire": 'Ivory Coast' };

// El fixture local usa más de un nombre para el mismo equipo; canonicalizamos para cruzar partidos.
const ES_ALIASES = { 'EE. UU.': 'Estados Unidos' };

export function canonicalTeam(teamEs) {
    return ES_ALIASES[teamEs] || teamEs;
}

const EN_INDEX = {};
for (const [es, data] of Object.entries(TEAMS)) {
    EN_INDEX[normalizeEn(data.en)] = es;
}

function normalizeEn(name) {
    return String(name).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z& ]/g, '')
        .trim();
}

// Devuelve el nombre en español a partir del nombre en inglés de la API (o null si no se reconoce).
export function teamFromEnglish(enName) {
    const aliased = EN_ALIASES[enName] || enName;
    return EN_INDEX[normalizeEn(aliased)] || null;
}

export function flagUrl(teamEs, size = 40) {
    const t = TEAMS[teamEs];
    if (!t) return null;
    return `https://flagcdn.com/w${size}/${t.flag}.png`;
}

export function flagImg(teamEs, cls = 'team-flag') {
    const url = flagUrl(teamEs, 40);
    const url2x = flagUrl(teamEs, 80);
    if (!url) return `<span class="${cls} team-flag-placeholder"><i class="fa-solid fa-flag"></i></span>`;
    return `<img class="${cls}" src="${url}" srcset="${url2x} 2x" alt="${teamEs}" loading="lazy" onerror="this.style.visibility='hidden'">`;
}
