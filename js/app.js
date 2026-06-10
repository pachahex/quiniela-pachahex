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
    getDocs,
    updateDoc
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
let APP_MATCHES = []; // Se cargará de Firestore

/*
// --- FIJA EL FIXTURE RAW PARA EL ADMIN (72 partidos UTC-4) ---
const RAW_FIXTURE = [
    { id: 'j1_1', j: 1, l: 'México', v: 'Sudáfrica', date: '2026-06-11T15:00:00-04:00' },
    { id: 'j1_2', j: 1, l: 'Corea del Sur', v: 'Chequia', date: '2026-06-11T22:00:00-04:00' },
    { id: 'j1_3', j: 1, l: 'Canadá', v: 'Bosnia y Herzegovina', date: '2026-06-12T15:00:00-04:00' },
    { id: 'j1_4', j: 1, l: 'Estados Unidos', v: 'Paraguay', date: '2026-06-12T21:00:00-04:00' },
    { id: 'j1_5', j: 1, l: 'Catar', v: 'Suiza', date: '2026-06-13T15:00:00-04:00' },
    { id: 'j1_6', j: 1, l: 'Brasil', v: 'Marruecos', date: '2026-06-13T18:00:00-04:00' },
    { id: 'j1_7', j: 1, l: 'Haití', v: 'Escocia', date: '2026-06-13T21:00:00-04:00' },
    { id: 'j1_8', j: 1, l: 'Australia', v: 'Turquía', date: '2026-06-14T00:00:00-04:00' },
    { id: 'j1_9', j: 1, l: 'Alemania', v: 'Curazao', date: '2026-06-14T13:00:00-04:00' },
    { id: 'j1_10', j: 1, l: 'Países Bajos', v: 'Japón', date: '2026-06-14T16:00:00-04:00' },
    { id: 'j1_11', j: 1, l: 'Costa de Marfil', v: 'Ecuador', date: '2026-06-14T19:00:00-04:00' },
    { id: 'j1_12', j: 1, l: 'Suecia', v: 'Túnez', date: '2026-06-14T22:00:00-04:00' },
    { id: 'j1_13', j: 1, l: 'España', v: 'Cabo Verde', date: '2026-06-15T12:00:00-04:00' },
    { id: 'j1_14', j: 1, l: 'Bélgica', v: 'Egipto', date: '2026-06-15T15:00:00-04:00' },
    { id: 'j1_15', j: 1, l: 'Arabia Saudita', v: 'Uruguay', date: '2026-06-15T18:00:00-04:00' },
    { id: 'j1_16', j: 1, l: 'Irán', v: 'Nueva Zelanda', date: '2026-06-15T21:00:00-04:00' },
    { id: 'j1_17', j: 1, l: 'Francia', v: 'Senegal', date: '2026-06-16T15:00:00-04:00' },
    { id: 'j1_18', j: 1, l: 'Irak', v: 'Noruega', date: '2026-06-16T18:00:00-04:00' },
    { id: 'j1_19', j: 1, l: 'Argentina', v: 'Argelia', date: '2026-06-16T21:00:00-04:00' },
    { id: 'j1_20', j: 1, l: 'Austria', v: 'Jordania', date: '2026-06-17T00:00:00-04:00' },
    { id: 'j1_21', j: 1, l: 'Portugal', v: 'RD Congo', date: '2026-06-17T13:00:00-04:00' },
    { id: 'j1_22', j: 1, l: 'Inglaterra', v: 'Croacia', date: '2026-06-17T16:00:00-04:00' },
    { id: 'j1_23', j: 1, l: 'Ghana', v: 'Panamá', date: '2026-06-17T19:00:00-04:00' },
    { id: 'j1_24', j: 1, l: 'Uzbekistán', v: 'Colombia', date: '2026-06-17T22:00:00-04:00' },
    
    { id: 'j2_1', j: 2, l: 'Chequia', v: 'Sudáfrica', date: '2026-06-18T12:00:00-04:00' },
    { id: 'j2_2', j: 2, l: 'Suiza', v: 'Bosnia y Herzegovina', date: '2026-06-18T15:00:00-04:00' },
    { id: 'j2_3', j: 2, l: 'Canadá', v: 'Catar', date: '2026-06-18T18:00:00-04:00' },
    { id: 'j2_4', j: 2, l: 'México', v: 'Corea del Sur', date: '2026-06-18T21:00:00-04:00' },
    { id: 'j2_5', j: 2, l: 'Estados Unidos', v: 'Australia', date: '2026-06-19T15:00:00-04:00' },
    { id: 'j2_6', j: 2, l: 'Escocia', v: 'Marruecos', date: '2026-06-19T18:00:00-04:00' },
    { id: 'j2_7', j: 2, l: 'Brasil', v: 'Haití', date: '2026-06-19T21:00:00-04:00' },
    { id: 'j2_8', j: 2, l: 'Turquía', v: 'Paraguay', date: '2026-06-19T23:00:00-04:00' },
    { id: 'j2_9', j: 2, l: 'Países Bajos', v: 'Suecia', date: '2026-06-20T13:00:00-04:00' },
    { id: 'j2_10', j: 2, l: 'Alemania', v: 'Costa de Marfil', date: '2026-06-20T16:00:00-04:00' },
    { id: 'j2_11', j: 2, l: 'Ecuador', v: 'Curazao', date: '2026-06-20T20:00:00-04:00' },
    { id: 'j2_12', j: 2, l: 'Túnez', v: 'Japón', date: '2026-06-21T00:00:00-04:00' }, // "00:00 del 21" -> 21 Jun 00:00
    { id: 'j2_13', j: 2, l: 'España', v: 'Arabia Saudita', date: '2026-06-21T12:00:00-04:00' },
    { id: 'j2_14', j: 2, l: 'Bélgica', v: 'Irán', date: '2026-06-21T15:00:00-04:00' },
    { id: 'j2_15', j: 2, l: 'Uruguay', v: 'Cabo Verde', date: '2026-06-21T18:00:00-04:00' },
    { id: 'j2_16', j: 2, l: 'Nueva Zelanda', v: 'Egipto', date: '2026-06-21T21:00:00-04:00' },
    { id: 'j2_17', j: 2, l: 'Argentina', v: 'Austria', date: '2026-06-22T13:00:00-04:00' },
    { id: 'j2_18', j: 2, l: 'Francia', v: 'Irak', date: '2026-06-22T17:00:00-04:00' },
    { id: 'j2_19', j: 2, l: 'Noruega', v: 'Senegal', date: '2026-06-22T20:00:00-04:00' },
    { id: 'j2_20', j: 2, l: 'Jordania', v: 'Argelia', date: '2026-06-22T23:00:00-04:00' },
    { id: 'j2_21', j: 2, l: 'Portugal', v: 'Uzbekistán', date: '2026-06-23T13:00:00-04:00' },
    { id: 'j2_22', j: 2, l: 'Inglaterra', v: 'Ghana', date: '2026-06-23T16:00:00-04:00' },
    { id: 'j2_23', j: 2, l: 'Panamá', v: 'Croacia', date: '2026-06-23T19:00:00-04:00' },
    { id: 'j2_24', j: 2, l: 'Colombia', v: 'RD Congo', date: '2026-06-23T22:00:00-04:00' },

    { id: 'j3_1', j: 3, l: 'Suiza', v: 'Canadá', date: '2026-06-24T15:00:00-04:00' },
    { id: 'j3_2', j: 3, l: 'Bosnia y Herzegovina', v: 'Catar', date: '2026-06-24T15:00:00-04:00' },
    { id: 'j3_3', j: 3, l: 'Escocia', v: 'Brasil', date: '2026-06-24T18:00:00-04:00' },
    { id: 'j3_4', j: 3, l: 'Marruecos', v: 'Haití', date: '2026-06-24T18:00:00-04:00' },
    { id: 'j3_5', j: 3, l: 'Corea del Sur', v: 'Sudáfrica', date: '2026-06-24T21:00:00-04:00' },
    { id: 'j3_6', j: 3, l: 'Chequia', v: 'México', date: '2026-06-24T21:00:00-04:00' },
    { id: 'j3_7', j: 3, l: 'Ecuador', v: 'Alemania', date: '2026-06-25T16:00:00-04:00' },
    { id: 'j3_8', j: 3, l: 'Curazao', v: 'Costa de Marfil', date: '2026-06-25T16:00:00-04:00' },
    { id: 'j3_9', j: 3, l: 'Túnez', v: 'Países Bajos', date: '2026-06-25T19:00:00-04:00' },
    { id: 'j3_10', j: 3, l: 'Japón', v: 'Suecia', date: '2026-06-25T19:00:00-04:00' },
    { id: 'j3_11', j: 3, l: 'Turquía', v: 'EE. UU.', date: '2026-06-25T22:00:00-04:00' },
    { id: 'j3_12', j: 3, l: 'Paraguay', v: 'Australia', date: '2026-06-25T22:00:00-04:00' },
    { id: 'j3_13', j: 3, l: 'Noruega', v: 'Francia', date: '2026-06-26T15:00:00-04:00' },
    { id: 'j3_14', j: 3, l: 'Senegal', v: 'Irak', date: '2026-06-26T15:00:00-04:00' },
    { id: 'j3_15', j: 3, l: 'Cabo Verde', v: 'Arabia Saudita', date: '2026-06-26T20:00:00-04:00' },
    { id: 'j3_16', j: 3, l: 'Uruguay', v: 'España', date: '2026-06-26T20:00:00-04:00' },
    { id: 'j3_17', j: 3, l: 'Nueva Zelanda', v: 'Bélgica', date: '2026-06-26T23:00:00-04:00' },
    { id: 'j3_18', j: 3, l: 'Egipto', v: 'Irán', date: '2026-06-26T23:00:00-04:00' },
    { id: 'j3_19', j: 3, l: 'Panamá', v: 'Inglaterra', date: '2026-06-27T17:00:00-04:00' },
    { id: 'j3_20', j: 3, l: 'Croacia', v: 'Ghana', date: '2026-06-27T17:00:00-04:00' },
    { id: 'j3_21', j: 3, l: 'Colombia', v: 'Portugal', date: '2026-06-27T19:30:00-04:00' },
    { id: 'j3_22', j: 3, l: 'RD Congo', v: 'Uzbekistán', date: '2026-06-27T19:30:00-04:00' },
    { id: 'j3_23', j: 3, l: 'Jordania', v: 'Argentina', date: '2026-06-27T22:00:00-04:00' },
    { id: 'j3_24', j: 3, l: 'Argelia', v: 'Austria', date: '2026-06-27T22:00:00-04:00' }
];
*/

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    // Auth UI
    document.getElementById('btn-login').addEventListener('click', () => handleAuth(false));
    document.getElementById('btn-register').addEventListener('click', () => handleAuth(true));
    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
    
    // Auth Form Validations & Toggles
    const usernameInput = document.getElementById('login-username');
    const hint = document.getElementById('username-hint');
    usernameInput.addEventListener('input', (e) => {
        if(isRegisterMode) {
            const val = e.target.value;
            if(!/^[A-Za-z\s]*$/.test(val)) {
                hint.style.display = 'block';
                hint.style.color = 'var(--color-error)';
            } else {
                hint.style.display = 'block';
                hint.style.color = 'var(--color-text-muted)';
            }
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

        if (isRegisterMode) {
            await loadGroupsForSelect();
        }
    });

    document.getElementById('toggle-password-icon').addEventListener('click', (e) => {
        const input = document.getElementById('login-password');
        if (input.type === 'password') {
            input.type = 'text';
            e.target.classList.remove('fa-eye');
            e.target.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            e.target.classList.remove('fa-eye-slash');
            e.target.classList.add('fa-eye');
        }
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

    // Save Predictions
    document.getElementById('btn-save-predictions').addEventListener('click', saveCurrentPredictions);

    // Modal Close
    document.querySelector('.close-modal').addEventListener('click', () => {
        document.getElementById('other-user-predictions-modal').style.display = 'none';
    });

    // Admin Actions
    // document.getElementById('btn-seed-fixture').addEventListener('click', seedFixtureToDB);
    document.getElementById('btn-create-group').addEventListener('click', createGroup);

    // Validación para que solo se puedan ingresar números enteros positivos
    document.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('score-input')) {
            const allowedKeys = ['Backspace', 'Tab', 'Delete', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
            if (allowedKeys.includes(e.key) || (e.ctrlKey || e.metaKey)) {
                return;
            }
            if (!/^[0-9]$/.test(e.key)) {
                e.preventDefault();
            }
        }
    });

    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('score-input')) {
            e.target.value = e.target.value.replace(/\D/g, '');
        }
    });

    document.addEventListener('paste', (e) => {
        if (e.target.classList.contains('score-input')) {
            const pasteData = (e.clipboardData || window.clipboardData).getData('text');
            if (!/^\d+$/.test(pasteData)) {
                e.preventDefault();
            }
        }
    });
});

