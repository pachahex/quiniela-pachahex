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
let currentUser = null;
let currentUserData = null; // Doc from 'usuarios'
let isRegisterMode = false;

// Generar Partidos Base (Mundial - 48 partidos)
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth();
const currentDay = new Date().getDate();

const j1Matches = Array.from({length: 16}, (_, i) => ({
    id: `j1_m${i+1}`, jornada: 1, 
    equipo_local: `Equipo Local ${i+1}`, equipo_visitante: `Equipo Visitante ${i+1}`,
    fecha_hora: new Date(currentYear, currentMonth, currentDay, new Date().getHours() + (i - 2), 0).toISOString(),
    goles_local_real: null, goles_visitante_real: null
}));
const j2StartDate = new Date(currentYear, currentMonth, currentDay + 1, 10, 0);
const j2Matches = Array.from({length: 16}, (_, i) => ({
    id: `j2_m${i+1}`, jornada: 2, 
    equipo_local: `Equipo Local ${i+17}`, equipo_visitante: `Equipo Visitante ${i+17}`,
    fecha_hora: new Date(j2StartDate.getTime() + (i * 2 * 60 * 60 * 1000)).toISOString(),
    goles_local_real: null, goles_visitante_real: null
}));
const j3StartDate = new Date(currentYear, currentMonth, currentDay + 3, 10, 0); 
const j3Matches = Array.from({length: 16}, (_, i) => ({
    id: `j3_m${i+1}`, jornada: 3, 
    equipo_local: `Equipo Local ${i+33}`, equipo_visitante: `Equipo Visitante ${i+33}`,
    fecha_hora: new Date(j3StartDate.getTime() + (i * 2 * 60 * 60 * 1000)).toISOString(),
    goles_local_real: null, goles_visitante_real: null
}));

let APP_MATCHES = [...j1Matches, ...j2Matches, ...j3Matches];

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    // Auth UI
    document.getElementById('btn-login').addEventListener('click', () => handleAuth(false));
    document.getElementById('btn-register').addEventListener('click', () => handleAuth(true));
    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
    
    document.getElementById('toggle-auth-mode').addEventListener('click', (e) => {
        e.preventDefault();
        isRegisterMode = !isRegisterMode;
        
        document.getElementById('auth-title').innerText = isRegisterMode ? 'Crear Cuenta' : 'Iniciar Sesión';
        document.getElementById('auth-subtitle').innerText = isRegisterMode ? 'Regístrate para participar.' : 'Ingresa tus credenciales para continuar.';
        document.getElementById('btn-login').style.display = isRegisterMode ? 'none' : 'block';
        document.getElementById('btn-register').style.display = isRegisterMode ? 'block' : 'none';
        e.target.innerText = isRegisterMode ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate aquí';
        document.getElementById('login-error').innerText = '';
    });

    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.getAttribute('data-target');
            e.target.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            e.target.parentElement.parentElement.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Save Predictions UI
    document.getElementById('btn-save-predictions').addEventListener('click', saveCurrentPredictions);
    document.getElementById('btn-save-specials').addEventListener('click', saveCurrentPredictions);

    // Modal Close
    document.querySelector('.close-modal').addEventListener('click', () => {
        document.getElementById('other-user-predictions-modal').style.display = 'none';
    });
});

// --- AUTH & FIREBASE LOGIC ---
function formatEmail(username) {
    return `${username.toLowerCase().replace(/\s+/g, '')}@pachahex.local`;
}

