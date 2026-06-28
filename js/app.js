import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { flagImg, canonicalTeam } from './teams.js';
import { loadTournamentData } from './api.js?v=1.1';

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDWmu2CBHaBUnfrXqAYahIVJFHBIOU1gu4",
  authDomain: "quiniela-pachahex.firebaseapp.com",
  projectId: "quiniela-pachahex",
  storageBucket: "quiniela-pachahex.firebasestorage.app",
  messagingSenderId: "494691099080",
  appId: "1:494691099080:web:6a74fe227bb2fe170160fd"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- ESTADO DE LA APLICACIÓN ---
const LOCK_MINUTES_BEFORE = 60;          // Las apuestas cierran 1 hora antes del inicio
const API_REFRESH_MS = 5 * 60 * 1000;    // Refresco automático de resultados desde la API
let currentUser = null;
let currentUserData = null;
let isRegisterMode = false;
let BASE_MATCHES = [];  // fixture base de Firestore (ids + jornada + equipos)
let APP_MATCHES = [];   // fixture enriquecido con API (fechas, sedes, resultados)
let API_META = { apiOk: false, fromCache: false, ts: null };
let GROUP_USERS = [];   // usuarios del mismo grupo (sin admins)
let GROUP_PREDS = {};   // uid -> { matches: {...} }
let KNOCKOUTS_ENABLED = false; // Maestro de eliminatorias
let CURRENT_KO_ROUND = 'r32'; // Paginación de eliminatorias
let CURRENT_KO_DAY = 'all'; // Filtro de fechas en eliminatorias
let CURRENT_GROUP_DATA = null; // Datos del grupo actual (incluye podio y fecha reset)
let tickerInterval = null;
let refreshInterval = null;

const isKnockout = (m) => {
    const j = String(m.jornada).toLowerCase();
    return ['32', '16', 'quarter', 'semi', 'final', 'third', 'tercer', 'octavos', 'dieciseisavos', 'cuartos'].some(k => j.includes(k));
};

// Filtra una lista de partidos por ronda eliminatoria usando un sentinel 'ko:XXX'
function filterByKoRound(list, sentinel) {
    const r = String(sentinel).replace('ko:', '');
    const j = (m) => String(m.jornada).toLowerCase();
    if (r === 'r32')   return list.filter(m => j(m).includes('32')      || j(m).includes('dieciseisavos'));
    if (r === 'r16')   return list.filter(m => j(m).includes('16')      || j(m).includes('octavos'));
    if (r === 'qf')    return list.filter(m => j(m).includes('quarter') || j(m).includes('cuartos'));
    if (r === 'sf')    return list.filter(m => j(m).includes('semi'));
    if (r === 'finals') return list.filter(m => j(m).includes('final') || j(m).includes('third') || j(m).includes('tercer'));
    return list;
}

// Filtros por vista: jornada ('all'|1|2|3), dia ('YYYY-MM-DD'|null = auto), estado, q
const FILTERS = {
    predictions: { jornada: 'all', estado: 'all', dia: null, q: '' },
    results:     { jornada: 'all', estado: 'all', dia: null, q: '' },
    group:       { jornada: 'all', estado: 'all', dia: null, q: '' }
};

// --- HELPERS DE PARTIDOS ---
function kickoffDate(match) { return match.fecha_hora ? new Date(match.fecha_hora) : null; }
function lockDate(match) { 
    const d = kickoffDate(match);
    if (!d) return null;
    return new Date(d.getTime() - LOCK_MINUTES_BEFORE * 60 * 1000); 
}

function isMatchLocked(match) {
    const d = lockDate(match);
    if (!d) return true; // Si no hay fecha oficial, se bloquea por seguridad
    return new Date() >= d;
}

function hasResult(match) {
    return match.goles_local_real != null && match.goles_visitante_real != null;
}

function matchStatus(match) {
    if (hasResult(match)) return 'finished';
    if (isMatchLocked(match)) return 'locked';
    return 'open';
}

function calculateMatchPoints(predL, predV, realL, realV) {
    if (predL == null || predV == null || predL === '' || predV === '' || realL == null || realV == null) return 0;
    const pL = parseInt(predL), pV = parseInt(predV);
    const rL = parseInt(realL), rV = parseInt(realV);
    if (isNaN(pL) || isNaN(pV)) return 0;

    if (pL === rL && pV === rV) return 5;
    const pWinner = pL > pV ? 1 : (pL < pV ? 2 : 0);
    const rWinner = rL > rV ? 1 : (rL < rV ? 2 : 0);
    if (pWinner === rWinner) return 3;
    if (pL === rL || pV === rV) return 1;
    return 0;
}

function pointsBadge(pts) {
    const map = {
        5: ['perfect', 'Exacto'],
        3: ['partial', 'Ganador'],
        1: ['minimal', 'Parcial'],
        0: ['zero', 'Fallido']
    };
    const [cls, word] = map[pts];
    return `<span class="points-badge ${cls}">${word} · ${pts} pts</span>`;
}

function dayKey(match) {
    const d = kickoffDate(match);
    if (!d) return 'TBD';
    // Restamos 6 horas para que los partidos de madrugada (00:00 - 05:59) se agrupen en el día anterior
    const shifted = new Date(d.getTime() - (6 * 3600000));
    return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`;
}

function todayKey() {
    const d = new Date();
    const shifted = new Date(d.getTime() - (6 * 3600000));
    return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`;
}

