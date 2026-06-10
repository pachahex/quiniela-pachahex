// --- MOCK DATABASE (Para sustituir luego con Firestore) ---
const STORAGE_KEY = 'quiniela_pachahex_db';

// Inicialización de DB
function initDB() {
    let db = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!db) {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();
        const currentDay = new Date().getDate();

        // Generar Partidos (48 en total)
        // J1: 16 partidos (cierran individualmente 1 hora antes)
        // Haremos que algunos ya estén cerrados y otros no para poder probar.
        const j1Matches = Array.from({length: 16}, (_, i) => ({
            id: `j1_m${i+1}`, jornada: 1, 
            equipo_local: `Equipo Local ${i+1}`, equipo_visitante: `Equipo Visitante ${i+1}`,
            fecha_hora: new Date(currentYear, currentMonth, currentDay, new Date().getHours() + (i - 2), 0).toISOString(),
            goles_local_real: null, goles_visitante_real: null
        }));

        // J2 y J3 (32 partidos) cierran MASIVAMENTE cuando inicia el primer partido de la J2
        const j2StartDate = new Date(currentYear, currentMonth, currentDay + 1, 10, 0); // Mañana
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

        db = {
            users: [
                { username: 'admin', password: 'admin123', role: 'admin', groupId: null },
                { username: 'user1', password: 'pass123', role: 'user', groupId: 'g1' },
                { username: 'user2', password: 'pass123', role: 'user', groupId: 'g2' }
            ],
            groups: [
                { id: 'g1', name: 'Quotec' },
                { id: 'g2', name: 'Chicos del Barrio' }
            ],
            matches: [...j1Matches, ...j2Matches, ...j3Matches],
            predictions: {} // userId -> { p_j1_m1: {l: 1, v: 2}, specials: {goleador: ''...} }
        };
        saveDB(db);
    }
    return db;
}

function saveDB(db) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

let APP_DB = initDB();
let currentUser = null;

// --- FIREBASE ASYNC WRAPPERS (Simulados) ---
async function saveUserPredictions(userId, matchPredictions, specials) {
    await new Promise(r => setTimeout(r, 400)); // Network delay sim
    APP_DB = JSON.parse(localStorage.getItem(STORAGE_KEY)); // refresh
    if (!APP_DB.predictions[userId]) APP_DB.predictions[userId] = {};
    APP_DB.predictions[userId].matches = matchPredictions;
    APP_DB.predictions[userId].specials = specials;
    saveDB(APP_DB);
    return true;
}

async function loadUserPredictions(userId) {
    await new Promise(r => setTimeout(r, 200));
    APP_DB = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return APP_DB.predictions[userId] || { matches: {}, specials: { goleador: '', jugador: '', portero: '' } };
}

async function getAllGroupPredictions(groupId) {
    // Retorna predicciones de todos los miembros del grupo
    const usersInGroup = APP_DB.users.filter(u => u.groupId === groupId);
    const result = {};
    for (let u of usersInGroup) {
        result[u.username] = APP_DB.predictions[u.username] || { matches: {}, specials: {} };
    }
    return result;
}

// --- LÓGICA DE NEGOCIO ---

function isMatchLocked(match) {
    const now = new Date();
    if (match.jornada === 1) {
        // Cierra 1 hora antes
        const lockTime = new Date(new Date(match.fecha_hora).getTime() - (60 * 60 * 1000));
        return now >= lockTime;
    } else {
        // Jornadas 2 y 3 cierran juntas cuando inicia el primer partido de la J2
        const firstJ2Match = APP_DB.matches.find(m => m.jornada === 2);
        const lockTime = new Date(firstJ2Match.fecha_hora);
        return now >= lockTime;
    }
}

// Retorna 5 (Exacto), 3 (Ganador), 1 (Goles un equipo), 0 (Nada)
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

// Calcula puntos totales de un usuario para Fase A
function calculateTotalPoints(userId) {
    const preds = APP_DB.predictions[userId]?.matches || {};
    let total = 0;
    
    APP_DB.matches.forEach(m => {
        if (m.goles_local_real != null && m.goles_visitante_real != null) {
            const p = preds[m.id];
            if (p) {
                total += calculateMatchPoints(p.l, p.v, m.goles_local_real, m.goles_visitante_real);
            }
        }
    });

    // Nota: Premios especiales se evalúan en Fase B, por lo que no se suman aquí.
    return total;
}

