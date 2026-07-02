// Integración con openfootball/worldcup.json (datos públicos, sin API key, CORS habilitado).
// Fuente: https://github.com/openfootball/worldcup.json
// Esta API es la FUENTE DE VERDAD de fechas, sedes y resultados: no se escribe nada en Firestore.
import { teamFromEnglish, canonicalTeam } from './teams.js';

const API_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const CACHE_KEY = 'wc2026_api_cache_v1';

// Sedes oficiales del Mundial 2026: nombre exacto del campo "ground" de la API.
export const VENUES = {
    'Mexico City':                           { estadio: 'Estadio Azteca', ciudad: 'Ciudad de México', pais: 'mx' },
    'Guadalajara (Zapopan)':                 { estadio: 'Estadio Akron', ciudad: 'Guadalajara', pais: 'mx' },
    'Monterrey (Guadalupe)':                 { estadio: 'Estadio BBVA', ciudad: 'Monterrey', pais: 'mx' },
    'Toronto':                               { estadio: 'BMO Field', ciudad: 'Toronto', pais: 'ca' },
    'Vancouver':                             { estadio: 'BC Place', ciudad: 'Vancouver', pais: 'ca' },
    'Atlanta':                               { estadio: 'Mercedes-Benz Stadium', ciudad: 'Atlanta', pais: 'us' },
    'Boston (Foxborough)':                   { estadio: 'Gillette Stadium', ciudad: 'Boston', pais: 'us' },
    'Dallas (Arlington)':                    { estadio: 'AT&T Stadium', ciudad: 'Dallas', pais: 'us' },
    'Houston':                               { estadio: 'NRG Stadium', ciudad: 'Houston', pais: 'us' },
    'Kansas City':                           { estadio: 'Arrowhead Stadium', ciudad: 'Kansas City', pais: 'us' },
    'Los Angeles (Inglewood)':               { estadio: 'SoFi Stadium', ciudad: 'Los Ángeles', pais: 'us' },
    'Miami (Miami Gardens)':                 { estadio: 'Hard Rock Stadium', ciudad: 'Miami', pais: 'us' },
    'New York/New Jersey (East Rutherford)': { estadio: 'MetLife Stadium', ciudad: 'Nueva York/NJ', pais: 'us' },
    'Philadelphia':                          { estadio: 'Lincoln Financial Field', ciudad: 'Filadelfia', pais: 'us' },
    'San Francisco Bay Area (Santa Clara)':  { estadio: "Levi's Stadium", ciudad: 'San Francisco', pais: 'us' },
    'Seattle':                               { estadio: 'Lumen Field', ciudad: 'Seattle', pais: 'us' }
};

// Convierte date "2026-06-11" + time "13:00 UTC-6" a ISO con offset: "2026-06-11T13:00:00-06:00"
function toIso(date, time) {
    if (!date || !time) return null;
    const m = String(time).match(/^(\d{1,2}):(\d{2})(?:\s*UTC([+-]\d{1,2})(?::?(\d{2}))?)?/);
    if (!m) return null;
    const hh = m[1].padStart(2, '0');
    const mm = m[2];
    let offset = '-04:00'; // por defecto, hora Bolivia
    if (m[3]) {
        const sign = m[3].startsWith('-') ? '-' : '+';
        const oh = String(Math.abs(parseInt(m[3]))).padStart(2, '0');
        const om = m[4] || '00';
        offset = `${sign}${oh}:${om}`;
    }
    return `${date}T${hh}:${mm}:00${offset}`;
}

export function pairKey(teamA, teamB) {
    return [canonicalTeam(teamA), canonicalTeam(teamB)].sort().join('|');
}