function formatDayLabel(key) {
    const d = new Date(`${key}T12:00:00`);
    const label = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatTime(match) {
    const d = kickoffDate(match);
    if (!d) return 'Por definir';
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatCountdown(ms) {
    if (ms <= 0) return 'Cerrado';
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function statusChip(match) {
    const st = matchStatus(match);
    if (st === 'finished') return `<span class="status-chip finished"><i class="fa-solid fa-flag-checkered"></i> Final</span>`;
    if (st === 'locked') return `<span class="status-chip locked"><i class="fa-solid fa-lock"></i> Apuestas cerradas</span>`;
    const ld = lockDate(match);
    if (!ld) return `<span class="status-chip locked"><i class="fa-solid fa-lock"></i> Horario TBD</span>`;
    const remaining = ld - new Date();
    return `<span class="status-chip open" data-lock="${ld.getTime()}"><i class="fa-solid fa-stopwatch"></i> Cierra en <b class="countdown">${formatCountdown(remaining)}</b></span>`;
}

function venueLine(match) {
    if (!match.estadio) return '';
    const flag = match.pais_sede ? `<img class="venue-flag" src="https://flagcdn.com/w20/${match.pais_sede}.png" alt="">` : '';
    const grupo = match.grupo ? `<span class="group-chip">${match.grupo}</span>` : '';
    return `
        <div class="match-venue">
            <span><i class="fa-solid fa-location-dot"></i> ${match.estadio}${match.ciudad ? ` · ${match.ciudad}` : ''} ${flag}</span>
            ${grupo}
        </div>
    `;
}

function teamRow(name, side) {
    return `<div class="team team-${side}">${flagImg(name)}<span class="team-name">${name}</span></div>`;
}

// --- FILTROS Y NAVEGACIÓN POR DÍAS ---
function allDays(jornada, isGroupStage = false) {
    let list = APP_MATCHES;
    if (isGroupStage) list = list.filter(m => !isKnockout(m));
    if (jornada !== 'all') {
        if (typeof jornada === 'string' && jornada.startsWith('ko:')) {
            list = filterByKoRound(list, jornada);
        } else {
            list = list.filter(m => m.jornada === jornada);
        }
    }
    return [...new Set(list.slice().sort((a, b) => kickoffDate(a) - kickoffDate(b)).map(dayKey))];
}

function defaultDay(days) {
    const today = todayKey();
    if (days.includes(today)) return today;
    const future = days.find(d => d > today);
    return future || days[days.length - 1] || null;
}

function ensureDay(f, isGroupStage = false) {
    const days = allDays(f.jornada, isGroupStage);
    if (!f.dia || !days.includes(f.dia)) f.dia = defaultDay(days);
    return days;
}

function applyFilter(filter, isGroupStage = false) {
    let list = [...APP_MATCHES];
    if (isGroupStage) list = list.filter(m => !isKnockout(m));
    if (filter.jornada !== 'all') {
        if (typeof filter.jornada === 'string' && filter.jornada.startsWith('ko:')) {
            list = filterByKoRound(list, filter.jornada);
        } else {
            list = list.filter(m => m.jornada === filter.jornada);
        }
    }
    if (filter.q) {
        const q = filter.q.toLowerCase();
        list = list.filter(m => m.equipo_local.toLowerCase().includes(q) || m.equipo_visitante.toLowerCase().includes(q));
    } else if (filter.dia) {
        // La búsqueda ignora el día seleccionado para encontrar al equipo en todo el torneo
        list = list.filter(m => dayKey(m) === filter.dia);
    }
    if (filter.estado !== 'all') list = list.filter(m => matchStatus(m) === filter.estado);
    list.sort((a, b) => kickoffDate(a) - kickoffDate(b));
    return list;
}

function renderFilterBar(containerId, filterKey, onChange, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const f = FILTERS[filterKey];
    // isGroupStage puede venir en opts; por defecto true (solo fase de grupos)
    const isGroupStage = opts.isGroupStage !== undefined ? opts.isGroupStage : true;
    const days = ensureDay(f, isGroupStage);
    const today = todayKey();

    const estadoOptions = opts.estados || [
        ['all', 'Todos'], ['open', 'Abiertos'], ['locked', 'Cerrados'], ['finished', 'Finalizados']
    ];

    const dayPills = days.map(d => {
        const date = new Date(`${d}T12:00:00`);
        const wd = date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
        const isToday = d === today;
        return `
            <button class="day-pill ${f.dia === d ? 'active' : ''} ${isToday ? 'today' : ''}" data-day="${d}">
                <span class="day-pill-wd">${isToday ? 'HOY' : wd}</span>
                <span class="day-pill-num">${date.getDate()}</span>
                <span class="day-pill-month">${date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</span>
            </button>`;
    }).join('');

    // Chips configurables desde opts; por defecto solo las 3 jornadas de fase de grupos
    const defaultChips = [['all', 'Todas'], [1, 'Jornada 1'], [2, 'Jornada 2'], [3, 'Jornada 3']];
    const chipDefs = opts.chips || defaultChips;
    const chipsHtml = chipDefs.map(([val, label]) =>
        `<button class="chip ${String(f.jornada) === String(val) ? 'active' : ''}" data-f="jornada" data-v="${val}">${label}</button>`
    ).join('');

    container.innerHTML = `
        <div class="filter-bar">
            <div class="filter-row chips-scroll">
                ${chipsHtml}
            </div>
            <div class="filter-row day-strip chips-scroll">${dayPills}</div>
            <div class="filter-row filter-inputs">
                <select class="filter-estado" data-f="estado">
                    ${estadoOptions.map(([v, label]) => `<option value="${v}" ${f.estado === v ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
                <div class="search-wrapper">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="search" class="filter-search" placeholder="Buscar equipo..." value="${f.q}">
                </div>
            </div>
        </div>
    `;

    container.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            let val = chip.getAttribute('data-v');
            // Solo convertir a int si es un número real (jornadas 1/2/3), no 'all' ni sentinels 'ko:XXX'
            if (val !== 'all' && !val.startsWith('ko:')) val = parseInt(val);
            f.jornada = val;
            f.dia = null; // recalcular el día por defecto de la jornada
            renderFilterBar(containerId, filterKey, onChange, opts);
            onChange();
        });
    });
    container.querySelectorAll('.day-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            f.dia = pill.getAttribute('data-day');
            container.querySelectorAll('.day-pill').forEach(p => p.classList.toggle('active', p === pill));
            onChange();
        });
    });
    container.querySelector('.filter-estado').addEventListener('change', (e) => {
        f.estado = e.target.value;
        onChange();
    });
    const searchInput = container.querySelector('.filter-search');
    let debounce = null;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { f.q = e.target.value.trim(); onChange(); }, 250);
    });

    // Centrar el día activo en el carrusel
    const active = container.querySelector('.day-pill.active');
    if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// --- EVENT LISTENERS GLOBALES ---
function initApp() {
    document.getElementById('btn-login').addEventListener('click', () => handleAuth(false));
    document.getElementById('btn-register').addEventListener('click', () => handleAuth(true));
    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
    document.getElementById('login-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAuth(isRegisterMode);
    });

    const usernameInput = document.getElementById('login-username');
    const hint = document.getElementById('username-hint');
    usernameInput.addEventListener('input', (e) => {
        if (isRegisterMode) {
            const val = e.target.value;
            hint.style.display = 'block';
            hint.style.color = !/^[A-Za-z\s]*$/.test(val) ? 'var(--color-error)' : 'var(--color-text-muted)';
        }
    });

    document.getElementById('toggle-auth-mode').addEventListener('click', async (e) => {
        e.preventDefault();
        isRegisterMode = !isRegisterMode;
        document.getElementById('auth-title').innerText = isRegisterMode ? 'Crear Cuenta' : 'Iniciar Sesión';
        document.getElementById('auth-subtitle').innerText = isRegisterMode ? 'Regístrate para participar.' : 'Ingresa tus credenciales para continuar.';
        document.getElementById('btn-login').style.display = isRegisterMode ? 'none' : 'block';
        document.getElementById('btn-register').style.display = isRegisterMode ? 'block' : 'none';
        document.getElementById('group-select-container').style.display = isRegisterMode ? 'block' : 'none';
        hint.style.display = isRegisterMode ? 'block' : 'none';
        e.target.innerText = isRegisterMode ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate aquí';
        document.getElementById('login-error').innerText = '';
        if (isRegisterMode) await loadGroupsForSelect();
    });

    document.getElementById('toggle-password-icon').addEventListener('click', (e) => {
        const input = document.getElementById('login-password');
        const isPwd = input.type === 'password';
        input.type = isPwd ? 'text' : 'password';
        e.target.classList.toggle('fa-eye', !isPwd);
        e.target.classList.toggle('fa-eye-slash', isPwd);
    });

    // Navegación por pestañas
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.tab-btn');
            tabBtn.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            tabBtn.classList.add('active');

            const targetId = tabBtn.getAttribute('data-target');
            if (targetId) {
                tabBtn.parentElement.parentElement.querySelectorAll(':scope > .tab-content').forEach(c => c.classList.remove('active'));
                document.getElementById(targetId).classList.add('active');
                window.scrollTo({ top: 0, behavior: 'smooth' });
                
                if (targetId === 'admin-rankings') renderAdminRankings();
            }

            const subTargetId = tabBtn.getAttribute('data-subtarget');
            if (subTargetId) {
                tabBtn.parentElement.parentElement.querySelectorAll(':scope > .subtab-content').forEach(c => {
                    c.classList.remove('active');
                    c.style.display = 'none';
                });
                const sub = document.getElementById(subTargetId);
                sub.classList.add('active');
                sub.style.display = 'block';
                
                if (subTargetId === 'pred-tablas') {
                    renderWorldCupStandings();
                }
            }
        });
    });

    document.querySelectorAll('#knockout-rounds-tabs .chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#knockout-rounds-tabs .chip').forEach(c => c.classList.remove('active'));
            e.currentTarget.classList.add('active');
            CURRENT_KO_ROUND = e.currentTarget.getAttribute('data-round');
            renderKnockoutBracket();
        });
    });

    document.querySelector('.close-modal').addEventListener('click', () => {
        document.getElementById('other-user-predictions-modal').style.display = 'none';
    });
    window.addEventListener('click', (e) => {
        if (e.target === document.getElementById('other-user-predictions-modal')) {
            document.getElementById('other-user-predictions-modal').style.display = 'none';
        }
    });

    document.getElementById('btn-create-group')?.addEventListener('click', createGroup);



    document.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('score-input')) {
            const allowedKeys = ['Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'Delete'];
            if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey) return;
            if (!/^[0-9]$/.test(e.key)) e.preventDefault();
        }
    });
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('score-input')) {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2);
        }
    });
    document.addEventListener('paste', (e) => {
        if (e.target.classList.contains('score-input')) {
            const pasteData = (e.clipboardData || window.clipboardData).getData('text');
            if (!/^\d+$/.test(pasteData)) e.preventDefault();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// --- AUTH ---
function formatEmail(username) {
    return `${username.toLowerCase().replace(/\s+/g, '')}@pachahex.local`;
}

async function loadGroupsForSelect() {
    const select = document.getElementById('login-group');
    select.innerHTML = '<option value="">Selecciona tu Grupo...</option>';
    const snapshot = await getDocs(collection(db, "grupos"));
    snapshot.forEach(doc => {
        select.innerHTML += `<option value="${doc.id}">${doc.data().nombre}</option>`;
    });
}

async function handleAuth(isRegister) {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const errorMsg = document.getElementById('login-error');

    if (!username || !password) {
        errorMsg.innerText = 'Por favor, completa todos los campos.';
        return;
    }
    if (isRegister) {
        if (!/^[A-Za-z\s]+$/.test(username)) {
            errorMsg.innerText = 'El nombre de usuario solo puede contener letras y espacios.';
            return;
        }
        if (!document.getElementById('login-group').value) {
            errorMsg.innerText = 'Debes seleccionar un grupo para registrarte.';
            return;
        }
    }

    const email = formatEmail(username);
    errorMsg.innerText = 'Cargando...';

    try {
        if (isRegister) {
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, "usuarios", userCredential.user.uid), {
                    nombre_usuario: username,
                    rol: "user",
                    grupo_id: document.getElementById('login-group').value,
                    estado: "activo"
                });
            } catch (error) {
                if (error.code === 'auth/email-already-in-use') {
                    // Si el correo existe en Auth pero el doc fue borrado manualmente, lo recreamos al iniciar sesión.
                    try {
                        const userCredential = await signInWithEmailAndPassword(auth, email, password);
                        const userDoc = await getDoc(doc(db, "usuarios", userCredential.user.uid));
                        if (!userDoc.exists()) {
                            await setDoc(doc(db, "usuarios", userCredential.user.uid), {
                                nombre_usuario: username,
                                rol: "user",
                                grupo_id: document.getElementById('login-group').value,
                                estado: "activo"
                            });
                        } else {
                            throw error;
                        }
                    } catch (loginError) {
                        throw error;
                    }
                } else {
                    throw error;
                }
            }
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
        errorMsg.innerText = '';
    } catch (error) {
        console.error(error);
        if (error.code === 'auth/email-already-in-use') {
            errorMsg.innerText = 'El nombre de usuario ya está registrado.';
        } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            errorMsg.innerText = 'Credenciales incorrectas.';
        } else {
            errorMsg.innerText = `Error: ${error.message}`;
        }
    }
}

onAuthStateChanged(auth, async (user) => {
    document.getElementById('app-loader').style.display = 'none';
    if (tickerInterval) { clearInterval(tickerInterval); tickerInterval = null; }
    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }

    if (user) {
        currentUser = user;
        let userDoc = await getDoc(doc(db, "usuarios", user.uid));
        if (!userDoc.exists()) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            userDoc = await getDoc(doc(db, "usuarios", user.uid));
        }
        currentUserData = userDoc.exists() ? userDoc.data() : { nombre_usuario: "Desconocido", rol: "user", grupo_id: "", estado: "activo" };

        await fetchMatches();

        document.getElementById('login-section').style.display = 'none';
        document.getElementById('nav-controls').style.display = 'flex';
        document.getElementById('current-user-info').innerText = currentUserData.nombre_usuario;

        if (currentUserData.rol === 'admin') {
            document.getElementById('admin-section').style.display = 'block';
            document.getElementById('user-section').style.display = 'none';
            renderAdminViews();
        } else {
            document.getElementById('admin-section').style.display = 'none';
            document.getElementById('user-section').style.display = 'block';
            document.getElementById('user-blocked-alert').style.display = currentUserData.estado === 'bloqueado' ? 'block' : 'none';

            if (currentUserData.grupo_id) {
                const gDoc = await getDoc(doc(db, "grupos", currentUserData.grupo_id));
                if (gDoc.exists()) {
                    document.querySelector('#group-title-display span').innerText = gDoc.data().nombre;
                    currentUserData.resetDate = gDoc.data().resetDate || null;
                } else {
                    document.querySelector('#group-title-display span').innerText = 'Grupo Desconocido';
                }
            } else {
                document.querySelector('#group-title-display span').innerText = 'Sin Grupo';
            }

            await loadGroupData();
            renderUserViews();
            startAutoUpdates();
        }
    } else {
        currentUser = null;
        currentUserData = null;
        document.getElementById('nav-controls').style.display = 'none';
        document.getElementById('admin-section').style.display = 'none';
        document.getElementById('user-section').style.display = 'none';
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
    }
});

// --- CARGA DE DATOS ---
async function fetchMatches() {
    const docSnap = await getDoc(doc(db, "sistema", "partidos"));
    if (docSnap.exists()) {
        const d = docSnap.data();
        BASE_MATCHES = d.lista || [];
        KNOCKOUTS_ENABLED = d.knockouts_enabled || false;
    } else {
        BASE_MATCHES = [];
        KNOCKOUTS_ENABLED = false;
    }
    const { matches, meta } = await loadTournamentData(BASE_MATCHES);
    APP_MATCHES = matches;
    API_META = meta;
}

async function loadGroupData() {
    const [usersSnap, predsSnap, groupSnap] = await Promise.all([
        getDocs(collection(db, "usuarios")),
        getDocs(collection(db, "predicciones")),
        getDoc(doc(db, "grupos", currentUserData.grupo_id))
    ]);

    CURRENT_GROUP_DATA = groupSnap.exists() ? groupSnap.data() : null;

    GROUP_USERS = [];
    usersSnap.forEach(d => {
        const data = d.data();
        if (data.grupo_id === currentUserData.grupo_id && data.rol !== 'admin') {
            GROUP_USERS.push({ uid: d.id, ...data });
        }
    });

    const groupUids = new Set(GROUP_USERS.map(u => u.uid));
    GROUP_PREDS = {};
    predsSnap.forEach(d => {
        if (groupUids.has(d.id)) GROUP_PREDS[d.id] = d.data();
    });
}

async function saveUserPredictions(userId, matchPredictions) {
    if (currentUserData.estado === 'bloqueado') throw new Error("Usuario bloqueado");
    await setDoc(doc(db, "predicciones", userId), { matches: matchPredictions }, { merge: true });
    if (!GROUP_PREDS[userId]) GROUP_PREDS[userId] = {};
    GROUP_PREDS[userId].matches = matchPredictions;
}

function myPredictions() {
    return (GROUP_PREDS[currentUser.uid] && GROUP_PREDS[currentUser.uid].matches) || {};
}

// --- ACTUALIZACIÓN AUTOMÁTICA (cuenta regresiva + resultados de la API) ---
function startAutoUpdates() {
    let lockedIds = new Set(APP_MATCHES.filter(isMatchLocked).map(m => m.id));

    tickerInterval = setInterval(() => {
        document.querySelectorAll('.status-chip.open[data-lock]').forEach(chip => {
            const remaining = parseInt(chip.getAttribute('data-lock')) - Date.now();
            const cd = chip.querySelector('.countdown');
            if (cd) cd.innerText = formatCountdown(remaining);
        });
        const nowLocked = new Set(APP_MATCHES.filter(isMatchLocked).map(m => m.id));
        if (nowLocked.size !== lockedIds.size) {
            lockedIds = nowLocked;
            renderUserViews();
        }
        renderNextMatchBanner();
    }, 30000);

    refreshInterval = setInterval(async () => {
        if (document.hidden) return;
        const before = APP_MATCHES.filter(hasResult).length;
        try {
            const { matches, meta } = await loadTournamentData(BASE_MATCHES);
            APP_MATCHES = matches;
            API_META = meta;
        } catch (e) { return; }
        renderDataFreshness();
        if (APP_MATCHES.filter(hasResult).length !== before) {
            renderUserViews(); // hay resultados nuevos: recalcular todo
        }
    }, API_REFRESH_MS);

    renderNextMatchBanner();
    renderDataFreshness();
}

function renderNextMatchBanner() {
    const banner = document.getElementById('next-match-banner');
    if (!banner) return;
    const open = APP_MATCHES.filter(m => matchStatus(m) === 'open')
        .sort((a, b) => lockDate(a) - lockDate(b));
    if (open.length === 0) { banner.style.display = 'none'; return; }
    const next = open[0];
    const remaining = lockDate(next) - new Date();
    banner.style.display = 'block';
    
    // Alerta llamativa
    let colorClass = remaining < 3600000 * 3 ? 'urgent' : 'normal'; // menos de 3 hrs es urgente
    banner.innerHTML = `
        <div class="banner-content ${colorClass}" style="display:flex; align-items:center; gap:10px;">
            <i class="fa-solid fa-hourglass-half fa-spin-pulse"></i>
            <span style="flex:1;">Próximo cierre: <b>${next.equipo_local} vs ${next.equipo_visitante}</b> en <b>${formatCountdown(remaining)}</b></span>
            <i class="fa-solid fa-chevron-right"></i>
        </div>
    `;

    banner.onclick = () => {
        if (isKnockout(next)) {
            // Ir a Eliminatorias
            const tabBtn = document.querySelector('.tab-btn[data-target="user-knockouts"]');
            if (tabBtn) tabBtn.click();
            
            // Determinar la ronda correcta
            const j = String(next.jornada).toLowerCase();
            if (j.includes('32') || j.includes('dieciseisavos')) CURRENT_KO_ROUND = 'r32';
            else if (j.includes('16') || j.includes('octavos')) CURRENT_KO_ROUND = 'r16';
            else if (j.includes('quarter') || j.includes('cuartos')) CURRENT_KO_ROUND = 'qf';
            else if (j.includes('semi')) CURRENT_KO_ROUND = 'sf';
            else CURRENT_KO_ROUND = 'finals';

            // Determinar el día correcto
            CURRENT_KO_DAY = dayKey(next);
            
            // Actualizar botones de ronda visualmente
            document.querySelectorAll('#knockout-rounds-tabs .chip').forEach(c => c.classList.remove('active'));
            const activeRoundBtn = document.querySelector(`#knockout-rounds-tabs .chip[data-round="${CURRENT_KO_ROUND}"]`);
            if (activeRoundBtn) activeRoundBtn.classList.add('active');

            // Renderizar eliminatorias (esto también construirá y activará el botón de día correcto)
            renderKnockoutBracket();
        } else {
            // Ir a Fase de Grupos
            const tabBtn = document.querySelector('.tab-btn[data-target="user-predictions"]');
            if (tabBtn) tabBtn.click();

            // Asegurarnos de que estamos en la sub-pestaña "Partidos" y no en "Tablas"
            const subTabBtn = document.querySelector('.tab-btn[data-subtarget="pred-partidos"]');
            if (subTabBtn) subTabBtn.click();
            
            // Cambiar el filtro al día correcto del partido para que exista en el DOM
            const targetDay = dayKey(next);
            if (FILTERS.predictions.dia !== targetDay) {
                FILTERS.predictions.dia = targetDay;
                renderFilterBar('predictions-filters', 'predictions', renderPredictionsForm);
                renderPredictionsForm();
            }
        }
        
        // Hacer scroll hacia el partido específico
        setTimeout(() => {
            const matchCard = document.getElementById(`match-card-${next.id}`);
            if (matchCard) {
                matchCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                matchCard.style.boxShadow = '0 0 15px var(--color-primary)';
                setTimeout(() => matchCard.style.boxShadow = '', 2000);
            }
        }, 100);
    };
}

function renderDataFreshness() {
    const el = document.getElementById('data-freshness');
    const banner = document.getElementById('next-match-banner');
    if (!el) return;
    if (banner && banner.style.display !== 'none') {
        el.innerHTML = '<i class="fa-solid fa-hand-pointer"></i> Presiona arriba para ir a predecir este partido';
        el.onclick = () => banner.click();
    } else {
        if (!API_META.apiOk) {
            el.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Sin conexión con la API de resultados';
            return;
        }
        const mins = Math.max(0, Math.round((Date.now() - API_META.ts) / 60000));
        const src = API_META.fromCache ? 'caché local' : 'API en vivo';
        el.innerHTML = `<i class="fa-solid fa-tower-broadcast"></i> Resultados automáticos · ${src} · hace ${mins} min`;
    }
}

function renderWorldCupStandings() {
    const container = document.getElementById('world-cup-standings-container');
    if (!container) return;
    
    const groups = {}; 
    
    APP_MATCHES.forEach(m => {
        if (!m.grupo || !m.equipo_local || !m.equipo_visitante) return;
        const gName = m.grupo.replace('Group', 'Grupo'); // asegurar español
        
        const eqL = canonicalTeam(m.equipo_local);
        const eqV = canonicalTeam(m.equipo_visitante);

        if (!groups[gName]) groups[gName] = {};
        if (!groups[gName][eqL]) groups[gName][eqL] = { pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0 };
        if (!groups[gName][eqV]) groups[gName][eqV] = { pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0 };
        
        if (hasResult(m)) {
            const gl = parseInt(m.goles_local_real, 10) || 0;
            const gv = parseInt(m.goles_visitante_real, 10) || 0;
            const tL = groups[gName][eqL];
            const tV = groups[gName][eqV];
            
            tL.pj++; tV.pj++;
            tL.gf += gl; tV.gf += gv;
            tL.gc += gv; tV.gc += gl;
            tL.dg = tL.gf - tL.gc;
            tV.dg = tV.gf - tV.gc;
            
            if (gl > gv) { tL.pg++; tV.pp++; tL.pts += 3; }
            else if (gl < gv) { tV.pg++; tL.pp++; tV.pts += 3; }
            else { tL.pe++; tV.pe++; tL.pts += 1; tV.pts += 1; }
        }
    });
    
    if (Object.keys(groups).length === 0) {
        container.innerHTML = '<p class="text-muted" style="text-align:center;">Tablas no disponibles aún.</p>';
        return;
    }
    
    const sortedGroups = Object.keys(groups).sort();
    let html = '';
    
    sortedGroups.forEach(gName => {
        const teams = Object.keys(groups[gName]).map(t => ({ name: t, ...groups[gName][t] }));
        teams.sort((a, b) => {
            if (b.pts !== a.pts) return b.pts - a.pts;
            if (b.dg !== a.dg) return b.dg - a.dg;
            return b.gf - a.gf;
        });
        
        html += `
            <div class="card standings-card" style="margin-bottom: 20px;">
                <h4 style="text-align: center; color: var(--color-gold); margin-bottom: 10px;">${gName}</h4>
                <div class="table-responsive" style="overflow-x: auto;">
                <table class="ranking-table" style="font-size: 0.85rem;">
                    <thead>
                        <tr>
                            <th style="text-align: left;">Equipo</th>
                            <th style="text-align: center;">PJ</th>
                            <th style="text-align: center;">G</th>
                            <th style="text-align: center;">E</th>
                            <th style="text-align: center;">P</th>
                            <th style="text-align: center;">DG</th>
                            <th style="text-align: center;">Pts</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        teams.forEach((t, i) => {
            const rowClass = i < 2 ? 'style="background: rgba(255,215,0,0.1);"' : '';
            html += `
                <tr ${rowClass}>
                    <td style="text-align: left; font-weight: 500; white-space: nowrap;">
                        <span style="display: inline-block; margin-right: 5px; vertical-align: middle;">${flagImg(t.name, 'team-flag-sm')}</span>
                        <span style="display: inline-block; vertical-align: middle; max-width: 110px; overflow: hidden; text-overflow: ellipsis;">${t.name}</span>
                    </td>
                    <td style="text-align: center;">${t.pj}</td>
                    <td style="text-align: center;">${t.pg}</td>
                    <td style="text-align: center;">${t.pe}</td>
                    <td style="text-align: center;">${t.pp}</td>
                    <td style="text-align: center;">${t.dg > 0 ? '+'+t.dg : t.dg}</td>
                    <td style="text-align: center; font-weight: 700; color: var(--color-primary);">${t.pts}</td>
                </tr>
            `;
        });
        
        html += `</tbody></table></div></div>`;
    });
    
    container.innerHTML = html;
}

function renderKnockoutBracket() {
    const container = document.getElementById('knockout-bracket-container');
    if (!container) return;

    let allMatches = [];
    let title = "";

    switch(CURRENT_KO_ROUND) {
        case 'r32': 
            allMatches = APP_MATCHES.filter(m => String(m.jornada).toLowerCase().includes('32') || String(m.jornada).toLowerCase().includes('dieciseisavos'));
            title = "Dieciseisavos de Final";
            break;
        case 'r16':
            allMatches = APP_MATCHES.filter(m => String(m.jornada).toLowerCase().includes('16') || String(m.jornada).toLowerCase().includes('octavos'));
            title = "Octavos de Final";
            break;
        case 'qf':
            allMatches = APP_MATCHES.filter(m => String(m.jornada).toLowerCase().includes('quarter') || String(m.jornada).toLowerCase().includes('cuartos'));
            title = "Cuartos de Final";
            break;
        case 'sf':
            allMatches = APP_MATCHES.filter(m => String(m.jornada).toLowerCase().includes('semi'));
            title = "Semifinales";
            break;
        case 'finals':
            allMatches = APP_MATCHES.filter(m => {
                const j = String(m.jornada).toLowerCase();
                return (j.includes('final') || j.includes('third') || j.includes('tercer')) && 
                       !j.includes('semi') && !j.includes('quarter') && 
                       !j.includes('octavos') && !j.includes('dieciseisavos');
            });
            title = "Finales y Tercer Puesto";
            break;
    }

    const dateContainer = document.getElementById('knockout-date-filters');

    if (allMatches.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-hourglass-start"></i><p>Esta fase aún no está disponible en el calendario de la API.</p></div>';
        if (dateContainer) dateContainer.innerHTML = '';
        return;
    }

    // Filtrado de fechas
    const uniqueDays = [...new Set(allMatches.slice().sort((a, b) => kickoffDate(a) - kickoffDate(b)).map(dayKey))];
    
    if (CURRENT_KO_DAY !== 'all' && !uniqueDays.includes(CURRENT_KO_DAY)) {
        CURRENT_KO_DAY = 'all';
    }

    if (dateContainer) {
        const today = todayKey();
        let dateHtml = `
            <button class="day-pill ${CURRENT_KO_DAY === 'all' ? 'active' : ''}" data-day="all">
                <span class="day-pill-wd" style="margin: auto;">TODOS</span>
            </button>`;
            
        uniqueDays.forEach(d => {
            const date = new Date(`${d}T12:00:00`);
            const wd = date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
            const isToday = d === today;
            
            dateHtml += `
                <button class="day-pill ${CURRENT_KO_DAY === d ? 'active' : ''} ${isToday ? 'today' : ''}" data-day="${d}">
                    <span class="day-pill-wd">${isToday ? 'HOY' : wd}</span>
                    <span class="day-pill-num">${date.getDate()}</span>
                    <span class="day-pill-month">${date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</span>
                </button>`;
        });
        dateContainer.innerHTML = dateHtml;

        dateContainer.querySelectorAll('.day-pill').forEach(btn => {
            btn.addEventListener('click', (e) => {
                CURRENT_KO_DAY = e.currentTarget.getAttribute('data-day');
                renderKnockoutBracket();
            });
        });
    }

    let filteredMatches = allMatches;
    if (CURRENT_KO_DAY !== 'all') {
        filteredMatches = allMatches.filter(m => dayKey(m) === CURRENT_KO_DAY);
    }

    container.innerHTML = `
        <div class="jornada-block" style="margin-bottom: 2rem;">
            <h3 class="jornada-title" style="color: var(--gold); border-bottom: 1px solid var(--color-border); padding-bottom: 5px;">${title}</h3>
            <div class="match-list" style="margin-top: 10px;">
                ${renderMatchList(filteredMatches, predictionCard)}
            </div>
        </div>
    `;

    if (KNOCKOUTS_ENABLED) {
        container.querySelectorAll('.btn-save-single').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const btnEl = e.currentTarget;
                const matchDiv = btnEl.closest('.match-card');
                const id = matchDiv.getAttribute('data-match');
                const lVal = matchDiv.querySelector('.pred-l').value;
                const vVal = matchDiv.querySelector('.pred-v').value;
                const statusDiv = matchDiv.querySelector('.save-status');
                
                if (lVal === '' || vVal === '') {
                    statusDiv.innerText = 'Llena ambos';
                    statusDiv.style.color = 'var(--color-error)';
                    return;
                }
                
                btnEl.disabled = true;
                btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                try {
                    const existingMatches = { ...myPredictions() };
                    existingMatches[id] = { l: lVal, v: vVal };
                    await saveUserPredictions(currentUser.uid, existingMatches);
                    statusDiv.innerText = 'Guardado';
                    statusDiv.style.color = 'var(--color-success)';
                } catch (err) {
                    statusDiv.innerText = 'Error';
                    statusDiv.style.color = 'var(--color-error)';
                }
                btnEl.disabled = false;
                btnEl.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar';
                setTimeout(() => { statusDiv.innerText = ''; }, 2000);
            });
        });
    }
}

// --- VISTAS DE USUARIO ---
function renderUserViews() {
    renderFilterBar('predictions-filters', 'predictions', renderPredictionsForm);
    renderFilterBar('group-filters', 'group', renderGroupBets, {
        isGroupStage: false,
        estados: [['all', 'Todos'], ['locked', 'Cerrados'], ['finished', 'Finalizados']],
        chips: [
            ['all',      'Todas'],
            [1,          'Jornada 1'],
            [2,          'Jornada 2'],
            [3,          'Jornada 3'],
            ['ko:r32',   'Dieciseisavos'],
            ['ko:r16',   'Octavos'],
            ['ko:qf',    'Cuartos'],
            ['ko:sf',    'Semifinales'],
            ['ko:finals','Finales'],
        ]
    });
    renderPredictionsForm();
    renderRankingTable();
    renderGroupBets();
    renderWorldCupStandings();
    renderKnockoutBracket();
}

// Tarjeta de partido para "Mis Predicciones"
function predictionCard(match) {
    const isLocked = isMatchLocked(match);
    const isBlocked = currentUserData.estado === 'bloqueado';
    const preds = myPredictions();
    const predL = preds[match.id] ? preds[match.id].l : '';
    const predV = preds[match.id] ? preds[match.id].v : '';
    const st = matchStatus(match);

    let badgeHtml = '';
    if (st === 'finished') {
        const pts = calculateMatchPoints(predL, predV, match.goles_local_real, match.goles_visitante_real);
        badgeHtml = `<div class="card-badge">${pointsBadge(pts)}</div>`;
    }

    let resultHtml = '';
    if (st === 'finished') {
        resultHtml = `<div class="real-result">Resultado oficial: <b>${match.goles_local_real} - ${match.goles_visitante_real}</b></div>`;
    }

    let saveBtnHtml = '';
    if (!isLocked && !isBlocked) {
        saveBtnHtml = `
            <div class="card-actions">
                <button class="btn btn-gold btn-sm btn-save-single" data-id="${match.id}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
                <span class="save-status" id="status-${match.id}"></span>
            </div>`;
    }

    const dateObj = kickoffDate(match);
    const isMadrugada = dateObj.getHours() >= 0 && dateObj.getHours() < 6;
    const madrugadaBadge = isMadrugada ? `<span class="madrugada-badge" style="margin-left: 5px; color: var(--color-primary); font-size: 0.75rem;"><i class="fa-solid fa-moon"></i> Madrugada</span>` : '';
    const jTxt = isNaN(match.jornada) ? match.jornada : `J${match.jornada}`;

    return `
        <div class="match-card ${isLocked ? 'locked' : ''}" id="match-card-${match.id}" data-match="${match.id}">
            ${badgeHtml}
            <div class="match-header">
                <span class="match-meta"><span class="jornada-chip">${jTxt}</span> ${formatTime(match)} ${madrugadaBadge}</span>
                ${statusChip(match)}
            </div>
            <div class="match-teams">
                ${teamRow(match.equipo_local, 'local')}
                <div class="score-box">
                    <input type="number" inputmode="numeric" min="0" max="20" class="score-input pred-l" data-id="${match.id}" value="${predL}" ${isLocked || isBlocked ? 'disabled' : ''} placeholder="-">
                    <span class="score-sep">:</span>
                    <input type="number" inputmode="numeric" min="0" max="20" class="score-input pred-v" data-id="${match.id}" value="${predV}" ${isLocked || isBlocked ? 'disabled' : ''} placeholder="-">
                </div>
                ${teamRow(match.equipo_visitante, 'visitante')}
            </div>
            ${venueLine(match)}
            ${resultHtml}
            ${saveBtnHtml}
        </div>
    `;
}

function renderMatchList(matches, cardFn) {
    if (matches.length === 0) {
        return `<div class="empty-state"><i class="fa-regular fa-calendar-xmark"></i><p>No hay partidos que coincidan con los filtros.</p></div>`;
    }
    let html = '';
    let lastDay = null;
    for (const m of matches) {
        const dk = dayKey(m);
        if (dk !== lastDay) {
            lastDay = dk;
            html += `<div class="day-header"><i class="fa-regular fa-calendar"></i> ${formatDayLabel(dk)}</div>`;
        }
        html += cardFn(m);
    }
    return html;
}

function renderPredictionsForm() {
    const container = document.getElementById('user-jornadas-container');
    if (APP_MATCHES.length === 0) {
        container.innerHTML = '<p class="empty-state">El fixture aún no está disponible.</p>';
        return;
    }
    const matches = applyFilter(FILTERS.predictions, true); // true = isGroupStage
    container.innerHTML = `<div class="match-list">${renderMatchList(matches, predictionCard)}</div>`;

    container.querySelectorAll('.btn-save-single').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const btnEl = e.currentTarget;
            const id = btnEl.getAttribute('data-id');
            const match = APP_MATCHES.find(m => m.id === id);
            const card = btnEl.closest('.match-card');
            const lVal = card.querySelector('.pred-l').value;
            const vVal = card.querySelector('.pred-v').value;
            const statusDiv = document.getElementById(`status-${id}`);

            if (match && isMatchLocked(match)) {
                statusDiv.innerText = 'Apuestas cerradas';
                statusDiv.style.color = 'var(--color-error)';
                return;
            }
            if (lVal === '' || vVal === '') {
                statusDiv.innerText = 'Completa ambos goles';
                statusDiv.style.color = 'var(--color-error)';
                setTimeout(() => { statusDiv.innerText = ''; }, 3000);
                return;
            }

            btnEl.disabled = true;
            btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            try {
                const existingMatches = { ...myPredictions() };
                existingMatches[id] = { l: lVal, v: vVal };
                await saveUserPredictions(currentUser.uid, existingMatches);
                statusDiv.innerText = '¡Guardado!';
                statusDiv.style.color = 'var(--color-success)';
            } catch (err) {
                console.error(err);
                statusDiv.innerText = 'Error al guardar';
                statusDiv.style.color = 'var(--color-error)';
            }
            btnEl.disabled = false;
            btnEl.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar';
            setTimeout(() => { statusDiv.innerText = ''; }, 3000);
        });
    });
}

// --- RANKING ---
function computeUserStats(uid) {
    const preds = (GROUP_PREDS[uid] && GROUP_PREDS[uid].matches) || {};
    let total = 0, exactos = 0;
    const resetDateStr = CURRENT_GROUP_DATA?.resetDate || currentUserData?.resetDate;
    const resetDate = resetDateStr ? new Date(resetDateStr) : null;

    APP_MATCHES.forEach(m => {
        if (hasResult(m)) {
            if (resetDate && kickoffDate(m) <= resetDate) return;
            const p = preds[m.id];
            if (p) {
                const pts = calculateMatchPoints(p.l, p.v, m.goles_local_real, m.goles_visitante_real);
                total += pts;
                if (pts === 5) exactos++;
            }
        }
    });
    return { total, exactos };
}

function renderRankingTable() {
    const list = document.getElementById('ranking-list');
    if (GROUP_USERS.length === 0) {
        list.innerHTML = '<p class="empty-state">Aún no hay usuarios en tu grupo.</p>';
        return;
    }

    const ranked = GROUP_USERS.map(u => ({ ...u, ...computeUserStats(u.uid) }))
        .sort((a, b) => b.total - a.total || b.exactos - a.exactos || a.nombre_usuario.localeCompare(b.nombre_usuario));

    const medals = ['🥇', '🥈', '🥉'];
    list.innerHTML = '';
    ranked.forEach((u, index) => {
        const item = document.createElement('div');
        item.className = `ranking-item ${u.uid === currentUser.uid ? 'me' : ''} ${index < 3 ? 'podium' : ''}`;
        const initials = u.nombre_usuario.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
        item.innerHTML = `
            <div class="rank-pos">${medals[index] || index + 1}</div>
            <div class="rank-avatar">${initials}</div>
            <div class="rank-name">
                ${u.nombre_usuario} ${u.uid === currentUser.uid ? '<span class="me-tag">Tú</span>' : ''}
                ${u.estado === 'bloqueado' ? '<span class="blocked-tag">Bloqueado</span>' : ''}
            </div>
            <div class="rank-stat">${u.exactos}</div>
            <div class="rank-pts">${u.total}</div>
        `;
        item.addEventListener('click', () => showOtherUserPredictions(u.uid, u.nombre_usuario));
        list.appendChild(item);
    });

    if (CURRENT_GROUP_DATA && CURRENT_GROUP_DATA.podioFaseA && CURRENT_GROUP_DATA.podioFaseA.length > 0) {
        let podiumHtml = `
        <div style="margin-top: 30px; padding: 20px; background: rgba(255, 215, 0, 0.05); border-radius: var(--radius); border: 1px solid var(--gold);">
            <h3 style="text-align: center; color: var(--gold); margin-bottom: 15px; display: flex; align-items: center; justify-content: center; gap: 10px;">
                <i class="fa-solid fa-trophy"></i> Podio Histórico (Fase de Grupos)
            </h3>
            <div style="display: flex; flex-direction: column; gap: 10px;">
        `;
        
        CURRENT_GROUP_DATA.podioFaseA.forEach((u, index) => {
            const initials = u.nombre_usuario.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
            podiumHtml += `
                <div class="ranking-item podium" style="margin-bottom: 0; cursor: default;">
                    <div class="rank-pos">${medals[index] || index + 1}</div>
                    <div class="rank-avatar">${initials}</div>
                    <div class="rank-name">${u.nombre_usuario} ${u.uid === currentUser.uid ? '<span class="me-tag">Tú</span>' : ''}</div>
                    <div class="rank-stat">${u.exactos}</div>
                    <div class="rank-pts" style="color: var(--gold);">${u.total}</div>
                </div>
            `;
        });
        
        podiumHtml += `</div></div>`;
        const podiumDiv = document.createElement('div');
        podiumDiv.innerHTML = podiumHtml;
        list.appendChild(podiumDiv);
    }
}

function showOtherUserPredictions(targetUid, targetUsername) {
    const modal = document.getElementById('other-user-predictions-modal');
    document.getElementById('modal-user-name').innerText = `Predicciones de ${targetUsername}`;
    const list = document.getElementById('modal-predictions-list');
    modal.style.display = 'flex';

    const closedMatches = APP_MATCHES.filter(isMatchLocked).sort((a, b) => kickoffDate(a) - kickoffDate(b));
    if (closedMatches.length === 0) {
        list.innerHTML = '<p class="empty-state">Aún no hay partidos cerrados. Las predicciones son secretas hasta el cierre.</p>';
        return;
    }

    const preds = (GROUP_PREDS[targetUid] && GROUP_PREDS[targetUid].matches) || {};
    
    // Agrupar por jornada
    const grouped = {};
    closedMatches.forEach(m => {
        const j = isNaN(m.jornada) ? m.jornada : `Jornada ${m.jornada}`;
        if (!grouped[j]) grouped[j] = [];
        grouped[j].push(m);
    });

    let html = '<div class="jornadas-accordion" style="display:flex; flex-direction:column; gap:10px;">';
    
    // Ordenar jornadas
    const sortedJornadas = Object.keys(grouped).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''));
        const numB = parseInt(b.replace(/\D/g, ''));
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        if (!isNaN(numA)) return -1;
        if (!isNaN(numB)) return 1;
        return a.localeCompare(b);
    });

    sortedJornadas.forEach((jName, idx) => {
        const matches = grouped[jName];
        // Abrir la última jornada por defecto
        const isOpen = (idx === sortedJornadas.length - 1) ? 'open' : '';
        
        html += `<details class="bets-card" ${isOpen}>
            <summary style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:700; color:var(--color-primary);">${jName}</span>
                <i class="fa-solid fa-chevron-down" style="font-size:0.8rem; color:var(--color-text-muted);"></i>
            </summary>
            <div class="mini-pred-list" style="padding: 10px; border-top: 1px solid var(--color-border); background: rgba(0,0,0,0.2);">`;
        
        matches.forEach(match => {
            const p = preds[match.id];
            const pL = p && p.l !== '' ? p.l : '-';
            const pV = p && p.v !== '' ? p.v : '-';
            let badgeHtml = '';
            if (matchStatus(match) === 'finished') {
                const pts = calculateMatchPoints(pL, pV, match.goles_local_real, match.goles_visitante_real);
                badgeHtml = pointsBadge(pts);
            }
            html += `
                <div class="mini-pred-item" style="margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
                    <div class="mini-pred-teams">
                        ${flagImg(match.equipo_local, 'team-flag-sm')} <span>${match.equipo_local}</span>
                        <b class="mini-pred-score">${pL} - ${pV}</b>
                        <span>${match.equipo_visitante}</span> ${flagImg(match.equipo_visitante, 'team-flag-sm')}
                    </div>
                    ${badgeHtml}
                </div>
            `;
        });
        html += `</div></details>`;
    });

    html += '</div>';
    list.innerHTML = html;
}

// --- PARTIDOS / RESULTADOS OFICIALES (solo lectura) ---
function resultCard(match) {
    const st = matchStatus(match);
    const score = st === 'finished'
        ? `<div class="final-score">${match.goles_local_real} - ${match.goles_visitante_real}</div>`
        : `<div class="final-score pending">vs</div>`;
    return `
        <div class="match-card readonly">
            <div class="match-header">
                <span class="match-meta"><span class="jornada-chip">J${match.jornada}</span> ${formatTime(match)}</span>
                ${statusChip(match)}
            </div>
            <div class="match-teams">
                ${teamRow(match.equipo_local, 'local')}
                ${score}
                ${teamRow(match.equipo_visitante, 'visitante')}
            </div>
            ${venueLine(match)}
        </div>
    `;
}

function renderResultsList() {
    const container = document.getElementById('official-results-container');
    const matches = applyFilter(FILTERS.results);
    container.innerHTML = `<div class="match-list">${renderMatchList(matches, resultCard)}</div>`;
}

// --- TRANSPARENCIA: APUESTAS DEL GRUPO ---
function groupBetsCard(match) {
    const finished = hasResult(match);

    const rows = GROUP_USERS.map(u => {
        const preds = (GROUP_PREDS[u.uid] && GROUP_PREDS[u.uid].matches) || {};
        const p = preds[match.id];
        const pL = p && p.l !== '' ? p.l : null;
        const pV = p && p.v !== '' ? p.v : null;
        const pts = finished && pL != null ? calculateMatchPoints(pL, pV, match.goles_local_real, match.goles_visitante_real) : null;
        return { user: u, pL, pV, pts };
    }).sort((a, b) => {
        if (a.pts != null || b.pts != null) return (b.pts ?? -1) - (a.pts ?? -1);
        return a.user.nombre_usuario.localeCompare(b.user.nombre_usuario);
    });

    const rowsHtml = rows.map(r => `
        <div class="bet-row ${r.user.uid === currentUser.uid ? 'me' : ''}">
            <span class="bet-user">${r.user.nombre_usuario}${r.user.uid === currentUser.uid ? ' <span class="me-tag">Tú</span>' : ''}</span>
            <span class="bet-pred">${r.pL != null ? `${r.pL} - ${r.pV}` : '<span class="no-bet">Sin apuesta</span>'}</span>
            <span class="bet-pts">${r.pts != null ? pointsBadge(r.pts) : ''}</span>
        </div>
    `).join('');

    const scoreLabel = finished ? `${match.goles_local_real} - ${match.goles_visitante_real}` : 'vs';

    return `
        <details class="bets-card">
            <summary>
                <div class="bets-summary">
                    <span class="bets-match">
                        ${flagImg(match.equipo_local, 'team-flag-sm')} ${match.equipo_local}
                        <b>${scoreLabel}</b>
                        ${match.equipo_visitante} ${flagImg(match.equipo_visitante, 'team-flag-sm')}
                    </span>
                    <span class="bets-meta"><span class="jornada-chip">${isNaN(match.jornada) ? match.jornada : `J${match.jornada}`}</span> ${statusChip(match)}</span>
                </div>
            </summary>
            <div class="bet-rows">
                <div class="bet-row bet-row-header"><span class="bet-user">Usuario</span><span class="bet-pred">Apuesta</span><span class="bet-pts">Pts</span></div>
                ${rowsHtml}
            </div>
        </details>
    `;
}

function renderGroupBets() {
    const container = document.getElementById('group-bets-container');
    // Solo partidos con apuestas cerradas: transparencia sin exponer predicciones futuras
    // isGroupStage = false para incluir también los partidos de eliminatoria
    const matches = applyFilter(FILTERS.group, false).filter(isMatchLocked);
    if (matches.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-user-secret"></i><p>Este día no tiene partidos con apuestas cerradas. Las predicciones son secretas hasta 1 hora antes de cada partido.</p></div>`;
        return;
    }
    container.innerHTML = `<div class="match-list">${renderMatchList(matches, groupBetsCard)}</div>`;
}

// --- ADMIN (solo usuarios, grupos y resultados) ---
async function renderAdminViews() {
    renderGroupsListAdmin();
    renderUsersListAdmin();
    renderAdminResultsList();
    renderAdminKnockoutsList();
    renderAdminRankings();
}

function adminResultCard(match) {
    const lVal = match.goles_local_real !== null ? match.goles_local_real : '';
    const vVal = match.goles_visitante_real !== null ? match.goles_visitante_real : '';
    return `
        <div class="match-card">
            <div class="match-header">
                <span class="match-meta"><span class="jornada-chip">J${match.jornada}</span> ${formatTime(match)}</span>
            </div>
            <div class="match-teams">
                <div class="team">
                    <span class="team-name">${match.equipo_local}</span>
                    <input type="number" min="0" max="20" class="score-input admin-pred-l" value="${lVal}" data-id="${match.id}">
                </div>
                <span class="match-vs">VS</span>
                <div class="team">
                    <span class="team-name">${match.equipo_visitante}</span>
                    <input type="number" min="0" max="20" class="score-input admin-pred-v" value="${vVal}" data-id="${match.id}">
                </div>
            </div>
            <div class="card-actions" style="margin-top: 1rem; text-align: center;">
                <button class="btn btn-primary btn-sm btn-save-admin-result" data-id="${match.id}">Guardar Manual</button>
                <span class="save-status" id="admin-status-${match.id}" style="margin-left: 10px;"></span>
            </div>
        </div>
    `;
}

function bindAdminSaveButtons(container) {
    container.querySelectorAll('.btn-save-admin-result').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const btnEl = e.currentTarget;
            const id = btnEl.getAttribute('data-id');
            const card = btnEl.closest('.match-card');
            const lVal = card.querySelector('.admin-pred-l').value;
            const vVal = card.querySelector('.admin-pred-v').value;
            const statusDiv = document.getElementById(`admin-status-${id}`);

            statusDiv.innerText = 'Guardando...';
            statusDiv.style.color = 'var(--color-primary)';
            btnEl.disabled = true;

            try {
                let idx = BASE_MATCHES.findIndex(m => m.id === id);
                
                // Si el partido viene directo de la API (eliminatorias), inyectarlo en BASE_MATCHES primero
                if (idx === -1) {
                    const appMatch = APP_MATCHES.find(m => m.id === id);
                    if (appMatch) {
                        BASE_MATCHES.push({
                            id: appMatch.id,
                            jornada: appMatch.jornada,
                            equipo_local: appMatch.equipo_local,
                            equipo_visitante: appMatch.equipo_visitante,
                            fecha_hora: appMatch.fecha_hora,
                            estadio: appMatch.estadio,
                            ciudad: appMatch.ciudad,
                            pais_sede: appMatch.pais_sede,
                            goles_local_real: lVal === '' ? null : parseInt(lVal),
                            goles_visitante_real: vVal === '' ? null : parseInt(vVal),
                            grupo: null
                        });
                        idx = BASE_MATCHES.length - 1;
                    }
                }

                if (idx !== -1) {
                    BASE_MATCHES[idx].goles_local_real = lVal === '' ? null : parseInt(lVal);
                    BASE_MATCHES[idx].goles_visitante_real = vVal === '' ? null : parseInt(vVal);
                    await setDoc(doc(db, "sistema", "partidos"), { lista: BASE_MATCHES }, { merge: true });
                    
                    // Actualizar APP_MATCHES en memoria de inmediato para recalcular la UI
                    const appIdx = APP_MATCHES.findIndex(m => m.id === id);
                    if (appIdx !== -1) {
                        APP_MATCHES[appIdx].goles_local_real = BASE_MATCHES[idx].goles_local_real;
                        APP_MATCHES[appIdx].goles_visitante_real = BASE_MATCHES[idx].goles_visitante_real;
                    }
                    renderUserViews(); // Recalcula los puntos inmediatamente para todos
                    
                    statusDiv.innerText = 'Guardado exitosamente';
                    statusDiv.style.color = 'var(--color-success)';
                }
            } catch (err) {
                console.error(err);
                statusDiv.innerText = 'Error';
                statusDiv.style.color = 'var(--color-error)';
            }
            btnEl.disabled = false;
            setTimeout(() => { statusDiv.innerText = ''; }, 3000);
        });
    });
}