// --- UI LOGIC ---

document.addEventListener('DOMContentLoaded', () => {
    // Login
    document.getElementById('btn-login').addEventListener('click', handleLogin);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);

    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.getAttribute('data-target');
            // Quitar active de botones hermanos
            e.target.parentElement.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // Mostrar contenido
            e.target.parentElement.parentElement.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Guardar Predicciones
    document.getElementById('btn-save-predictions').addEventListener('click', saveCurrentPredictions);
    document.getElementById('btn-save-specials').addEventListener('click', saveCurrentPredictions);

    // Cerrar Modal
    document.querySelector('.close-modal').addEventListener('click', () => {
        document.getElementById('other-user-predictions-modal').style.display = 'none';
    });

    // Admin Actions
    document.getElementById('btn-create-group').addEventListener('click', createGroup);
    document.getElementById('btn-create-user').addEventListener('click', createUser);
});

function handleLogin() {
    const userVal = document.getElementById('login-username').value.trim();
    const passVal = document.getElementById('login-password').value.trim();
    
    APP_DB = JSON.parse(localStorage.getItem(STORAGE_KEY)); // Refresh DB
    const user = APP_DB.users.find(u => u.username === userVal && u.password === passVal);
    
    if (user) {
        currentUser = user;
        document.getElementById('login-error').innerText = '';
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('nav-controls').style.display = 'flex';
        document.getElementById('current-user-info').innerText = user.username;

        if (user.role === 'admin') {
            document.getElementById('admin-section').style.display = 'block';
            renderAdminViews();
        } else {
            document.getElementById('user-section').style.display = 'block';
            const group = APP_DB.groups.find(g => g.id === user.groupId);
            document.querySelector('#group-title-display span').innerText = group ? group.name : 'Sin Grupo';
            renderUserViews();
        }
    } else {
        document.getElementById('login-error').innerText = 'Usuario o contraseña incorrectos.';
    }
}

function handleLogout() {
    currentUser = null;
    document.getElementById('nav-controls').style.display = 'none';
    document.getElementById('admin-section').style.display = 'none';
    document.getElementById('user-section').style.display = 'none';
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
}

// --- USER VIEWS ---
async function renderUserViews() {
    await renderPredictionsForm();
    renderRankingTable();
    renderOfficialResults('official-results-container', true); // readonly view
}