async function handleAuth(isRegister) {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const errorMsg = document.getElementById('login-error');
    
    if (!username || !password) {
        errorMsg.innerText = 'Por favor, completa todos los campos.';
        return;
    }

    const email = formatEmail(username);
    errorMsg.innerText = 'Cargando...';

    try {
        if (isRegister) {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            // Crear documento de usuario en Firestore
            await setDoc(doc(db, "usuarios", userCredential.user.uid), {
                nombre_usuario: username,
                puntos_totales: 0,
                rol: "user",
                grupo_id: ""
            });
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
    
    if (user) {
        currentUser = user;
        
        // Fetch user metadata from Firestore
        const userDoc = await getDoc(doc(db, "usuarios", user.uid));
        if (userDoc.exists()) {
            currentUserData = userDoc.data();
        } else {
            currentUserData = { nombre_usuario: "Desconocido", rol: "user", grupo_id: "" };
        }

        // Obtener resultados oficiales globales
        await fetchOfficialResults();

        // Configurar UI común
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('nav-controls').style.display = 'flex';
        document.getElementById('current-user-info').innerText = currentUserData.nombre_usuario;

        // Routing basado en ROL
        if (currentUserData.rol === 'admin') {
            document.getElementById('admin-section').style.display = 'block';
            document.getElementById('user-section').style.display = 'none';
            renderOfficialResults('admin-matches-container', false);
        } else {
            document.getElementById('admin-section').style.display = 'none';
            document.getElementById('user-section').style.display = 'block';
            document.querySelector('#group-title-display span').innerText = currentUserData.grupo_id || 'Sin Grupo Asignado';
            
            await renderUserViews();
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

// --- BASE DE DATOS Y LÓGICA ---

async function fetchOfficialResults() {
    const resDoc = await getDoc(doc(db, "resultados", "oficiales"));
    if (resDoc.exists()) {
        const oficiales = resDoc.data();
        APP_MATCHES = APP_MATCHES.map(m => {
            if (oficiales[m.id]) {
                m.goles_local_real = oficiales[m.id].l;
                m.goles_visitante_real = oficiales[m.id].v;
            }
            return m;
        });
    }
}

async function saveUserPredictions(userId, matchPredictions, specials) {
    await setDoc(doc(db, "predicciones", userId), {
        matches: matchPredictions,
        specials: specials
    }, { merge: true });
}

async function loadUserPredictions(userId) {
    const docSnap = await getDoc(doc(db, "predicciones", userId));
    if (docSnap.exists()) {
        return docSnap.data();
    }
    return { matches: {}, specials: { goleador: '', jugador: '', portero: '' } };
}

function isMatchLocked(match) {
    const now = new Date();
    if (match.jornada === 1) {
        const lockTime = new Date(new Date(match.fecha_hora).getTime() - (60 * 60 * 1000));
        return now >= lockTime;
    } else {
        const firstJ2Match = APP_MATCHES.find(m => m.jornada === 2);
        const lockTime = new Date(firstJ2Match.fecha_hora);
        return now >= lockTime;
    }
}

function calculateMatchPoints(predL, predV, realL, realV) {
    if (predL == null || predV == null || predL === '' || predV === '' || realL == null || realV == null) return 0;
    
    const pL = parseInt(predL);
    const pV = parseInt(predV);
    const rL = parseInt(realL);
    const rV = parseInt(realV);

    if (pL === rL && pV === rV) return 5;
    
    const pWinner = pL > pV ? 1 : (pL < pV ? 2 : 0);
    const rWinner = rL > rV ? 1 : (rL < rV ? 2 : 0);
    if (pWinner === rWinner) return 3;
    if (pL === rL || pV === rV) return 1;
    return 0;
}

// --- USER VIEWS ---
async function renderUserViews() {
    await renderPredictionsForm();
    await renderRankingTable();
    renderOfficialResults('official-results-container', true);
}

async function renderPredictionsForm() {
    const container = document.getElementById('user-jornadas-container');
    container.innerHTML = '';

    const userPreds = await loadUserPredictions(currentUser.uid);
    const preds = userPreds.matches || {};
    const specials = userPreds.specials || { goleador: '', jugador: '', portero: '' };

    document.getElementById('pred-goleador').value = specials.goleador || '';
    document.getElementById('pred-jugador').value = specials.jugador || '';
    document.getElementById('pred-portero').value = specials.portero || '';

    for (let j = 1; j <= 3; j++) {
        const jMatches = APP_MATCHES.filter(m => m.jornada === j);
        const jornadaDiv = document.createElement('div');
        jornadaDiv.innerHTML = `<div class="jornada-header">
            <h3>Jornada ${j}</h3>
            <span class="text-muted" style="color: white">${j === 1 ? 'Cierre: 1 hr antes de cada partido' : 'Cierre conjunto al inicio de J2'}</span>
        </div>`;
        
        const grid = document.createElement('div');
        grid.className = 'match-grid';

        jMatches.forEach(match => {
            const isLocked = isMatchLocked(match);
            const predL = preds[match.id] ? preds[match.id].l : '';
            const predV = preds[match.id] ? preds[match.id].v : '';
            
            const card = document.createElement('div');
            card.className = `match-card ${isLocked ? 'locked' : ''}`;
            
            let badgeHtml = '';
            if (match.goles_local_real != null && match.goles_visitante_real != null && isLocked) {
                const pts = calculateMatchPoints(predL, predV, match.goles_local_real, match.goles_visitante_real);
                let badgeClass = pts === 5 ? 'perfect' : (pts === 3 ? 'partial' : (pts === 1 ? 'minimal' : 'zero'));
                badgeHtml = `<div class="points-badge ${badgeClass}">${pts}</div>`;
            }

            card.innerHTML = `
                ${badgeHtml}
                <div class="match-header">
                    <span>${new Date(match.fecha_hora).toLocaleString('es-ES', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}</span>
                    <span>${isLocked ? '<i class="fa-solid fa-lock match-status-icon"></i> Cerrado' : '<i class="fa-solid fa-unlock text-muted"></i> Abierto'}</span>
                </div>
                <div class="match-teams">
                    <div class="team">
                        <span class="team-name">${match.equipo_local}</span>
                        <input type="number" min="0" max="20" class="score-input pred-l ${isLocked?'locked':''}" data-id="${match.id}" value="${predL}" ${isLocked ? 'disabled' : ''}>
                    </div>
                    <span class="match-vs">VS</span>
                    <div class="team">
                        <span class="team-name">${match.equipo_visitante}</span>
                        <input type="number" min="0" max="20" class="score-input pred-v ${isLocked?'locked':''}" data-id="${match.id}" value="${predV}" ${isLocked ? 'disabled' : ''}>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
        jornadaDiv.appendChild(grid);
        container.appendChild(jornadaDiv);
    }
}

async function saveCurrentPredictions() {
    const saveStatus = document.getElementById('save-status');
    saveStatus.innerText = 'Guardando en la nube...';
    saveStatus.style.color = 'var(--color-primary)';

    const matchPreds = {};
    
    // Obtener las existentes para no sobreescribir las bloqueadas
    const currentData = await loadUserPredictions(currentUser.uid);
    const existingMatches = currentData.matches || {};

    document.querySelectorAll('.score-input.pred-l').forEach(input => {
        const id = input.getAttribute('data-id');
        const vInput = document.querySelector(`.score-input.pred-v[data-id="${id}"]`);
        
        if (!input.disabled) {
            matchPreds[id] = { l: input.value, v: vInput.value };
        } else if (existingMatches[id]) {
            matchPreds[id] = existingMatches[id];
        }
    });

    const specials = {
        goleador: document.getElementById('pred-goleador').value.trim(),
        jugador: document.getElementById('pred-jugador').value.trim(),
        portero: document.getElementById('pred-portero').value.trim()
    };

    try {
        await saveUserPredictions(currentUser.uid, matchPreds, specials);
        saveStatus.innerText = '¡Guardado con éxito!';
        saveStatus.style.color = 'var(--color-success)';
    } catch (e) {
        console.error(e);
        saveStatus.innerText = 'Error al guardar.';
        saveStatus.style.color = 'var(--color-error)';
    }

    setTimeout(() => { saveStatus.innerText = ''; }, 3000);
}

async function renderRankingTable() {
    const list = document.getElementById('ranking-list');
    list.innerHTML = 'Calculando posiciones...';
    
    try {
        // Traer todos los usuarios del mismo grupo (simplificado, en prod se haría una query if currentUserData.grupo_id != "")
        // Por ahora, traemos todos los usuarios (para probar)
        const querySnapshot = await getDocs(collection(db, "usuarios"));
        let usersData = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            data.uid = docSnap.id;
            usersData.push(data);
        });
        
        // Si hay sistema de grupos estricto:
        // if (currentUserData.grupo_id) { usersData = usersData.filter(u => u.grupo_id === currentUserData.grupo_id); }

        // Fetch de todas las predicciones de estos usuarios
        for (let u of usersData) {
            const preds = await loadUserPredictions(u.uid);
            let total = 0;
            APP_MATCHES.forEach(m => {
                if (m.goles_local_real != null && m.goles_visitante_real != null) {
                    const p = preds.matches?.[m.id];
                    if (p) {
                        total += calculateMatchPoints(p.l, p.v, m.goles_local_real, m.goles_visitante_real);
                    }
                }
            });
            u.puntos_calculados = total;
            
            // Opcional: Actualizar el field puntos_totales en Firestore aquí (o mediante Cloud Functions)
            // await setDoc(doc(db, "usuarios", u.uid), { puntos_totales: total }, { merge: true });
        }

        usersData.sort((a, b) => b.puntos_calculados - a.puntos_calculados);
        
        list.innerHTML = '';
        usersData.forEach((u, index) => {
            const item = document.createElement('div');
            item.className = 'ranking-item';
            item.innerHTML = `
                <div class="rank-pos">${index + 1}</div>
                <div class="rank-name">${u.nombre_usuario} ${u.uid === currentUser.uid ? '(Tú)' : ''}</div>
                <div class="rank-pts">${u.puntos_calculados}</div>
            `;
            item.addEventListener('click', () => showOtherUserPredictions(u.uid, u.nombre_usuario));
            list.appendChild(item);
        });

    } catch (e) {
        console.error(e);
        list.innerHTML = 'Error cargando ranking';
    }
}

async function showOtherUserPredictions(targetUid, targetUsername) {
    const modal = document.getElementById('other-user-predictions-modal');
    document.getElementById('modal-user-name').innerText = `Predicciones de ${targetUsername}`;
    
    const list = document.getElementById('modal-predictions-list');
    list.innerHTML = 'Cargando...';
    modal.style.display = 'flex';

    const closedMatches = APP_MATCHES.filter(m => isMatchLocked(m));
    if (closedMatches.length === 0) {
        list.innerHTML = '<p>Aún no hay partidos cerrados. Las predicciones son secretas hasta el cierre.</p>';
        return;
    }

    const otherData = await loadUserPredictions(targetUid);
    const preds = otherData.matches || {};

    list.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'match-grid';
    
    closedMatches.forEach(match => {
        const p = preds[match.id];
        const pL = p ? p.l : '-';
        const pV = p ? p.v : '-';
        
        let html = `
            <div class="match-card">
                <div class="match-header"><span>${match.equipo_local} vs ${match.equipo_visitante}</span></div>
                <div style="text-align:center; font-weight:bold; font-size: 1.2rem;">
                    ${pL} - ${pV}
                </div>
            </div>
        `;
        grid.innerHTML += html;
    });
    list.appendChild(grid);
}

// --- ADMIN VIEWS ---
function renderOfficialResults(containerId, isReadOnly) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'match-grid';

    APP_MATCHES.forEach(match => {
        const isLocked = isMatchLocked(match);
        const card = document.createElement('div');
        card.className = 'match-card';
        
        let inputsHtml = '';
        if (isReadOnly) {
            inputsHtml = `
                <div class="team">
                    <span class="team-name">${match.equipo_local}</span>
                    <div style="font-size: 1.5rem; font-weight: bold;">${match.goles_local_real != null ? match.goles_local_real : '-'}</div>
                </div>
                <span class="match-vs">VS</span>
                <div class="team">
                    <span class="team-name">${match.equipo_visitante}</span>
                    <div style="font-size: 1.5rem; font-weight: bold;">${match.goles_visitante_real != null ? match.goles_visitante_real : '-'}</div>
                </div>
            `;
        } else {
            inputsHtml = `
                <div class="team">
                    <span class="team-name">${match.equipo_local}</span>
                    <input type="number" min="0" max="20" class="score-input admin-res-l" data-id="${match.id}" value="${match.goles_local_real != null ? match.goles_local_real : ''}">
                </div>
                <span class="match-vs">VS</span>
                <div class="team">
                    <span class="team-name">${match.equipo_visitante}</span>
                    <input type="number" min="0" max="20" class="score-input admin-res-v" data-id="${match.id}" value="${match.goles_visitante_real != null ? match.goles_visitante_real : ''}">
                </div>
            `;
        }

        card.innerHTML = `
            <div class="match-header">
                <span>J${match.jornada} - ${new Date(match.fecha_hora).toLocaleString('es-ES', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}</span>
                <span style="color: ${isLocked ? 'var(--color-primary)' : 'var(--color-secondary)'}">${isLocked ? 'Cerrado' : 'Abierto'}</span>
            </div>
            <div class="match-teams">
                ${inputsHtml}
            </div>
            ${!isReadOnly ? `<button class="btn btn-secondary btn-save-admin-res" data-id="${match.id}" style="width:100%; margin-top:1rem; padding: 0.5rem;">Guardar Resultado</button>` : ''}
        `;
        grid.appendChild(card);
    });
    
    container.appendChild(grid);

    if (!isReadOnly) {
        document.querySelectorAll('.btn-save-admin-res').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                btn.innerText = 'Guardando...';
                const id = e.target.getAttribute('data-id');
                const card = e.target.closest('.match-card');
                const lVal = card.querySelector('.admin-res-l').value;
                const vVal = card.querySelector('.admin-res-v').value;
                
                try {
                    // Update locally
                    const matchIndex = APP_MATCHES.findIndex(m => m.id === id);
                    APP_MATCHES[matchIndex].goles_local_real = lVal === '' ? null : parseInt(lVal);
                    APP_MATCHES[matchIndex].goles_visitante_real = vVal === '' ? null : parseInt(vVal);
                    
                    // Guardar en Firestore 'resultados/oficiales'
                    const resToSave = {};
                    resToSave[id] = {
                        l: APP_MATCHES[matchIndex].goles_local_real,
                        v: APP_MATCHES[matchIndex].goles_visitante_real
                    };
                    
                    await setDoc(doc(db, "resultados", "oficiales"), resToSave, { merge: true });
                    
                    btn.innerText = '¡Guardado!';
                    btn.style.backgroundColor = 'var(--color-success)';
                    setTimeout(() => { 
                        btn.innerText = 'Guardar Resultado';
                        btn.style.backgroundColor = 'var(--color-secondary)';
                    }, 2000);
                } catch (error) {
                    console.error("Error saving official results", error);
                    btn.innerText = 'Error al guardar';
                }
            });
        });
    }
}