function renderAdminResultsList() {
    const container = document.getElementById('admin-results-list');
    const groupMatches = APP_MATCHES.filter(m => !isKnockout(m));
    container.innerHTML = renderMatchList(groupMatches, adminResultCard);
    bindAdminSaveButtons(container);
}

async function createGroup() {
    const btn = document.getElementById('btn-create-group');
    const name = document.getElementById('new-group-name').value.trim();
    if (!name) return alert("Ingresa un nombre de grupo válido");
    btn.innerText = 'Creando...';
    try {
        const id = 'g_' + Date.now();
        await setDoc(doc(db, "grupos", id), { nombre: name });
        document.getElementById('new-group-name').value = '';
        await renderGroupsListAdmin();
    } catch (e) {
        console.error(e);
        alert("Error creando grupo");
    }
    btn.innerText = 'Crear Grupo';
}

async function renderGroupsListAdmin() {
    const list = document.getElementById('admin-groups-list');
    list.innerHTML = 'Cargando...';
    const snapshot = await getDocs(collection(db, "grupos"));
    list.innerHTML = '';
    snapshot.forEach(doc => {
        const d = doc.data();
        const resetDateStr = d.resetDate ? new Date(d.resetDate).toLocaleString() : 'Nunca';
        list.innerHTML += `<div class="admin-group-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: var(--radius);">
            <div>
                <strong>${d.nombre}</strong> <small class="text-muted">(ID: ${doc.id})</small>
                <div style="font-size: 0.8rem; color: var(--color-text-muted);">Último reseteo: ${resetDateStr}</div>
            </div>
            <button class="btn btn-sm btn-ghost btn-reset-group" data-id="${doc.id}" style="color:var(--color-error); border:1px solid var(--color-error);" title="Reiniciar puntos a 0">
                <i class="fa-solid fa-rotate-left"></i> Resetear Tabla
            </button>
        </div>`;
    });

    list.querySelectorAll('.btn-reset-group').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const groupId = e.currentTarget.dataset.id;
            const confirmMsg = `¿ESTÁS SEGURO? Esta acción es irreversible.\n\nTodos los usuarios de este grupo volverán a 0 puntos.\n(El historial de sus votos pasados se mantendrá intacto, pero dejarán de sumar a la tabla actual).`;
            if (confirm(confirmMsg)) {
                e.currentTarget.disabled = true;
                e.currentTarget.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                try {
                    // --- CALCULAR PODIO HISTÓRICO ---
                    const usersSnap = await getDocs(collection(db, "usuarios"));
                    const groupUsers = [];
                    usersSnap.forEach(uDoc => {
                        const u = uDoc.data();
                        if (u.grupo_id === groupId && u.estado !== 'admin') groupUsers.push({ uid: uDoc.id, ...u });
                    });

                    const groupPreds = {};
                    for (const u of groupUsers) {
                        const pDoc = await getDoc(doc(db, "predicciones", u.uid));
                        if (pDoc.exists()) groupPreds[u.uid] = pDoc.data().matches || {};
                    }

                    const groupDocSnap = await getDoc(doc(db, "grupos", groupId));
                    const oldResetDate = groupDocSnap.exists() && groupDocSnap.data().resetDate ? new Date(groupDocSnap.data().resetDate) : null;

                    const ranked = groupUsers.map(u => {
                        const preds = groupPreds[u.uid] || {};
                        let total = 0, exactos = 0;
                        APP_MATCHES.forEach(m => {
                            if (hasResult(m)) {
                                if (oldResetDate && kickoffDate(m) <= oldResetDate) return;
                                const p = preds[m.id];
                                if (p) {
                                    const pts = calculateMatchPoints(p.l, p.v, m.goles_local_real, m.goles_visitante_real);
                                    total += pts;
                                    if (pts === 5) exactos++;
                                }
                            }
                        });
                        return { uid: u.uid, nombre_usuario: u.nombre_usuario, total, exactos };
                    }).sort((a, b) => b.total - a.total || b.exactos - a.exactos || a.nombre_usuario.localeCompare(b.nombre_usuario));

                    const podioFaseA = ranked.slice(0, 3); // TOP 3
                    // --------------------------------

                    const newResetDate = new Date().toISOString();
                    await setDoc(doc(db, "grupos", groupId), { 
                        resetDate: newResetDate,
                        podioFaseA: podioFaseA
                    }, { merge: true });
                    
                    alert('Tabla reseteada y Podio Histórico guardado exitosamente.');
                    renderGroupsListAdmin();
                    
                    if (currentUserData && currentUserData.grupo_id === groupId) {
                        currentUserData.resetDate = newResetDate;
                        // También necesitaremos refrescar los datos del grupo si estamos en él, 
                        // pero la próxima carga desde Firebase lo hará.
                        renderUserViews();
                    }
                } catch (err) {
                    console.error(err);
                    alert('Error al resetear la tabla: ' + err.message);
                    renderGroupsListAdmin();
                }
            }
        });
    });
}