// --- CARGA DE PARTIDOS DESDE FIRESTORE ---
async function fetchMatches() {
    const docSnap = await getDoc(doc(db, "sistema", "partidos"));
    if (docSnap.exists()) {
        APP_MATCHES = docSnap.data().lista || [];
    } else {
        console.warn("Los partidos no están inicializados en Firestore. El Admin debe hacer clic en Instalar Fixture.");
        APP_MATCHES = [];
    }
}

/*
async function seedFixtureToDB() {
    const btn = document.getElementById('btn-seed-fixture');
    btn.innerText = "Subiendo...";
    try {
        const matchesArray = RAW_FIXTURE.map(m => ({
            id: m.id,
            jornada: m.j,
            equipo_local: m.l,
            equipo_visitante: m.v,
            fecha_hora: m.date,
            goles_local_real: null,
            goles_visitante_real: null
        }));
        await setDoc(doc(db, "sistema", "partidos"), { lista: matchesArray });
        alert("Fixture de 72 partidos instalado exitosamente en la base de datos.");
        btn.innerText = "Fixture Instalado";
        btn.style.display = "none";
        await fetchMatches(); // reload
        if(currentUserData.rol === 'admin') renderAdminViews();
    } catch(e) {
        console.error(e);
        alert("Error instalando fixture.");
        btn.innerText = "Error";
    }
}
*/