async function renderPredictionsForm() {
    const container = document.getElementById('user-jornadas-container');
    container.innerHTML = '';

    const userPreds = await loadUserPredictions(currentUser.username);
    const preds = userPreds.matches || {};
    const specials = userPreds.specials || { goleador: '', jugador: '', portero: '' };

    // Fill Specials
    document.getElementById('pred-goleador').value = specials.goleador || '';
    document.getElementById('pred-jugador').value = specials.jugador || '';
    document.getElementById('pred-portero').value = specials.portero || '';

    for (let j = 1; j <= 3; j++) {
        const jMatches = APP_DB.matches.filter(m => m.jornada === j);
        
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
            
            // Badge si ya hay resultado oficial
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
    saveStatus.innerText = 'Guardando...';
    saveStatus.style.color = 'var(--color-primary)';

    const matchPreds = {};
    document.querySelectorAll('.score-input.pred-l').forEach(input => {
        const id = input.getAttribute('data-id');
        const vInput = document.querySelector(`.score-input.pred-v[data-id="${id}"]`);
        if (!input.disabled) {
            matchPreds[id] = { l: input.value, v: vInput.value };
        } else {
            // Mantener las existentes si están bloqueados
            const existing = APP_DB.predictions[currentUser.username]?.matches?.[id];
            if (existing) matchPreds[id] = existing;
        }
    });

    const specials = {
        goleador: document.getElementById('pred-goleador').value.trim(),
        jugador: document.getElementById('pred-jugador').value.trim(),
        portero: document.getElementById('pred-portero').value.trim()
    };

    await saveUserPredictions(currentUser.username, matchPreds, specials);
    
    saveStatus.innerText = '¡Guardado con éxito!';
    saveStatus.style.color = 'var(--color-success)';
    setTimeout(() => { saveStatus.innerText = ''; }, 3000);
    
    renderRankingTable(); // Actualiza por si cambiaron resultados oficiales y él acaba de guardar (edge case)
}

function renderRankingTable() {
    const list = document.getElementById('ranking-list');
    list.innerHTML = '';
    
    const usersInGroup = APP_DB.users.filter(u => u.groupId === currentUser.groupId);
    
    const ranking = usersInGroup.map(u => ({
        username: u.username,
        points: calculateTotalPoints(u.username)
    })).sort((a, b) => b.points - a.points); // Descending
    
    ranking.forEach((u, index) => {
        const item = document.createElement('div');
        item.className = 'ranking-item';
        item.innerHTML = `
            <div class="rank-pos">${index + 1}</div>
            <div class="rank-name">${u.username} ${u.username === currentUser.username ? '(Tú)' : ''}</div>
            <div class="rank-pts">${u.points}</div>
        `;
        
        // Al hacer click, ver predicciones de este usuario (solo las cerradas)
        item.addEventListener('click', () => showOtherUserPredictions(u.username));
        list.appendChild(item);
    });
}

function showOtherUserPredictions(username) {
    // Si el usuario es el admin, no puede verlas aquí (admin no entra a vistas de usuario normal).
    // Solo mostramos partidos cerrados.
    const preds = APP_DB.predictions[username]?.matches || {};
    const modal = document.getElementById('other-user-predictions-modal');
    document.getElementById('modal-user-name').innerText = `Predicciones de ${username}`;
    
    const list = document.getElementById('modal-predictions-list');
    list.innerHTML = '';

    const closedMatches = APP_DB.matches.filter(m => isMatchLocked(m));
    if (closedMatches.length === 0) {
        list.innerHTML = '<p>Aún no hay partidos cerrados. Las predicciones son secretas hasta el cierre.</p>';
    } else {
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
    
    modal.style.display = 'flex';
}

// --- ADMIN VIEWS ---
function renderAdminViews() {
    renderGroupsList();
    populateGroupSelect();
    renderOfficialResults('admin-matches-container', false);
}

function renderGroupsList() {
    const list = document.getElementById('admin-groups-list');
    list.innerHTML = '';
    APP_DB.groups.forEach(g => {
        const usersCount = APP_DB.users.filter(u => u.groupId === g.id).length;
        list.innerHTML += `<div class="card" style="padding: 1rem; margin-bottom: 0.5rem;">
            <strong>${g.name}</strong> - ${usersCount} miembros
        </div>`;
    });
}

function populateGroupSelect() {
    const select = document.getElementById('new-user-group');
    select.innerHTML = '<option value="">Selecciona un Grupo...</option>';
    APP_DB.groups.forEach(g => {
        select.innerHTML += `<option value="${g.id}">${g.name}</option>`;
    });
}

function createGroup() {
    const name = document.getElementById('new-group-name').value.trim();
    if (!name) return alert("Ingresa un nombre");
    const newId = 'g' + (APP_DB.groups.length + 1);
    APP_DB.groups.push({ id: newId, name: name });
    saveDB(APP_DB);
    document.getElementById('new-group-name').value = '';
    renderAdminViews();
    alert("Grupo creado");
}

function createUser() {
    const u = document.getElementById('new-user-username').value.trim();
    const p = document.getElementById('new-user-password').value.trim();
    const g = document.getElementById('new-user-group').value;
    if (!u || !p || !g) return alert("Completa todos los campos");
    if (APP_DB.users.find(usr => usr.username === u)) return alert("Usuario ya existe");
    
    APP_DB.users.push({ username: u, password: p, role: 'user', groupId: g });
    saveDB(APP_DB);
    document.getElementById('new-user-username').value = '';
    document.getElementById('new-user-password').value = '';
    renderAdminViews();
    alert("Usuario creado");
}

// Reutilizable para User (readonly) y Admin (editable)
function renderOfficialResults(containerId, isReadOnly) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'match-grid';

    APP_DB.matches.forEach(match => {
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
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                const card = e.target.closest('.match-card');
                const lVal = card.querySelector('.admin-res-l').value;
                const vVal = card.querySelector('.admin-res-v').value;
                
                const matchIndex = APP_DB.matches.findIndex(m => m.id === id);
                APP_DB.matches[matchIndex].goles_local_real = lVal === '' ? null : parseInt(lVal);
                APP_DB.matches[matchIndex].goles_visitante_real = vVal === '' ? null : parseInt(vVal);
                saveDB(APP_DB);
                alert('Resultado Oficial Actualizado');
            });
        });
    }
}