function parseApiData(data) {
    const byPair = new Map();
    const knockouts = [];
    
    for (const m of data.matches || []) {
        const venue = VENUES[m.ground] || null;
        const apiMatch = {
            fecha_hora: toIso(m.date, m.time),
            grupo: m.group ? m.group.replace('Group', 'Grupo') : null,
            num: m.num || null,
            estadio: venue ? venue.estadio : (m.ground || null),
            ciudad: venue ? venue.ciudad : null,
            pais_sede: venue ? venue.pais : null,
            goles_local: (m.score && Array.isArray(m.score.ft)) ? m.score.ft[0] : null,
            goles_visitante: (m.score && Array.isArray(m.score.ft)) ? m.score.ft[1] : null,
            raw_local: typeof m.team1 === 'string' ? m.team1 : (m.team1 ? m.team1.name : "TBD"),
            raw_visit: typeof m.team2 === 'string' ? m.team2 : (m.team2 ? m.team2.name : "TBD"),
            jornada: m.round || null
        };

        const t1 = teamFromEnglish(m.team1);
        const t2 = teamFromEnglish(m.team2);
        
        if (t1 && t2) {
            apiMatch.local = t1;
            apiMatch.visitante = t2;
            byPair.set(pairKey(t1, t2), apiMatch);
        }

        if (!m.group) {
            knockouts.push(apiMatch);
        }
    }
    return { byPair, knockouts };
}

async function fetchWithCache() {
    try {
        const res = await fetch(API_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`API respondió ${res.status}`);
        const data = await res.json();
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
        } catch (e) { /* almacenamiento lleno o bloqueado: seguimos sin caché */ }
        return { data, fromCache: false, ts: Date.now() };
    } catch (err) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const { ts, data } = JSON.parse(cached);
            console.warn('API no disponible, usando caché local', err);
            return { data, fromCache: true, ts };
        }
        throw err;
    }
}

// Fusiona el fixture base de Firestore (ids j1_1..j3_24 + jornada + equipos) con los
// datos vivos de la API: fechas oficiales, sede, grupo y resultados.
// Devuelve { matches, meta }. Si la API y la caché fallan, devuelve el fixture base intacto.
export async function loadTournamentData(localMatches) {
    let byPair = null;
    let knockouts = [];
    let meta = { apiOk: false, fromCache: false, ts: null };
    try {
        const { data, fromCache, ts } = await fetchWithCache();
        const parsed = parseApiData(data);
        byPair = parsed.byPair;
        knockouts = parsed.knockouts;
        meta = { apiOk: true, fromCache, ts };
    } catch (e) {
        console.error('Sin datos de API ni caché; usando solo Firestore', e);
    }

    const matches = localMatches.map(lm => {
        const m = { ...lm, grupo: null, estadio: null, ciudad: null, pais_sede: null };
        if (!byPair) return m;
        const api = byPair.get(pairKey(lm.equipo_local, lm.equipo_visitante));
        if (!api) return m;

        if (api.fecha_hora) m.fecha_hora = api.fecha_hora;
        m.grupo = api.grupo;
        m.estadio = api.estadio;
        m.ciudad = api.ciudad;
        m.pais_sede = api.pais_sede;

        const inverted = canonicalTeam(api.local) !== canonicalTeam(lm.equipo_local);
        
        // La verdad absoluta: Si el Administrador guardó un resultado manualmente en Firestore, 
        // respetamos ese valor. Solo usamos la API si no hay nada guardado manualmente.
        if (lm.goles_local_real == null || lm.goles_visitante_real == null) {
            if (api.goles_local != null && api.goles_visitante != null) {
                m.goles_local_real = inverted ? api.goles_visitante : api.goles_local;
                m.goles_visitante_real = inverted ? api.goles_local : api.goles_visitante;
            }
        }
        return m;
    });

    if (knockouts.length > 0) {
        knockouts.forEach(ko => {
            const t1 = teamFromEnglish(ko.raw_local);
            const t2 = teamFromEnglish(ko.raw_visit);
            
            let alreadyExists = false;
            if (t1 && t2) {
                const key = pairKey(t1, t2);
                alreadyExists = matches.some(m => pairKey(m.equipo_local, m.equipo_visitante) === key);
            }
            
            if (!alreadyExists) {
                matches.push({
                    id: `ko_${ko.num}`,
                    jornada: ko.jornada || 'Eliminatorias',
                    equipo_local: t1 || ko.raw_local,
                    equipo_visitante: t2 || ko.raw_visit,
                    fecha_hora: ko.fecha_hora,
                    estadio: ko.estadio,
                    ciudad: ko.ciudad,
                    pais_sede: ko.pais_sede,
                    goles_local_real: ko.goles_local,
                    goles_visitante_real: ko.goles_visitante,
                    grupo: null
                });
            }
        });
    }

    return { matches, meta };
}