// --- AUTH & FIREBASE LOGIC ---
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
        const groupId = document.getElementById('login-group').value;
        if (!groupId) {
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
                    puntos_totales: 0,
                    rol: "user",
                    grupo_id: document.getElementById('login-group').value,
                    estado: "activo"
                });
            } catch (error) {
                if (error.code === 'auth/email-already-in-use') {
                    // Si el correo ya existe en Firebase Auth, intentamos iniciar sesión con la contraseña proporcionada.
                    // Si tiene éxito y no tiene documento en Firestore (porque fue eliminado manualmente), lo recreamos.
                    try {
                        const userCredential = await signInWithEmailAndPassword(auth, email, password);
                        const userDoc = await getDoc(doc(db, "usuarios", userCredential.user.uid));
                        if (!userDoc.exists()) {
                            await setDoc(doc(db, "usuarios", userCredential.user.uid), {
                                nombre_usuario: username,
                                puntos_totales: 0,
                                rol: "user",
                                grupo_id: document.getElementById('login-group').value,
                                estado: "activo"
                            });
                        } else {
                            // Si el documento sí existe, el usuario ya está completamente registrado.
                            throw error;
                        }
                    } catch (loginError) {
                        // Si falla la contraseña o cualquier otra cosa, lanzamos el error original de que ya está en uso.
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
    
    if (user) {
        currentUser = user;
        let userDoc = await getDoc(doc(db, "usuarios", user.uid));
        
        // Mitigación: Esperar a que setDoc (en el registro) termine si el doc no existe aún
        if (!userDoc.exists()) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            userDoc = await getDoc(doc(db, "usuarios", user.uid));
        }

        if (userDoc.exists()) {
            currentUserData = userDoc.data();
        } else {
            currentUserData = { nombre_usuario: "Desconocido", rol: "user", grupo_id: "", estado: "activo" };
        }

        await fetchMatches();
        await fetchOfficialResults();

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
            
            // Check Bloqueo
            if (currentUserData.estado === 'bloqueado') {
                document.getElementById('user-blocked-alert').style.display = 'block';
                document.getElementById('btn-save-predictions').disabled = true;
            } else {
                document.getElementById('user-blocked-alert').style.display = 'none';
                document.getElementById('btn-save-predictions').disabled = false;
            }

            // Display Group Name
            if (currentUserData.grupo_id) {
                const gDoc = await getDoc(doc(db, "grupos", currentUserData.grupo_id));
                document.querySelector('#group-title-display span').innerText = gDoc.exists() ? gDoc.data().nombre : 'Grupo Desconocido';
            } else {
                document.querySelector('#group-title-display span').innerText = 'Sin Grupo';
            }
            
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

// --- LÓGICA DE PARTIDOS Y PUNTOS ---

async function fetchOfficialResults() {
    const resDoc = await getDoc(doc(db, "resultados", "oficiales"));
    if (resDoc.exists()) {
        const oficiales = resDoc.data();
        APP_MATCHES = APP_MATCHES.map(m => {
            if (oficiales[m.id]) {
                m.goles_local_real = oficiales[m.id].l;
                m.goles_visitante_real = oficiales[m.id].v;
                m.resultado_cerrado = oficiales[m.id].cerrado === true;
            } else {
                m.resultado_cerrado = false;
            }
            return m;
        });
    }
}

async function saveUserPredictions(userId, matchPredictions) {
    if (currentUserData.estado === 'bloqueado') throw new Error("Usuario bloqueado");
    await setDoc(doc(db, "predicciones", userId), {
        matches: matchPredictions
    }, { merge: true });
}

async function loadUserPredictions(userId) {
    const docSnap = await getDoc(doc(db, "predicciones", userId));
    if (docSnap.exists()) {
        return docSnap.data();
    }
    return { matches: {} };
}

function isMatchLocked(match) {
    if (match.resultado_cerrado) return true;
    const now = new Date();
    if (match.jornada === 1) {
        // Bloqueo en el minuto exacto de inicio
        const lockTime = new Date(match.fecha_hora);
        return now >= lockTime;
    } else {
        // J2 y J3: Cierre 6 horas antes del inicio del primer partido de J2 (j2_1)
        const firstJ2Match = APP_MATCHES.find(m => m.id === 'j2_1');
        if (!firstJ2Match) return false;
        const lockTime = new Date(new Date(firstJ2Match.fecha_hora).getTime() - (6 * 60 * 60 * 1000));
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
    renderMatchesList('official-results-container', true, false); // Solo lectura
}

async function renderPredictionsForm() {
    const container = document.getElementById('user-jornadas-container');
    container.innerHTML = '';
    if(APP_MATCHES.length === 0) {
        container.innerHTML = '<p>El administrador aún no ha instalado el fixture oficial.</p>';
        return;
    }

    const userPreds = await loadUserPredictions(currentUser.uid);
    const preds = userPreds.matches || {};

    for (let j = 1; j <= 3; j++) {
        const jMatches = APP_MATCHES.filter(m => m.jornada === j);
        const jornadaDiv = document.createElement('div');
        jornadaDiv.innerHTML = `<div class="jornada-header">
            <h3>Jornada ${j}</h3>
            <span class="text-muted" style="color: white">${j === 1 ? 'JORNADA 1: Cierre exacto en inicio de cada partido' : 'JORNADA 2-3: Cierre masivo 6hrs antes de J2'}</span>
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
            if (match.resultado_cerrado && match.goles_local_real != null && match.goles_visitante_real != null && isLocked) {
                const pts = calculateMatchPoints(predL, predV, match.goles_local_real, match.goles_visitante_real);
                let badgeClass = '';
                let statusWord = '';
                if (pts === 5) { badgeClass = 'perfect'; statusWord = 'Exacto'; }
                else if (pts === 3) { badgeClass = 'partial'; statusWord = 'Ganador'; }
                else if (pts === 1) { badgeClass = 'minimal'; statusWord = 'Parcial'; }
                else { badgeClass = 'zero'; statusWord = 'Fallido'; }
                badgeHtml = `<div class="points-badge ${badgeClass}">${statusWord} (${pts} pts)</div>`;
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
                        <input type="number" min="0" max="20" class="score-input pred-l ${isLocked?'locked':''}" data-id="${match.id}" value="${predL}" ${isLocked || currentUserData.estado==='bloqueado' ? 'disabled' : ''}>
                    </div>
                    <span class="match-vs">VS</span>
                    <div class="team">
                        <span class="team-name">${match.equipo_visitante}</span>
                        <input type="number" min="0" max="20" class="score-input pred-v ${isLocked?'locked':''}" data-id="${match.id}" value="${predV}" ${isLocked || currentUserData.estado==='bloqueado' ? 'disabled' : ''}>
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
    if (currentUserData.estado === 'bloqueado') return alert("Cuenta bloqueada. No puedes guardar.");
    const saveStatus = document.getElementById('save-status');
    saveStatus.innerText = 'Guardando en la nube...';
    saveStatus.style.color = 'var(--color-primary)';

    const matchPreds = {};
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

    try {
        await saveUserPredictions(currentUser.uid, matchPreds);
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
        const querySnapshot = await getDocs(collection(db, "usuarios"));
        let usersData = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            data.uid = docSnap.id;
            // Solo traer usuarios del mismo grupo y que NO sean admin
            if (data.grupo_id === currentUserData.grupo_id && data.rol !== 'admin') {
                usersData.push(data);
            }
        });
        
        for (let u of usersData) {
            const preds = await loadUserPredictions(u.uid);
            let total = 0;
            APP_MATCHES.forEach(m => {
                if (m.resultado_cerrado && m.goles_local_real != null && m.goles_visitante_real != null) {
                    const p = preds.matches?.[m.id];
                    if (p) {
                        total += calculateMatchPoints(p.l, p.v, m.goles_local_real, m.goles_visitante_real);
                    }
                }
            });
            u.puntos_calculados = total;
        }

        usersData.sort((a, b) => b.puntos_calculados - a.puntos_calculados);
        
        list.innerHTML = '';
        if (usersData.length === 0) list.innerHTML = '<p>Aún no hay usuarios en tu grupo.</p>';

        usersData.forEach((u, index) => {
            const item = document.createElement('div');
            item.className = 'ranking-item';
            item.innerHTML = `
                <div class="rank-pos">${index + 1}</div>
                <div class="rank-name">${u.nombre_usuario} ${u.uid === currentUser.uid ? '(Tú)' : ''} <small style="color:var(--color-error)">${u.estado==='bloqueado'?'(Bloqueado)':''}</small></div>
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
        
        let badgeHtml = '';
        if (match.resultado_cerrado && match.goles_local_real != null && match.goles_visitante_real != null) {
            const pts = calculateMatchPoints(pL, pV, match.goles_local_real, match.goles_visitante_real);
            let badgeClass = '';
            let statusWord = '';
            if (pts === 5) { badgeClass = 'perfect'; statusWord = 'Exacto'; }
            else if (pts === 3) { badgeClass = 'partial'; statusWord = 'Ganador'; }
            else if (pts === 1) { badgeClass = 'minimal'; statusWord = 'Parcial'; }
            else { badgeClass = 'zero'; statusWord = 'Fallido'; }
            badgeHtml = `<div class="points-badge ${badgeClass}">${statusWord} (${pts} pts)</div>`;
        }

        let html = `
            <div class="match-card">
                ${badgeHtml}
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
async function renderAdminViews() {
    renderMatchesList('admin-matches-container', false, false); // Ingresar Resultados
    renderGroupsListAdmin();
    renderUsersListAdmin();
    renderMatchesList('admin-fixture-container', false, true); // Editar Fixture
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
        btn.innerText = 'Crear Grupo';
    } catch(e) {
        console.error(e);
        alert("Error creando grupo");
        btn.innerText = 'Crear Grupo';
    }
}

async function renderGroupsListAdmin() {
    const list = document.getElementById('admin-groups-list');
    list.innerHTML = 'Cargando...';
    const snapshot = await getDocs(collection(db, "grupos"));
    list.innerHTML = '';
    snapshot.forEach(doc => {
        list.innerHTML += `<div class="card" style="padding: 1rem; margin-bottom: 0.5rem;">
            <strong>${doc.data().nombre}</strong> <small class="text-muted">(ID: ${doc.id})</small>
        </div>`;
    });
}

async function renderUsersListAdmin() {
    const list = document.getElementById('admin-users-list');
    list.innerHTML = 'Cargando usuarios...';
    try {
        // Precargar nombres de grupos
        const groupsSnap = await getDocs(collection(db, "grupos"));
        const groupNames = {};
        groupsSnap.forEach(g => { groupNames[g.id] = g.data().nombre; });

        const snap = await getDocs(collection(db, "usuarios"));
        list.innerHTML = '';
        snap.forEach(docSnap => {
            const u = docSnap.data();
            if (u.rol === 'admin') return; // no mostrar admins
            const div = document.createElement('div');
            div.className = 'admin-user-item';
            const groupName = u.grupo_id ? (groupNames[u.grupo_id] || u.grupo_id) : 'N/A';
            div.innerHTML = `
                <div>
                    <strong>${u.nombre_usuario}</strong> 
                    <small class="text-muted">| Grp: ${groupName}</small>
                </div>
                <div>
                    <button class="btn btn-sm ${u.estado === 'bloqueado' ? 'btn-primary' : 'btn-secondary'}" data-uid="${docSnap.id}" data-action="${u.estado === 'bloqueado' ? 'activar' : 'bloquear'}">
                        ${u.estado === 'bloqueado' ? 'Habilitar' : 'Bloquear'}
                    </button>
                </div>
            `;
            list.appendChild(div);
        });

        // Add Listeners
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

// Función genérica para listar partidos (Lectura, Admin Resultados, Admin Fixture)
function renderMatchesList(containerId, isReadOnly, isFixtureEditor) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if(APP_MATCHES.length === 0) {
        container.innerHTML = '<p>No hay partidos cargados. Instala el fixture.</p>';
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'match-grid';

    APP_MATCHES.forEach((match, index) => {
        const isLocked = isMatchLocked(match);
        const card = document.createElement('div');
        card.className = 'match-card';
        
        let innerHtml = '';
        
        if (isFixtureEditor) {
            // Modo Editor de Fixture (Admin)
            // Extraer string datetime-local
            const localDate = new Date(match.fecha_hora);
            const offset = localDate.getTimezoneOffset() * 60000;
            const isoLocal = (new Date(localDate - offset)).toISOString().slice(0,16);

            innerHtml = `
                <div class="match-header"><span>J${match.jornada} - ID: ${match.id}</span></div>
                <div class="form-group"><input type="text" class="fix-l" value="${match.equipo_local}"></div>
                <div class="form-group"><input type="text" class="fix-v" value="${match.equipo_visitante}"></div>
                <div class="form-group"><input type="datetime-local" class="fix-date" value="${isoLocal}"></div>
                <button class="btn btn-primary btn-sm btn-save-fix" data-index="${index}">Guardar Fixture</button>
            `;
        } else {
            // Modo Resultados (Lectura o Admin Goles)
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
                        <input type="number" min="0" max="20" class="score-input admin-res-l" value="${match.goles_local_real != null ? match.goles_local_real : ''}" ${match.resultado_cerrado ? 'disabled' : ''}>
                    </div>
                    <span class="match-vs">VS</span>
                    <div class="team">
                        <span class="team-name">${match.equipo_visitante}</span>
                        <input type="number" min="0" max="20" class="score-input admin-res-v" value="${match.goles_visitante_real != null ? match.goles_visitante_real : ''}" ${match.resultado_cerrado ? 'disabled' : ''}>
                    </div>
                `;
            }

            let adminButtons = '';
            if (!isReadOnly) {
                if (match.resultado_cerrado) {
                    adminButtons = `<button class="btn btn-danger btn-sm btn-revert-admin-res" data-id="${match.id}" style="width:100%; margin-top:1rem;">Revertir Cierre</button>`;
                } else {
                    adminButtons = `
                        <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                            <button class="btn btn-secondary btn-sm btn-save-admin-res" data-id="${match.id}" style="flex:1;">Guardar Gol</button>
                            <button class="btn btn-success btn-sm btn-close-admin-res" data-id="${match.id}" style="flex:1;">Cerrar Resultado</button>
                        </div>
                    `;
                }
            }

            innerHtml = `
                <div class="match-header">
                    <span>J${match.jornada} - ${new Date(match.fecha_hora).toLocaleString('es-ES', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}</span>
                    <span style="color: ${isLocked ? 'var(--color-primary)' : 'var(--color-secondary)'}">${isLocked ? 'Cerrado' : 'Abierto'}</span>
                </div>
                <div class="match-teams">${inputsHtml}</div>
                ${adminButtons}
            `;
        }

        card.innerHTML = innerHtml;
        grid.appendChild(card);
    });
    
    container.appendChild(grid);

    // Attach Listeners
    if (isFixtureEditor) {
        container.querySelectorAll('.btn-save-fix').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                btn.innerText = '...';
                const idx = e.target.getAttribute('data-index');
                const card = e.target.closest('.match-card');
                
                const newL = card.querySelector('.fix-l').value.trim();
                const newV = card.querySelector('.fix-v').value.trim();
                const newDateLocal = card.querySelector('.fix-date').value; 
                
                const d = new Date(newDateLocal);
                // Forzar UTC-4 (La Paz, Bolivia) para consistencia global
                // Extraemos año, mes, dia, hora, min del string YYYY-MM-DDTHH:mm
                const ds = newDateLocal.split('T');
                const isoStringWithOffset = `${ds[0]}T${ds[1]}:00-04:00`;

                APP_MATCHES[idx].equipo_local = newL;
                APP_MATCHES[idx].equipo_visitante = newV;
                APP_MATCHES[idx].fecha_hora = isoStringWithOffset;

                try {
                    await setDoc(doc(db, "sistema", "partidos"), { lista: APP_MATCHES });
                    btn.innerText = 'OK';
                    setTimeout(()=> btn.innerText = 'Guardar Fixture', 2000);
                } catch(err) {
                    console.error(err);
                    btn.innerText = 'Error';
                }
            });
        });
    } else if (!isReadOnly) {
        container.querySelectorAll('.btn-save-admin-res').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                btn.innerText = '...';
                const id = e.target.getAttribute('data-id');
                const card = e.target.closest('.match-card');
                const lVal = card.querySelector('.admin-res-l').value;
                const vVal = card.querySelector('.admin-res-v').value;
                
                try {
                    const matchIndex = APP_MATCHES.findIndex(m => m.id === id);
                    APP_MATCHES[matchIndex].goles_local_real = lVal === '' ? null : parseInt(lVal);
                    APP_MATCHES[matchIndex].goles_visitante_real = vVal === '' ? null : parseInt(vVal);
                    
                    const resToSave = {};
                    resToSave[id] = {
                        l: APP_MATCHES[matchIndex].goles_local_real,
                        v: APP_MATCHES[matchIndex].goles_visitante_real,
                        cerrado: APP_MATCHES[matchIndex].resultado_cerrado || false
                    };
                    
                    await setDoc(doc(db, "resultados", "oficiales"), resToSave, { merge: true });
                    btn.innerText = 'Guardado';
                    setTimeout(() => btn.innerText = 'Guardar Gol', 2000);
                } catch (error) {
                    console.error("Error saving official results", error);
                    btn.innerText = 'Error';
                }
            });
        });

        container.querySelectorAll('.btn-close-admin-res').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                btn.innerText = '...';
                const id = e.target.getAttribute('data-id');
                const card = e.target.closest('.match-card');
                const lVal = card.querySelector('.admin-res-l').value;
                const vVal = card.querySelector('.admin-res-v').value;
                
                if (lVal === '' || vVal === '') {
                    alert('Debes ingresar los goles antes de cerrar el resultado.');
                    btn.innerText = 'Cerrar Resultado';
                    return;
                }

                if (!confirm('¿Estás seguro de cerrar este resultado? Esto actualizará la tabla de posiciones y no podrá ser modificado por los usuarios.')) {
                    btn.innerText = 'Cerrar Resultado';
                    return;
                }

                try {
                    const matchIndex = APP_MATCHES.findIndex(m => m.id === id);
                    APP_MATCHES[matchIndex].goles_local_real = parseInt(lVal);
                    APP_MATCHES[matchIndex].goles_visitante_real = parseInt(vVal);
                    APP_MATCHES[matchIndex].resultado_cerrado = true;
                    
                    const resToSave = {};
                    resToSave[id] = {
                        l: APP_MATCHES[matchIndex].goles_local_real,
                        v: APP_MATCHES[matchIndex].goles_visitante_real,
                        cerrado: true
                    };
                    
                    await setDoc(doc(db, "resultados", "oficiales"), resToSave, { merge: true });
                    renderMatchesList('admin-matches-container', false, false);
                } catch (error) {
                    console.error("Error closing result", error);
                    btn.innerText = 'Error';
                }
            });
        });

        container.querySelectorAll('.btn-revert-admin-res').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                btn.innerText = '...';
                const id = e.target.getAttribute('data-id');
                
                if (!confirm('¿Estás seguro de revertir este resultado? Se quitarán los puntos de la tabla de posiciones.')) {
                    btn.innerText = 'Revertir Cierre';
                    return;
                }

                try {
                    const matchIndex = APP_MATCHES.findIndex(m => m.id === id);
                    APP_MATCHES[matchIndex].resultado_cerrado = false;
                    
                    const resToSave = {};
                    resToSave[id] = {
                        l: APP_MATCHES[matchIndex].goles_local_real,
                        v: APP_MATCHES[matchIndex].goles_visitante_real,
                        cerrado: false
                    };
                    
                    await setDoc(doc(db, "resultados", "oficiales"), resToSave, { merge: true });
                    renderMatchesList('admin-matches-container', false, false);
                } catch (error) {
                    console.error("Error reverting result", error);
                    btn.innerText = 'Error';
                }
            });
        });
    }
}