async function renderUsersListAdmin() {
    const list = document.getElementById('admin-users-list');
    list.innerHTML = 'Cargando usuarios...';
    try {
        const groupsSnap = await getDocs(collection(db, "grupos"));
        const groupNames = {};
        groupsSnap.forEach(g => { groupNames[g.id] = g.data().nombre; });

        const snap = await getDocs(collection(db, "usuarios"));
        list.innerHTML = '';
        snap.forEach(docSnap => {
            const u = docSnap.data();
            if (u.rol === 'admin') return;
            const div = document.createElement('div');
            div.className = 'admin-user-item';
            const groupName = u.grupo_id ? (groupNames[u.grupo_id] || u.grupo_id) : 'N/A';
            div.innerHTML = `
                <div>
                    <strong>${u.nombre_usuario}</strong>
                    <small class="text-muted">| Grp: ${groupName}</small>
                </div>
                <div>
                    <button class="btn btn-sm ${u.estado === 'bloqueado' ? 'btn-gold' : 'btn-secondary'}" data-uid="${docSnap.id}" data-action="${u.estado === 'bloqueado' ? 'activar' : 'bloquear'}">
                        ${u.estado === 'bloqueado' ? 'Habilitar' : 'Bloquear'}
                    </button>
                </div>
            `;
            list.appendChild(div);
        });

        list.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const uid = e.target.getAttribute('data-uid');
                const action = e.target.getAttribute('data-action');
                const newStatus = action === 'bloquear' ? 'bloqueado' : 'activo';
                await setDoc(doc(db, "usuarios", uid), { estado: newStatus }, { merge: true });
                renderUsersListAdmin();
            });
        });
    } catch (e) {
        console.error(e);
        list.innerHTML = 'Error cargando usuarios';
    }
}

async function renderAdminRankings() {
    const container = document.getElementById('admin-rankings-container');
    if (!container) return;
    container.innerHTML = '<p>Cargando tablas de posiciones...</p>';

    try {
        const [groupsSnap, usersSnap, predsSnap] = await Promise.all([
            getDocs(collection(db, "grupos")),
            getDocs(collection(db, "usuarios")),
            getDocs(collection(db, "predicciones"))
        ]);

        const groups = {};
        groupsSnap.forEach(g => { groups[g.id] = { nombre: g.data().nombre, users: [] }; });

        const usersData = {};
        usersSnap.forEach(u => {
            const data = u.data();
            if (data.rol !== 'admin' && data.grupo_id && groups[data.grupo_id]) {
                usersData[u.id] = { uid: u.id, ...data };
                groups[data.grupo_id].users.push(usersData[u.id]);
            }
        });

        const predsData = {};
        predsSnap.forEach(p => {
            predsData[p.id] = p.data();
        });

        function computeStatsForAdmin(uid, resetDateStr) {
            const preds = (predsData[uid] && predsData[uid].matches) || {};
            let total = 0, exactos = 0;
            const resetDate = resetDateStr ? new Date(resetDateStr) : null;

            APP_MATCHES.forEach(m => {
                if (hasResult(m)) {
                    if (resetDate && kickoffDate(m) <= resetDate) return;
                    const p = preds[m.id];
                    if (p) {
                        const pts = calculateMatchPoints(p.l, p.v, m.goles_local_real, m.goles_visitante_real);
                        total += pts;
                        if (pts === 5) exactos++;
                    }
                }
            });
            return { total, exactos };
        }

        container.innerHTML = '';

        for (const [groupId, group] of Object.entries(groups)) {
            if (group.users.length === 0) continue;

            const ranked = group.users.map(u => ({ ...u, ...computeStatsForAdmin(u.uid, group.resetDate) }))
                .sort((a, b) => b.total - a.total || b.exactos - a.exactos || a.nombre_usuario.localeCompare(b.nombre_usuario));

            const card = document.createElement('div');
            card.className = 'card';
            card.style.marginBottom = '20px';

            const header = document.createElement('h3');
            header.innerHTML = `<i class="fa-solid fa-users"></i> Grupo: ${group.nombre}`;
            card.appendChild(header);

            const rankingHeader = document.createElement('div');
            rankingHeader.className = 'ranking-header';
            rankingHeader.innerHTML = `
                <div class="rank-pos">#</div>
                <div class="rank-name" style="flex:1;">Usuario</div>
                <div class="rank-stat" title="Resultados exactos"><i class="fa-solid fa-bullseye"></i></div>
                <div class="rank-pts">Pts</div>
            `;
            card.appendChild(rankingHeader);

            const list = document.createElement('div');
            list.className = 'ranking-list';

            const medals = ['🥇', '🥈', '🥉'];
            ranked.forEach((u, index) => {
                const item = document.createElement('div');
                item.className = `ranking-item ${index < 3 ? 'podium' : ''}`;
                const initials = u.nombre_usuario.split(/\\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
                item.innerHTML = `
                    <div class="rank-pos">${medals[index] || index + 1}</div>
                    <div class="rank-avatar">${initials}</div>
                    <div class="rank-name">
                        ${u.nombre_usuario}
                        ${u.estado === 'bloqueado' ? '<span class="blocked-tag">Bloqueado</span>' : ''}
                    </div>
                    <div class="rank-stat">${u.exactos}</div>
                    <div class="rank-pts">${u.total}</div>
                `;
                list.appendChild(item);
            });

            card.appendChild(list);
            container.appendChild(card);
        }

        if (container.innerHTML === '') {
            container.innerHTML = '<div class="empty-state"><p>No hay grupos con usuarios.</p></div>';
        }

    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="error-msg">Error cargando tablas de posiciones.</div>';
    }
}

async function renderAdminKnockoutsList() {
    const list = document.getElementById('admin-knockouts-results-list');
    
    const koMatches = APP_MATCHES.filter(m => isKnockout(m));
    
    if (koMatches.length === 0) {
        list.innerHTML = '<p class="text-muted" style="text-align:center;">No hay partidos de eliminatorias disponibles aún desde la API.</p>';
    } else {
        list.innerHTML = renderMatchList(koMatches, adminResultCard);
        bindAdminSaveButtons(list);
    }

    const btnToggle = document.getElementById('btn-toggle-knockouts');
    if (btnToggle) {
        const newBtnToggle = btnToggle.cloneNode(true);
        btnToggle.parentNode.replaceChild(newBtnToggle, btnToggle);
        
        newBtnToggle.innerHTML = KNOCKOUTS_ENABLED 
            ? '<i class="fa-solid fa-lock-open"></i> Estado actual: DESBLOQUEADO (Cerrar)' 
            : '<i class="fa-solid fa-lock"></i> Estado actual: BLOQUEADO (Abrir Votaciones)';
        newBtnToggle.className = `btn ${KNOCKOUTS_ENABLED ? 'btn-success' : 'btn-secondary'}`;

        newBtnToggle.addEventListener('click', async () => {
            newBtnToggle.disabled = true;
            newBtnToggle.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
            try {
                const newState = !KNOCKOUTS_ENABLED;
                await setDoc(doc(db, "sistema", "partidos"), { knockouts_enabled: newState }, { merge: true });
                KNOCKOUTS_ENABLED = newState;
                renderAdminKnockoutsList();
            } catch (err) {
                console.error(err);
                alert('Error al cambiar el estado: ' + err.message);
                renderAdminKnockoutsList();
            }
        });
    }
}
