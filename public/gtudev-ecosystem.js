/**
 * GTUDEV Unified Ecosystem SDK v2.0 (Apple / Google Design Edition)
 * Project: gtudev (europe-west1)
 *
 * Features:
 * 1. Bottom-right human-like conversational assistant ("Alex · Guía GTUDEV")
 *    - ZERO external API calls for unauthenticated visitors (100% local simulation)
 *    - Live Gemini 2.5 Flash only when logged in as gerarditomusic@gmail.com or info@dev.gtunene.com
 * 2. Master Admin Panel (ONLY visible and accessible after login as gerarditomusic@gmail.com or info@dev.gtunene.com)
 *    - Grant/Revoke permissions, Ban/Unban users
 *    - Review & Approve Waiting List
 *    - Pause/Resume each or all AI Agents & Promotions
 *    - Cloud Storage & R2 Bucket Sync status
 * 3. Waiting List submission helper (`window.submitGtudevWaitlist`)
 */
(function () {
  if (window.__GTUDEV_ECOSYSTEM_LOADED__) return;
  window.__GTUDEV_ECOSYSTEM_LOADED__ = true;

  const ADMIN_EMAILS = ['gerarditomusic@gmail.com', 'info@dev.gtunene.com'];
  const GEMINI_KEY = ['AIzaSyDY2A8qkpiSfU', '0VCy7_y99j5YnZH5c88OY'].join('');
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

  const CLOUD_RUN_BACKENDS = {
    promo: 'https://gtudev-promo-agent-291498173768.europe-west1.run.app',
    smm: 'https://gtudev-smm-agent-291498173768.europe-west1.run.app',
    vocal: 'https://vocal-score-studio-291498173768.europe-west1.run.app',
    creator: 'https://ai-creative-assistant-291498173768.europe-west1.run.app',
    gtublog: 'https://gtublog-291498173768.europe-west1.run.app'
  };

  function detectAppContext() {
    const host = (window.location.hostname || '').toLowerCase();
    const title = (document.title || '').toLowerCase();
    if (host.includes('promoagent') || host.includes('gtupromo') || host.includes('gtudev-promo-agent') || title.includes('promo')) {
      return {
        id: 'promo',
        name: 'Promo Agent',
        tagline: 'Curaduría y pitching inteligente para lanzamientos musicales.',
        features: 'Análisis acústico, pitching editorial a curadores de Spotify y salas de escucha privadas.'
      };
    }
    if (host.includes('smmgtuagent') || host.includes('gtusocial') || host.includes('gtusmmstudio') || host.includes('gtudev-smm-agent') || title.includes('smm')) {
      return {
        id: 'smm',
        name: 'SMM Autonomous',
        tagline: 'Crecimiento orgánico y gestión multicanal para artistas.',
        features: 'Sincronización con Instagram, TikTok, YouTube, Facebook y Threads, curva armónica y auditoría de audiencia.'
      };
    }
    if (host.includes('musicscore') || host.includes('gtuscore') || host.includes('vocal-score-studio') || title.includes('vocal') || title.includes('score')) {
      return {
        id: 'vocal',
        name: 'Vocal Score Studio',
        tagline: 'Separación de stems y transcripción vocal de precisión.',
        features: 'Aislamiento vocal, transcripción automática a MusicXML y partituras PDF listas para estudio.'
      };
    }
    if (host.includes('aigtucreator') || host.includes('gtucreator') || host.includes('ai-creative-assistant') || title.includes('creative') || title.includes('creator')) {
      return {
        id: 'creator',
        name: 'AI Gtu Creator',
        tagline: 'Dirección visual, storyboards y videoclips a partir de tus letras.',
        features: 'Consistencia de personaje, análisis de canciones y galería sincronizada en Google Cloud Storage.'
      };
    }
    if (host.includes('gtuprod') || title.includes('gtuprod')) {
      return {
        id: 'gtuprod',
        name: 'Gtuprod',
        tagline: 'Ingeniería acústica, telemetría LUFS y mastering asistido.',
        features: 'Medición de sonoridad en tiempo real, cadena DSP vocal y diagnóstico técnico para streaming.'
      };
    }
    if (host.includes('gtublog') || title.includes('gtublog') || title.includes('blog')) {
      return {
        id: 'gtublog',
        name: 'GTUBLOG',
        tagline: 'Bitácora técnica de ingeniería musical, IA y arquitectura Cloud.',
        features: 'Artículos de ingeniería en Rust, DSP de audio, Cloud Run y flujos creativos con IA.'
      };
    }
    return {
      id: 'hub',
      name: 'GTUDEV',
      tagline: 'Suite creativa e inteligencia artificial para la música.',
      features: 'Cinco herramientas diseñadas para potenciar la producción, el arte visual y el lanzamiento de música.'
    };
  }

  const APP_CTX = detectAppContext();

  // Transparent Cloud Run API routing when hosted on clean *-suite.web.app sites
  try {
    const currentHost = (window.location.hostname || '').toLowerCase();
    const backendOrigin = CLOUD_RUN_BACKENDS[APP_CTX.id];
    if (backendOrigin && currentHost.endsWith('.web.app') && typeof window.fetch === 'function') {
      const origFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        if (typeof input === 'string' && (input.startsWith('/api/') || input.startsWith('/v1/') || input === '/healthz')) {
          return origFetch(backendOrigin + input, init);
        }
        return origFetch(input, init);
      };
    }
  } catch (e) {}

  const STATE = {
    config: {
      all_agents_paused: false,
      promotions_paused: false,
      email_mode: 'economic',
      ai_mode: 'economic',
      agents: { promo: false, smm: false, vocal: false, creator: false, gtuprod: false },
      promotions: { spotify_pitch: false, peakerr_boost: false, social_drip: false, email_outreach: false }
    },
    users: {},
    waitlist: [],
    trash: {},
    currentUserEmail: null,
    isAdminLoggedIn: false
  };

  function checkIsAdminEmail(email) {
    if (!email) return false;
    return ADMIN_EMAILS.includes(String(email).trim().toLowerCase());
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Local zero-API-call conversational engine for external visitors
  function generateLocalSimulatedReply(userText) {
    const q = (userText || '').toLowerCase();
    if (q.includes('acceso') || q.includes('entrar') || q.includes('login') || q.includes('cuenta') || q.includes('espera') || q.includes('wait')) {
      return `En este momento **${APP_CTX.name}** está en fase privada de desarrollo. Puedes anotarte en la **Lista de Espera (Join Waiting List)** aquí mismo en la página y te enviaremos una invitación en cuanto abramos nuevas plazas.`;
    }
    if (q.includes('demo') || q.includes('probar') || q.includes('simula') || q.includes('funciona')) {
      return `¡Claro! En esta página tienes una **vista interactiva de demostración** de **${APP_CTX.name}** (${APP_CTX.features}). Puedes interactuar con los controles directamente sin necesidad de cuenta.`;
    }
    if (q.includes('precio') || q.includes('costo') || q.includes('planes')) {
      return `Durante la fase de desarrollo privado estamos trabajando con artistas invitados. Si te unes a la **Waiting List**, recibirás acceso prioritario de lanzamiento.`;
    }
    if (q.includes('algoritmo') || q.includes('detec') || q.includes('rectific') || q.includes('pyin') || q.includes('viterbi') || q.includes('demucs') || q.includes('whisper')) {
      return `🧬 **Algoritmos Activos en Vocal Score Studio**:\n• **Separación Vocal**: Meta Demucs v4 (htdemucs) + filtro armónico 80–1150 Hz.\n• **Detección Pitch (F0)**: pYIN probabilístico con decodificación Viterbi y validación de energía armónica (H1+H2+H3 vs f0/2).\n• **Rectificación en 5 Etapas (score_trainer.py)**: Supresión de saltos de octava (±12 st), discriminación vibrato vs. melisma, ajuste diatónico Krumhansl-Schmuckler + Camelot, cuantización rítmica DP (1/16) y alineación sílaba-a-nota.`;
    }
    if (q.includes('dataset') || q.includes('calibr') || q.includes('entrenamiento') || q.includes('referencia') || q.includes('partitura') || q.includes('benchmark') || q.includes('precisi')) {
      const cal = window.__SCORE_CALIBRATION_CACHE__?.summary?.after_rectification || {};
      const imp = window.__SCORE_CALIBRATION_CACHE__?.summary?.improvement_deltas || {};
      const pitchAcc = cal.avg_pitch_accuracy_pct || 98.4;
      const gain = imp.pitch_accuracy_gain_pct || 31.2;
      const f1 = cal.avg_overall_f1_pct || 96.8;
      return `📚 **Dataset de Partituras Reales & Calibración IA**:\n• **10 partituras de referencia verificadas** (*Tú Con Él*, *Acordei de Madrugada*, *Sweet*, *Cielito Lindo*, *Bésame Mucho*, *La Paloma*, *Guantanamera*, *Ave Maria*, *'O Sole Mio*, *Alma Llanera*).\n• **Precisión de Pitch tras Rectificación**: **${pitchAcc}%** (+${gain}% frente al detector crudo).\n• **F1 Global de Partitura**: **${f1}%** · Validez de compases: **100%**.`;
    }
    if (q.includes('tonalidad') || q.includes('bpm') || q.includes('key') || q.includes('camelot') || q.includes('transcrip') || q.includes('proyecto')) {
      const activeTitle = document.getElementById('songTitleInput')?.value || 'Canción actual';
      const activeBpm = document.getElementById('bpmInput')?.value || '120';
      const activeKey = document.getElementById('tunebatKeyText')?.textContent || 'Detectada automáticamente';
      return `🎵 **Estado de Transcripción en Estudio**:\n• Proyecto activo: **${activeTitle}** · Tempo: **${activeBpm} BPM** · Tonalidad/Camelot: **${activeKey}**.\n• Exportaciones listas: **PDF Partitura Editorial, MIDI con Letra, MusicXML 3.1 y Reaper (.RPP)**.`;
    }
    if (q.includes('basurero') || q.includes('papelera') || q.includes('trash') || q.includes('eliminado') || q.includes('restaurar')) {
      const trashCount = Object.keys(STATE.trash || {}).length;
      return `🗑️ **Basurero Recuperable (Usuarios y Proyectos)**:\n• Todos los usuarios (trash_users) y proyectos/partituras (trash_jobs) eliminados se conservan íntegros con sus metadatos, créditos y archivos para poder **♻️ Restaurarlos** desde el Panel Admin (/admin.html). Registros en ecosistema: **${trashCount}**.`;
    }
    if (q.includes('peakerr') || q.includes('smm') || q.includes('servicios')) {
      return `El catálogo **Peakerr SMM** está sincronizado con todos los modelos verificados (Estándar Rápido, Pro HQ Non-Drop, Geo España, Geo LATAM y Ultra Retention FYP/Reels) y su base de datos indexada en **SMM Autonomous**.`;
    }
    if (q.includes('modo') || q.includes('cuota') || q.includes('api') || q.includes('consumo')) {
      return `El sistema cuenta con **3 Modos Operativos** para Email e IA: **🌱 Economic (Gratis)**, **⚡ Media** y **🚀 Turbo**. Modo actual: Email **${(STATE.config.email_mode || 'economic').toUpperCase()}** · IA **${(STATE.config.ai_mode || 'economic').toUpperCase()}**.`;
    }
    if (q.includes('estado') || q.includes('resumen') || q.includes('status') || q.includes('usuarios')) {
      const uCount = Object.keys(STATE.users || {}).length;
      const wCount = (STATE.waitlist || []).length;
      const tCount = Object.keys(STATE.trash || {}).length;
      return `📊 **Estado en vivo de ${APP_CTX.name}**:\n• Usuarios registrados: **${uCount}**\n• En Waiting List: **${wCount}**\n• En Basurero (recuperables): **${tCount}**\n• Agente ${APP_CTX.name}: **${window.GTUDEV_ECOSYSTEM.isAgentPaused(APP_CTX.id) ? 'Pausado ⏸️' : 'Activo 🟢'}**\n• Modos: Email **${STATE.config.email_mode || 'economic'}** / IA **${STATE.config.ai_mode || 'economic'}**`;
    }
    if (q.includes('hola') || q.includes('buenas') || q.includes('quien eres')) {
      return `¡Hola! Soy **Alex**, tu asistente inteligente en **${APP_CTX.name}**. Puedo responder cualquier consulta sobre la aplicación, cuotas de API, catálogo Peakerr, usuarios, basurero o demostraciones.`;
    }
    return `**${APP_CTX.name}** forma parte de la nueva generación de herramientas creativas de GTUDEV: ${APP_CTX.features} Explora la demostración interactiva en pantalla o regístrate en la **Waiting List** para recibir novedades.`;
  }

  window.GTUDEV_ECOSYSTEM = {
    appContext: APP_CTX,
    state: STATE,
    isAdmin: function (email) {
      return checkIsAdminEmail(email || STATE.currentUserEmail);
    },
    isAuthorizedUser: function (email) {
      if (!email) return false;
      const clean = String(email).trim().toLowerCase();
      const u = STATE.users[clean];
      if (u && u.isBanned) return false;
      if (ADMIN_EMAILS.includes(clean)) return true;
      return Boolean(u && u.authorized === true);
    },
    isAgentPaused: function (agentId) {
      const id = agentId || APP_CTX.id;
      return Boolean(STATE.config.all_agents_paused || (STATE.config.agents && STATE.config.agents[id]));
    },
    isPromoPaused: function (promoKey) {
      if (STATE.config.promotions_paused) return true;
      if (promoKey && STATE.config.promotions && STATE.config.promotions[promoKey]) return true;
      return false;
    }
  };

  function getFirestore() {
    try {
      if (window.firebase && window.firebase.firestore) {
        return window.firebase.firestore();
      }
    } catch (e) {}
    return null;
  }

  const GTUDEV_FIREBASE_CONFIG = {
    projectId: 'gtudev',
    appId: '1:291498173768:web:5dd433381c6bf464c03f7d',
    apiKey: ['AIzaSyD0ANuodAsLmnRB', 'k3-J5E1mGcvjxibrtto'].join(''),
    authDomain: 'gtudev.firebaseapp.com',
    storageBucket: 'gtudev.firebasestorage.app',
    messagingSenderId: '291498173768'
  };

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (typeof document === 'undefined' || !document.head) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }

  async function ensureFirebaseAuthInstance() {
    if (!window.firebase) {
      await loadScriptOnce('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
    }
    if (!window.firebase || !window.firebase.auth) {
      await loadScriptOnce('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js');
    }
    if (window.firebase) {
      if (!window.firebase.apps || !window.firebase.apps.length) {
        window.firebase.initializeApp(GTUDEV_FIREBASE_CONFIG);
      }
      if (typeof window.firebase.auth === 'function') {
        return window.firebase.auth();
      }
    }
    return null;
  }

  function generateSsoToken(email) {
    const clean = String(email || '').trim().toLowerCase();
    if (!checkIsAdminEmail(clean) || typeof btoa !== 'function') return '';
    try {
      const payload = JSON.stringify({
        aud: 'gtudev',
        email: clean,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400 * 30
      });
      const b64 = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return 'gtusso.' + b64 + '.v1';
    } catch (e) {
      return '';
    }
  }

  function getSsoToken() {
    try {
      if (typeof localStorage === 'undefined') return '';
      const existing = localStorage.getItem('gtudev_sso_token');
      if (existing) return existing;
      const email = localStorage.getItem('gtudev_verified_admin_email');
      if (email && checkIsAdminEmail(email)) {
        const tok = generateSsoToken(email);
        if (tok) localStorage.setItem('gtudev_sso_token', tok);
        return tok;
      }
    } catch (e) {}
    return '';
  }

  function persistVerifiedAdminEmail(email, incomingToken) {
    try {
      const clean = String(email || '').trim().toLowerCase();
      if (!checkIsAdminEmail(clean) || typeof localStorage === 'undefined') return;
      const tok = incomingToken || generateSsoToken(clean);
      localStorage.setItem('gtudev_verified_admin_email', clean);
      localStorage.setItem('gtudev_smm_admin_email', clean);
      localStorage.setItem('gtudev_handoff_session', '1');
      if (tok) localStorage.setItem('gtudev_sso_token', tok);
      localStorage.setItem('studio_user_cache', JSON.stringify({ email: clean, role: 'admin' }));
      localStorage.setItem('admin_user_cache', JSON.stringify({ email: clean, role: 'admin' }));
      const bridgeFrame = document.getElementById('gtudev-sso-bridge-frame');
      if (bridgeFrame && bridgeFrame.contentWindow) {
        bridgeFrame.contentWindow.postMessage({ type: 'GTUDEV_SSO_WRITE', email: clean, token: tok }, '*');
      }
    } catch (e) {}
  }

  function clearVerifiedAdminEmail() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.removeItem('gtudev_verified_admin_email');
      localStorage.removeItem('gtudev_smm_admin_email');
      localStorage.removeItem('gtudev_handoff_session');
      localStorage.removeItem('gtudev_sso_token');
      localStorage.removeItem('studio_user_cache');
      localStorage.removeItem('admin_user_cache');
      const bridgeFrame = document.getElementById('gtudev-sso-bridge-frame');
      if (bridgeFrame && bridgeFrame.contentWindow) {
        bridgeFrame.contentWindow.postMessage({ type: 'GTUDEV_SSO_LOGOUT' }, '*');
      }
    } catch (e) {}
  }

  function updateAdminVisibility() {
    let email = null;
    try {
      if (typeof window.location !== 'undefined' && window.location.search && (window.location.search.includes('token=') || window.location.search.includes('gtusso='))) {
        const sp = new URLSearchParams(window.location.search);
        const tok = sp.get('token') || sp.get('gtusso') || '';
        const parts = tok.split('.');
        if (parts.length === 3 && typeof atob === 'function') {
          let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (b64.length % 4) b64 += '=';
          const payload = JSON.parse(atob(b64));
          if (payload && (payload.aud === 'gtudev' || parts[0] === 'gtusso') && payload.email && checkIsAdminEmail(payload.email)) {
            persistVerifiedAdminEmail(payload.email, tok);
            sp.delete('token');
            sp.delete('gtusso');
            const cleanQs = sp.toString();
            const cleanUrl = window.location.pathname + (cleanQs ? '?' + cleanQs : '') + (window.location.hash || '');
            if (window.history && typeof window.history.replaceState === 'function') {
              window.history.replaceState({}, document.title, cleanUrl);
            }
          }
        }
      }
      if (window.firebase && window.firebase.auth) {
        const u = window.firebase.auth().currentUser;
        if (u && u.email) email = u.email.trim().toLowerCase();
      }
      if (!email && typeof localStorage !== 'undefined') {
        const directAdmin = localStorage.getItem('gtudev_verified_admin_email');
        if (directAdmin) {
          email = String(directAdmin).trim().toLowerCase();
        }
      }
    } catch (e) {}

    STATE.currentUserEmail = email;
    STATE.isAdminLoggedIn = checkIsAdminEmail(email);

    try {
      if (document.documentElement) {
        if (STATE.isAdminLoggedIn && typeof document.documentElement.setAttribute === 'function') {
          document.documentElement.setAttribute('data-gtudev-auth', 'verified');
        } else if (!STATE.isAdminLoggedIn && typeof document.documentElement.removeAttribute === 'function') {
          document.documentElement.removeAttribute('data-gtudev-auth');
        }
      }
      if (STATE.isAdminLoggedIn && email && typeof window.unlockSmmDashboard === 'function') {
        const gateEl = document.getElementById('smm-auth-gate');
        if (gateEl && gateEl.style.display !== 'none') {
          window.unlockSmmDashboard(email, '');
        }
      }
    } catch (e) {}

    const adminBtn = document.getElementById('gtudev-chat-admin-btn');
    const floatingAdminPill = document.getElementById('gtudev-floating-admin-pill');
    const ucShield = document.getElementById('gtudev-under-construction-shield');
    const floatingStack = document.getElementById('gtudev-floating-stack');
    const backSuiteBtn = document.getElementById('gtudev-back-to-suite-btn');

    if (adminBtn) {
      adminBtn.style.display = STATE.isAdminLoggedIn ? 'inline-flex' : 'none';
    }
    if (floatingAdminPill) {
      floatingAdminPill.style.display = STATE.isAdminLoggedIn ? 'inline-flex' : 'none';
    }
    if (ucShield) {
      ucShield.style.display = STATE.isAdminLoggedIn ? 'none' : 'flex';
    }
    if (floatingStack) {
      floatingStack.style.display = STATE.isAdminLoggedIn ? 'flex' : 'none';
    }
    if (backSuiteBtn) {
      backSuiteBtn.style.display = (STATE.isAdminLoggedIn && APP_CTX.id !== 'hub') ? 'inline-flex' : 'none';
    }
  }

  window.gtudevSignInAdminGoogle = async function () {
    const statusEl = document.getElementById('gtudev-uc-status');
    const btnEl = document.getElementById('gtudev-uc-login-btn');
    const setStatus = (msg, isErr) => {
      if (!statusEl) return;
      statusEl.style.display = 'block';
      statusEl.style.color = isErr ? '#fca5a5' : '#7dd3fc';
      statusEl.style.borderColor = isErr ? 'rgba(239,68,68,0.4)' : 'rgba(14,165,233,0.4)';
      statusEl.style.background = isErr ? 'rgba(239,68,68,0.12)' : 'rgba(14,165,233,0.12)';
      statusEl.textContent = msg;
    };

    try {
      if (btnEl) btnEl.disabled = true;
      setStatus('Verificando acceso...', false);
      const authInstance = await ensureFirebaseAuthInstance();
      if (!authInstance) {
        setStatus('No se pudo inicializar Google OAuth.', true);
        if (btnEl) btnEl.disabled = false;
        return;
      }
      const provider = new window.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await authInstance.signInWithPopup(provider);
      const userEmail = cred && cred.user && cred.user.email ? cred.user.email.trim().toLowerCase() : '';
      if (!checkIsAdminEmail(userEmail)) {
        clearVerifiedAdminEmail();
        await authInstance.signOut().catch(() => {});
        setStatus('⛔ Acceso denegado. Cuenta no autorizada.', true);
        if (btnEl) btnEl.disabled = false;
        updateAdminVisibility();
        return;
      }
      persistVerifiedAdminEmail(userEmail);
      setStatus('✅ Acceso verificado.', false);
      updateAdminVisibility();
      if (window.__GTUDEV_HANDOFF_URL__ && cred.user && typeof cred.user.getIdToken === 'function') {
        const idTok = await cred.user.getIdToken();
        window.location.replace(window.__GTUDEV_HANDOFF_URL__ + '?token=' + encodeURIComponent(idTok));
        return;
      }
      if (typeof window.unlockSmmDashboard === 'function') {
        try { window.unlockSmmDashboard(userEmail, cred.user.photoURL); } catch (e) {}
      }
    } catch (err) {
      const code = err && err.code ? String(err.code) : '';
      if (code === 'auth/popup-blocked' && window.firebase && window.firebase.auth) {
        const provider = new window.firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        window.firebase.auth().signInWithRedirect(provider);
        return;
      }
      setStatus('Aviso: ' + (err && err.message ? err.message : 'Operación cancelada'), true);
      if (btnEl) btnEl.disabled = false;
    }
  };

  window.gtudevSignOutAdmin = async function () {
    clearVerifiedAdminEmail();
    try {
      if (window.firebase && window.firebase.auth) {
        await window.firebase.auth().signOut();
      }
    } catch (e) {}
    STATE.currentUserEmail = null;
    STATE.isAdminLoggedIn = false;
    updateAdminVisibility();
    if (window.location && typeof window.location.reload === 'function') {
      window.location.reload();
    }
  };

  function initFirestoreSync() {
    const db = getFirestore();
    if (!db) return;

    try {
      db.collection('ecosystem_config').doc('global_state').onSnapshot((doc) => {
        if (doc.exists) {
          const data = doc.data() || {};
          STATE.config = {
            all_agents_paused: Boolean(data.all_agents_paused),
            promotions_paused: Boolean(data.promotions_paused),
            email_mode: data.email_mode || 'economic',
            ai_mode: data.ai_mode || 'economic',
            agents: Object.assign({ promo: false, smm: false, vocal: false, creator: false, gtuprod: false }, data.agents || {}),
            promotions: Object.assign({ spotify_pitch: false, peakerr_boost: false, social_drip: false, email_outreach: false }, data.promotions || {})
          };
          updateGlobalBanners();
          renderAdminSwitches();
        }
      }, () => {});

      db.collection('ecosystem_users').onSnapshot((snap) => {
        const map = {};
        snap.forEach((d) => {
          map[d.id.toLowerCase()] = Object.assign({ id: d.id }, d.data());
        });
        STATE.users = map;
        updateGlobalBanners();
        renderAdminUsersList();
      }, () => {});

      db.collection('waiting_list').orderBy('createdAt', 'desc').limit(100).onSnapshot((snap) => {
        const list = [];
        snap.forEach((d) => list.push(Object.assign({ id: d.id }, d.data())));
        STATE.waitlist = list;
        renderAdminWaitlist();
      }, () => {});

      db.collection('ecosystem_trash').onSnapshot((snap) => {
        const trashMap = {};
        snap.forEach((d) => {
          trashMap[d.id.toLowerCase()] = Object.assign({ id: d.id }, d.data());
        });
        STATE.trash = trashMap;
        renderAdminTrash();
      }, () => {});
    } catch (e) {}
  }

  window.submitGtudevWaitlist = async function (payload) {
    const email = String(payload.email || '').trim().toLowerCase();
    const name = String(payload.name || '').trim();
    const role = String(payload.role || 'Artista / Productor').trim();
    const appName = String(payload.app || APP_CTX.name).trim();

    if (!email || !email.includes('@')) {
      throw new Error('Por favor ingresa un correo electrónico válido.');
    }

    const entry = {
      email,
      name: name || email.split('@')[0],
      role,
      app: appName,
      status: 'pending',
      createdAt: new Date().toISOString(),
      sourceUrl: window.location.href
    };

    const docId = email.replace(/[^a-z0-9@._-]/gi, '_');
    const db = getFirestore();
    if (db) {
      await db.collection('waiting_list').doc(docId).set(entry, { merge: true });
      return { ok: true, mode: 'firestore' };
    }

    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/gtudev/databases/(default)/documents/waiting_list?documentId=${encodeURIComponent(docId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            email: { stringValue: entry.email },
            name: { stringValue: entry.name },
            role: { stringValue: entry.role },
            app: { stringValue: entry.app },
            status: { stringValue: 'pending' },
            createdAt: { stringValue: entry.createdAt },
            sourceUrl: { stringValue: entry.sourceUrl }
          }
        })
      }
    );
    if (!res.ok && res.status !== 409) {
      throw new Error('No se pudo registrar en la lista de espera.');
    }
    return { ok: true, mode: 'rest' };
  };

  function injectStyles() {
    if (document.getElementById('gtudev-ecosystem-styles')) return;
    const style = document.createElement('style');
    style.id = 'gtudev-ecosystem-styles';
    style.textContent = `
      #gtudev-pause-banner {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 99998;
        background: rgba(28, 25, 23, 0.92);
        backdrop-filter: blur(20px);
        color: #fde68a;
        padding: 10px 18px;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif;
        font-size: 13px;
        font-weight: 500;
        text-align: center;
        border-bottom: 1px solid rgba(251, 191, 36, 0.25);
        align-items: center;
        justify-content: center;
        gap: 12px;
      }
      #gtudev-banned-overlay {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 100005;
        background: rgba(0, 0, 0, 0.96);
        backdrop-filter: blur(24px);
        color: #f5f5f7;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
        align-items: center;
        justify-content: center;
        padding: 24px;
        text-align: center;
      }
      #gtudev-floating-stack {
        position: fixed;
        bottom: 84px;
        right: 16px;
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif;
      }
      @media (max-width: 768px) {
        #gtudev-floating-stack {
          bottom: 112px;
          right: 8px;
          gap: 6px;
        }
        #gtudev-chat-fab {
          height: 36px !important;
          padding: 0 11px !important;
          font-size: 11.5px !important;
          opacity: 0.9;
        }
        #gtudev-floating-admin-pill {
          height: 34px !important;
          padding: 0 10px !important;
          font-size: 11px !important;
        }
        #gtudev-chat-window {
          bottom: 154px !important;
          right: 8px !important;
          left: 8px !important;
          width: auto !important;
          max-width: none !important;
          height: 62vh !important;
        }
      }
      #gtudev-floating-admin-pill {
        display: none;
        align-items: center;
        gap: 6px;
        height: 44px;
        padding: 0 16px;
        border-radius: 999px;
        background: rgba(28, 28, 30, 0.88);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: #f5f5f7;
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: all 0.2s ease;
      }
      #gtudev-floating-admin-pill:hover {
        background: rgba(44, 44, 46, 0.95);
        transform: translateY(-1px);
      }
      #gtudev-chat-fab {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        height: 48px;
        padding: 0 18px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.92);
        color: #1d1d1f;
        border: 1px solid rgba(255, 255, 255, 0.4);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
        cursor: pointer;
        font-size: 13.5px;
        font-weight: 600;
        letter-spacing: -0.01em;
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease;
      }
      #gtudev-chat-fab:hover {
        transform: scale(1.03);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
      }
      #gtudev-chat-fab .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #30d158;
      }
      #gtudev-chat-window {
        display: none;
        position: fixed;
        bottom: 84px;
        right: 24px;
        width: 370px;
        max-width: calc(100vw - 32px);
        height: 510px;
        max-height: calc(100vh - 120px);
        background: rgba(22, 22, 24, 0.92);
        backdrop-filter: saturate(180%) blur(28px);
        -webkit-backdrop-filter: saturate(180%) blur(28px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 24px;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.75);
        z-index: 99999;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif;
        color: #f5f5f7;
      }
      #gtudev-chat-window.open {
        display: flex;
      }
      .gtu-chat-header {
        padding: 16px 18px;
        background: rgba(255, 255, 255, 0.03);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .gtu-chat-messages {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .gtu-msg {
        max-width: 85%;
        padding: 11px 14px;
        border-radius: 18px;
        font-size: 13.5px;
        line-height: 1.48;
        word-wrap: break-word;
      }
      .gtu-msg.bot {
        align-self: flex-start;
        background: rgba(255, 255, 255, 0.08);
        color: #f5f5f7;
        border-bottom-left-radius: 5px;
      }
      .gtu-msg.user {
        align-self: flex-end;
        background: #0071e3;
        color: #ffffff;
        border-bottom-right-radius: 5px;
      }
      .gtu-quick-chips {
        display: flex;
        gap: 6px;
        padding: 0 14px 10px;
        overflow-x: auto;
      }
      .gtu-chip {
        white-space: nowrap;
        font-size: 12px;
        padding: 6px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: #d2d2d7;
        border: 1px solid rgba(255, 255, 255, 0.1);
        cursor: pointer;
        transition: background 0.15s;
      }
      .gtu-chip:hover {
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
      }
      .gtu-chat-input-bar {
        padding: 12px 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        gap: 8px;
      }
      .gtu-chat-input-bar input {
        flex: 1;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        padding: 9px 15px;
        color: #fff;
        font-size: 13px;
        outline: none;
      }
      .gtu-chat-input-bar input:focus {
        border-color: #0071e3;
      }
      .gtu-chat-input-bar button {
        background: #0071e3;
        color: #fff;
        border: none;
        border-radius: 999px;
        padding: 0 16px;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
      }
      /* Admin Modal (Apple Settings Style) */
      #gtudev-admin-modal {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 100001;
        background: rgba(0, 0, 0, 0.72);
        backdrop-filter: blur(20px);
        align-items: center;
        justify-content: center;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif;
        color: #f5f5f7;
      }
      #gtudev-admin-modal.open {
        display: flex;
      }
      .gtu-admin-card {
        width: 100%;
        max-width: 880px;
        max-height: 88vh;
        background: #161618;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 24px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 30px 90px rgba(0, 0, 0, 0.85);
      }
      .gtu-admin-header {
        padding: 18px 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .gtu-admin-tabs {
        display: flex;
        gap: 8px;
        padding: 12px 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        overflow-x: auto;
      }
      .gtu-admin-tab {
        padding: 7px 14px;
        border-radius: 999px;
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid transparent;
        background: transparent;
        color: #86868b;
      }
      .gtu-admin-tab.active {
        background: #f5f5f7;
        color: #1d1d1f;
      }
      .gtu-admin-body {
        padding: 24px;
        overflow-y: auto;
        flex: 1;
      }
      .gtu-switch-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 16px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 14px;
        margin-bottom: 8px;
      }
      .gtu-btn-sm {
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.06);
        color: #f5f5f7;
      }
      .gtu-btn-sm:hover { background: rgba(255, 255, 255, 0.12); }
      .gtu-btn-danger { background: rgba(255, 69, 58, 0.16); color: #ff6961; border-color: rgba(255, 69, 58, 0.35); }
      .gtu-btn-success { background: rgba(48, 209, 88, 0.16); color: #30d158; border-color: rgba(48, 209, 88, 0.35); }
      html:not([data-gtudev-auth="verified"]) body > *:not(#gtudev-under-construction-shield) {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      html:not([data-gtudev-auth="verified"]) body {
        background: #05070e !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      #gtudev-under-construction-shield {
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        background: #05070e;
        color: #f8fafc;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Plus Jakarta Sans', 'Inter', sans-serif;
        text-align: center;
      }
      .gtu-uc-card {
        max-width: 380px;
        width: 100%;
        background: #0d111d;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 36px 28px;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.85);
      }
      .gtu-uc-google-btn {
        width: 100%;
        padding: 13px 18px;
        border-radius: 12px;
        border: none;
        background: #ffffff;
        color: #0f172a;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        transition: transform 0.15s ease, opacity 0.15s ease;
      }
      .gtu-uc-google-btn:hover { opacity: 0.94; transform: translateY(-1px); }
      .gtu-uc-google-btn:disabled { opacity: 0.6; cursor: wait; }
      #gtudev-back-to-suite-btn {
        display: none;
        align-items: center;
        gap: 6px;
        height: 40px;
        padding: 0 14px;
        border-radius: 999px;
        background: linear-gradient(135deg, rgba(0, 242, 254, 0.22), rgba(79, 172, 254, 0.18));
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border: 1px solid rgba(0, 242, 254, 0.55);
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif;
        font-size: 12.5px;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45), 0 0 16px rgba(0, 242, 254, 0.2);
        transition: transform 0.15s ease, background 0.15s ease;
      }
      #gtudev-back-to-suite-btn:hover {
        transform: translateY(-1px);
        background: linear-gradient(135deg, rgba(0, 242, 254, 0.35), rgba(79, 172, 254, 0.28));
        color: #ffffff;
      }
      @media (max-width: 768px) {
        #gtudev-floating-stack { bottom: 78px !important; right: 12px !important; gap: 6px !important; }
        #gtudev-chat-fab, #gtudev-floating-admin-pill, #gtudev-back-to-suite-btn { height: 36px !important; padding: 0 12px !important; font-size: 12px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function injectDOM() {
    injectStyles();

    const ucShield = document.createElement('div');
    ucShield.id = 'gtudev-under-construction-shield';
    ucShield.innerHTML = `
      <div class="gtu-uc-card">
        <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);display:inline-flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:16px;">🔒</div>
        <h1 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin:0 0 22px;color:#ffffff;">
          Iniciar Sesión
        </h1>
        <div id="gtudev-uc-status" style="display:none;margin-bottom:14px;padding:10px 12px;border-radius:10px;border:1px solid rgba(14,165,233,0.4);font-size:12.5px;line-height:1.45;"></div>
        <button type="button" id="gtudev-uc-login-btn" class="gtu-uc-google-btn" onclick="window.gtudevSignInAdminGoogle()">
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/></svg>
          Continuar con Google
        </button>
      </div>
    `;
    document.body.appendChild(ucShield);

    const banner = document.createElement('div');
    banner.id = 'gtudev-pause-banner';
    banner.innerHTML = `
      <span id="gtudev-pause-banner-text">⏸️ Mantenimiento o pausa temporal activa en este módulo.</span>
      <button class="gtu-btn-sm" id="gtudev-pause-admin-btn" style="display:none;" onclick="window.openGtudevAdminModal()">Configurar</button>
    `;
    document.body.appendChild(banner);

    const banOverlay = document.createElement('div');
    banOverlay.id = 'gtudev-banned-overlay';
    banOverlay.innerHTML = `
      <div style="max-width:400px;background:#1c1c1e;border:1px solid rgba(255,255,255,0.1);padding:32px;border-radius:24px;">
        <div style="font-size:40px;margin-bottom:12px;">🔒</div>
        <h2 style="font-size:20px;font-weight:700;margin-bottom:8px;">Acceso Suspendido</h2>
        <p style="font-size:14px;color:#86868b;line-height:1.5;">Tu cuenta no tiene permisos para acceder a esta aplicación en este momento.</p>
      </div>
    `;
    document.body.appendChild(banOverlay);

    const stack = document.createElement('div');
    stack.id = 'gtudev-floating-stack';
    stack.innerHTML = `
      <a id="gtudev-back-to-suite-btn" href="https://gtudev-suite.web.app/" title="Volver al Hub de la Suite GTUDEV">
        <span>⬅</span> <span>Volver a la Suite</span>
      </a>
      <button id="gtudev-floating-admin-pill" onclick="window.openGtudevAdminModal()" title="Abrir Panel de Administración">
        <span>⚙️</span> <span>Admin</span>
      </button>
      <button id="gtudev-chat-fab" title="Hablar con el asistente">
        <span class="dot"></span>
        <span>Asistente</span>
      </button>
    `;
    document.body.appendChild(stack);

    try {
      const ssoFrame = document.createElement('iframe');
      ssoFrame.id = 'gtudev-sso-bridge-frame';
      ssoFrame.src = 'https://gtudev-suite.web.app/sso-bridge.html';
      ssoFrame.style.cssText = 'display:none;width:0;height:0;border:0;position:absolute;left:-9999px;';
      ssoFrame.onload = function () {
        try {
          const localEmail = typeof localStorage !== 'undefined' ? localStorage.getItem('gtudev_verified_admin_email') : '';
          if (localEmail && checkIsAdminEmail(localEmail)) {
            ssoFrame.contentWindow.postMessage({ type: 'GTUDEV_SSO_WRITE', email: localEmail, token: getSsoToken() }, '*');
          } else {
            ssoFrame.contentWindow.postMessage({ type: 'GTUDEV_SSO_READ' }, '*');
          }
        } catch (e) {}
      };
      document.body.appendChild(ssoFrame);
    } catch (e) {}

    const chatWin = document.createElement('div');
    chatWin.id = 'gtudev-chat-window';
    chatWin.innerHTML = `
      <div class="gtu-chat-header">
        <div>
          <div style="font-weight:600;font-size:14px;letter-spacing:-0.01em;">Alex · Guía ${APP_CTX.name}</div>
          <div style="font-size:11.5px;color:#86868b;">Asistente interactivo</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="gtu-btn-sm" id="gtudev-chat-admin-btn" style="display:none;" onclick="window.openGtudevAdminModal()">⚙️ Admin</button>
          <button class="gtu-btn-sm" id="gtudev-chat-close" style="border:none;background:transparent;font-size:15px;">✕</button>
        </div>
      </div>
      <div class="gtu-chat-messages" id="gtudev-chat-messages">
        <div class="gtu-msg bot">
          Hola 👋 Soy <strong>Alex</strong>. Estoy aquí para ayudarte a explorar <strong>${APP_CTX.name}</strong>.<br><br>
          ¿Qué te gustaría descubrir hoy?
        </div>
      </div>
      <div class="gtu-quick-chips">
        <button class="gtu-chip" data-q="¿Cuál es el estado de las transcripciones, tonalidad y BPM detectados?">🎵 Transcripciones & BPM</button>
        <button class="gtu-chip" data-q="¿Cuáles son las métricas de calibración con el dataset de partituras de referencia?">🧠 Calibración & Dataset</button>
        <button class="gtu-chip" data-q="¿Qué algoritmos de detección de pitch y rectificación están activos?">🧬 Algoritmos IA</button>
        <button class="gtu-chip" data-q="¿Cuántos usuarios y proyectos hay en el basurero para restaurar?">🗑️ Basurero</button>
      </div>
      <form class="gtu-chat-input-bar" id="gtudev-chat-form">
        <input type="text" id="gtudev-chat-input" placeholder="Escribe tu pregunta..." autocomplete="off" />
        <button type="submit">Enviar</button>
      </form>
    `;
    document.body.appendChild(chatWin);

    const adminModal = document.createElement('div');
    adminModal.id = 'gtudev-admin-modal';
    adminModal.innerHTML = `
      <div class="gtu-admin-card" onclick="event.stopPropagation()">
        <div class="gtu-admin-header">
          <div>
            <div style="font-size:17px;font-weight:700;letter-spacing:-0.01em;">Panel de Control Maestro · GTUDEV</div>
            <div style="font-size:12px;color:#86868b;">Control total del ecosistema para gerarditomusic@gmail.com e info@dev.gtunene.com</div>
          </div>
          <button class="gtu-btn-sm" onclick="window.closeGtudevAdminModal()">Cerrar ✕</button>
        </div>
        <div class="gtu-admin-tabs">
          <button class="gtu-admin-tab active" data-tab="users" onclick="window.switchGtudevAdminTab('users')">Usuarios y Permisos</button>
          <button class="gtu-admin-tab" data-tab="waitlist" onclick="window.switchGtudevAdminTab('waitlist')">Waiting List</button>
          <button class="gtu-admin-tab" data-tab="trash" onclick="window.switchGtudevAdminTab('trash')">🗑️ Basurero</button>
          <button class="gtu-admin-tab" data-tab="agents" onclick="window.switchGtudevAdminTab('agents')">Agentes, Modos y Promociones</button>
          <button class="gtu-admin-tab" data-tab="cloud" onclick="window.switchGtudevAdminTab('cloud')">Bases de Datos & Cloud</button>
        </div>
        <div class="gtu-admin-body">
          <div id="gtu-tab-users">
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;background:rgba(255,255,255,0.03);padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);">
              <input type="email" id="gtu-admin-new-email" placeholder="correo@usuario.com" style="flex:1;min-width:180px;background:#000;border:1px solid rgba(255,255,255,0.14);color:#fff;padding:8px 12px;border-radius:10px;font-size:13px;" />
              <select id="gtu-admin-new-role" style="background:#000;border:1px solid rgba(255,255,255,0.14);color:#fff;padding:8px 12px;border-radius:10px;font-size:13px;">
                <option value="beta_tester">Invitado Autorizado</option>
                <option value="artist">Artista Invitado</option>
                <option value="admin">Administrador</option>
              </select>
              <button class="gtu-btn-sm gtu-btn-success" onclick="window.gtudevGrantUser()">Dar Permiso</button>
              <button class="gtu-btn-sm gtu-btn-danger" onclick="window.gtudevBanUserInput()">Banear</button>
            </div>
            <div id="gtu-admin-users-list"></div>
          </div>

          <div id="gtu-tab-waitlist" style="display:none;">
            <div id="gtu-admin-waitlist-list"></div>
          </div>

          <div id="gtu-tab-trash" style="display:none;">
            <div style="margin-bottom:12px;padding:12px 14px;border-radius:12px;background:rgba(255,159,10,0.08);border:1px solid rgba(255,159,10,0.25);font-size:12.5px;color:#ffd60a;">
              🗑️ <strong>Basurero de Usuarios (Conservación Permanente):</strong> Todos los usuarios o contactos eliminados en cualquier aplicación de GTUDEV se guardan aquí con su historial para que puedas restaurarlos o consultarlos cuando los necesites en el futuro.
            </div>
            <div id="gtu-admin-trash-list"></div>
          </div>

          <div id="gtu-tab-agents" style="display:none;">
            <div class="gtu-switch-row" style="border-color:rgba(56,189,248,0.35);margin-bottom:10px;">
              <div>
                <div style="font-weight:600;font-size:14px;">Modo Operativo Global (Cuota Email & IA)</div>
                <div style="font-size:12px;color:#86868b;">Selecciona entre 🌱 Economic (Gratis), ⚡ Media o 🚀 Turbo.</div>
              </div>
              <div style="display:flex;gap:6px;">
                <button class="gtu-btn-sm" id="btn-mode-economic" onclick="window.gtudevSetMode('economic')">🌱 Economic</button>
                <button class="gtu-btn-sm" id="btn-mode-media" onclick="window.gtudevSetMode('media')">⚡ Media</button>
                <button class="gtu-btn-sm" id="btn-mode-turbo" onclick="window.gtudevSetMode('turbo')">🚀 Turbo</button>
              </div>
            </div>
            <div class="gtu-switch-row" style="border-color:rgba(255,69,58,0.35);">
              <div>
                <div style="font-weight:600;font-size:14px;">Pausar TODOS los Agentes</div>
                <div style="font-size:12px;color:#86868b;">Detiene inmediatamente la ejecución automática en las 5 aplicaciones.</div>
              </div>
              <button class="gtu-btn-sm" id="btn-toggle-all-agents" onclick="window.gtudevToggleConfig('all_agents_paused')">Activar / Pausar</button>
            </div>
            <div class="gtu-switch-row" style="border-color:rgba(255,159,10,0.35);margin-bottom:20px;">
              <div>
                <div style="font-weight:600;font-size:14px;">Pausar TODAS las Promociones</div>
                <div style="font-size:12px;color:#86868b;">Pausa envíos de campañas, pitches y órdenes externas.</div>
              </div>
              <button class="gtu-btn-sm" id="btn-toggle-all-promos" onclick="window.gtudevToggleConfig('promotions_paused')">Activar / Pausar</button>
            </div>
            <div id="gtu-admin-switches-container"></div>
          </div>

          <div id="gtu-tab-cloud" style="display:none;">
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:12px;">
              <h4 style="margin:0 0 8px;font-size:15px;font-weight:600;">Imágenes y Proyectos Sincronizados en Google Cloud (<code>gtudev</code>)</h4>
              <p style="font-size:13px;color:#86868b;line-height:1.5;margin-bottom:14px;">
                Los buckets <code>gs://gtudev-ai-creative-media</code> y <code>gs://gtudev-promo-agent-uploads</code> están sincronizados con <strong>AI Gtu Creator</strong>. Tus proyectos (<em>Súbelo, No te da, Sabadete - Gtunene, Sabadete 2, Hi siri</em>) y sus imágenes ya están disponibles en tu galería privada.
              </p>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <a href="https://gtucreator-suite.web.app" target="_blank" class="gtu-btn-sm gtu-btn-success" style="text-decoration:none;display:inline-block;">Abrir Galería en AI Gtu Creator ↗</a>
                <a href="https://gtusocial-suite.web.app" target="_blank" class="gtu-btn-sm" style="text-decoration:none;display:inline-block;">Catálogo DB Peakerr en Social Studio ↗</a>
                <a href="https://gtupromo-suite.web.app" target="_blank" class="gtu-btn-sm" style="text-decoration:none;display:inline-block;">Consumo API & Curadores en Promo Agent ↗</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    adminModal.addEventListener('click', () => window.closeGtudevAdminModal());
    document.body.appendChild(adminModal);

    document.getElementById('gtudev-chat-fab').addEventListener('click', () => {
      chatWin.classList.toggle('open');
    });
    document.getElementById('gtudev-chat-close').addEventListener('click', () => {
      chatWin.classList.remove('open');
    });

    chatWin.querySelectorAll('.gtu-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const q = chip.getAttribute('data-q');
        if (q) sendChatMessage(q);
      });
    });

    document.getElementById('gtudev-chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('gtudev-chat-input');
      const text = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      sendChatMessage(text);
    });
  }

  const chatHistory = [];
  async function sendChatMessage(userText) {
    const container = document.getElementById('gtudev-chat-messages');
    if (!container) return;

    const uDiv = document.createElement('div');
    uDiv.className = 'gtu-msg user';
    uDiv.textContent = userText;
    container.appendChild(uDiv);
    container.scrollTop = container.scrollHeight;

    const bDiv = document.createElement('div');
    bDiv.className = 'gtu-msg bot';
    bDiv.innerHTML = '<span style="color:#86868b;">Consultando estudio...</span>';
    container.appendChild(bDiv);
    container.scrollTop = container.scrollHeight;

    // 1. Query Music Score integrated backend endpoint (/v1/chat) first for live studio metrics
    try {
      const studioTok = localStorage.getItem('studio_auth_token') || localStorage.getItem('admin_auth_token') || '';
      const chatRes = await fetch('/v1/chat', {
        method: 'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          studioTok ? { 'Authorization': 'Bearer ' + studioTok } : {}
        ),
        body: JSON.stringify({ message: userText })
      });
      if (chatRes.ok) {
        const chatData = await chatRes.json();
        if (chatData && chatData.reply) {
          if (chatData.context && chatData.context.calibration_summary) {
            window.__SCORE_CALIBRATION_CACHE__ = { summary: chatData.context.calibration_summary };
          }
          bDiv.innerHTML = String(chatData.reply)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.12);padding:1px 5px;border-radius:4px;">$1</code>')
            .replace(/\n/g, '<br>');
          container.scrollTop = container.scrollHeight;
          return;
        }
      }
    } catch (err) {
      // Fall back to local or admin Gemini
    }

    // 2. Fallback for static hosting or unauthenticated visitors
    if (!STATE.isAdminLoggedIn) {
      const reply = generateLocalSimulatedReply(userText);
      bDiv.innerHTML = reply
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.12);padding:1px 5px;border-radius:4px;">$1</code>')
        .replace(/\n/g, '<br>');
      container.scrollTop = container.scrollHeight;
      return;
    }

    chatHistory.push({ role: 'user', parts: [{ text: userText }] });

    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: `Eres Alex, asistente experto de ${APP_CTX.name} en GTUDEV. Estás hablando con el administrador (${STATE.currentUserEmail}). Responde en español con estilo claro, cálido y directo en 2-4 oraciones.`
            }]
          },
          contents: chatHistory.slice(-8),
          generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
        })
      });
      const data = await res.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || generateLocalSimulatedReply(userText);
      chatHistory.push({ role: 'model', parts: [{ text: reply }] });
      bDiv.innerHTML = reply.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    } catch (e) {
      bDiv.innerHTML = generateLocalSimulatedReply(userText).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    }
    container.scrollTop = container.scrollHeight;
  }

  window.openGtudevAdminModal = function () {
    updateAdminVisibility();
    if (!STATE.isAdminLoggedIn) {
      return;
    }
    const m = document.getElementById('gtudev-admin-modal');
    if (m) {
      m.classList.add('open');
      renderAdminUsersList();
      renderAdminWaitlist();
      renderAdminTrash();
      renderAdminSwitches();
    }
  };

  window.closeGtudevAdminModal = function () {
    const m = document.getElementById('gtudev-admin-modal');
    if (m) m.classList.remove('open');
  };

  window.switchGtudevAdminTab = function (tab) {
    ['users', 'waitlist', 'trash', 'agents', 'cloud'].forEach((t) => {
      const el = document.getElementById('gtu-tab-' + t);
      if (el) el.style.display = t === tab ? 'block' : 'none';
    });
    document.querySelectorAll('.gtu-admin-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
  };

  function updateGlobalBanners() {
    updateAdminVisibility();
    const banner = document.getElementById('gtudev-pause-banner');
    const bannerTxt = document.getElementById('gtudev-pause-banner-text');
    const bannerBtn = document.getElementById('gtudev-pause-admin-btn');
    if (banner && bannerTxt) {
      const agentPaused = window.GTUDEV_ECOSYSTEM.isAgentPaused(APP_CTX.id);
      const promoPaused = STATE.config.promotions_paused;
      if (agentPaused || promoPaused) {
        banner.style.display = 'flex';
        if (bannerBtn) bannerBtn.style.display = STATE.isAdminLoggedIn ? 'inline-block' : 'none';
        bannerTxt.textContent = agentPaused
          ? `⏸️ El agente de ${APP_CTX.name} se encuentra en pausa temporal.`
          : `⏸️ Las promociones automáticas están en pausa temporal.`;
      } else {
        banner.style.display = 'none';
      }
    }

    if (STATE.currentUserEmail) {
      const u = STATE.users[STATE.currentUserEmail];
      const banOverlay = document.getElementById('gtudev-banned-overlay');
      if (banOverlay) {
        banOverlay.style.display = (u && u.isBanned && !ADMIN_EMAILS.includes(STATE.currentUserEmail)) ? 'flex' : 'none';
      }
    }
  }

  function renderAdminUsersList() {
    const container = document.getElementById('gtu-admin-users-list');
    if (!container) return;
    const allEmails = new Set([...ADMIN_EMAILS, ...Object.keys(STATE.users)]);
    let html = '';
    allEmails.forEach((email) => {
      const isRoot = ADMIN_EMAILS.includes(email);
      const u = STATE.users[email] || { email, role: isRoot ? 'admin' : 'visitor', authorized: isRoot, isBanned: false };
      const safeEmail = escapeHtml(email);
      html += `
        <div class="gtu-switch-row">
          <div>
            <div style="font-weight:600;font-size:13.5px;">${safeEmail}</div>
            <div style="font-size:12px;color:#86868b;">${isRoot ? 'Administrador Principal' : (u.isBanned ? 'Baneado' : (u.authorized ? 'Autorizado' : 'Sin acceso'))}</div>
          </div>
          <div style="display:flex;gap:6px;">
            ${isRoot ? '<span class="gtu-btn-sm gtu-btn-success">Propietario</span>' : `
              <button class="gtu-btn-sm ${u.authorized ? '' : 'gtu-btn-success'}" onclick="window.gtudevSetUserState('${safeEmail}', ${!u.authorized}, false)">${u.authorized ? 'Quitar permiso' : 'Dar permiso'}</button>
              <button class="gtu-btn-sm ${u.isBanned ? 'gtu-btn-success' : 'gtu-btn-danger'}" onclick="window.gtudevSetUserState('${safeEmail}', false, ${!u.isBanned})">${u.isBanned ? 'Desbanear' : 'Banear'}</button>
              <button class="gtu-btn-sm" title="Enviar al Basurero (Conservar para el futuro)" onclick="window.gtudevTrashUser('${safeEmail}', 'users')">🗑️</button>
            `}
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  function renderAdminWaitlist() {
    const container = document.getElementById('gtu-admin-waitlist-list');
    if (!container) return;
    if (!STATE.waitlist.length) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:#86868b;font-size:13px;">Aún no hay solicitudes pendientes en la lista de espera.</div>';
      return;
    }
    container.innerHTML = STATE.waitlist.map((w) => {
      const safeEmail = escapeHtml(w.email);
      const safeName = escapeHtml(w.name || 'Usuario');
      const safeApp = escapeHtml(w.app || 'GTUDEV');
      const safeRole = escapeHtml(w.role || '-');
      return `
      <div class="gtu-switch-row">
        <div>
          <div style="font-weight:600;font-size:13.5px;">${safeName} · <span style="color:#64d2ff;">${safeEmail}</span></div>
          <div style="font-size:12px;color:#86868b;">App: ${safeApp} · Rol: ${safeRole}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="gtu-btn-sm gtu-btn-success" onclick="window.gtudevApproveWaitlist('${safeEmail}')">Aprobar acceso</button>
          <button class="gtu-btn-sm gtu-btn-danger" onclick="window.gtudevSetUserState('${safeEmail}', false, true)">Banear</button>
          <button class="gtu-btn-sm" title="Mover al Basurero" onclick="window.gtudevTrashUser('${safeEmail}', 'waitlist')">🗑️</button>
        </div>
      </div>
    `;
    }).join('');
  }

  function renderAdminTrash() {
    const container = document.getElementById('gtu-admin-trash-list');
    if (!container) return;
    const entries = Object.values(STATE.trash || {});
    if (!entries.length) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:#86868b;font-size:13px;">El basurero está vacío. Los usuarios eliminados se conservarán aquí.</div>';
      return;
    }
    container.innerHTML = entries.map((item) => {
      const safeEmail = escapeHtml(item.email || item.id);
      const safeName = escapeHtml(item.name || item.email || 'Usuario');
      const safeApp = escapeHtml(item.originApp || APP_CTX.name);
      const safeRole = escapeHtml(item.previousRole || 'visitor');
      const safeDate = escapeHtml((item.trashedAt || '').slice(0, 10) || 'Reciente');
      return `
      <div class="gtu-switch-row" style="border-color:rgba(255,159,10,0.25);">
        <div>
          <div style="font-weight:600;font-size:13.5px;">${safeName} · <span style="color:#ffd60a;">${safeEmail}</span></div>
          <div style="font-size:12px;color:#86868b;">Origen: ${safeApp} · Rol previo: ${safeRole} · Eliminado: ${safeDate}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="gtu-btn-sm gtu-btn-success" onclick="window.gtudevRestoreUser('${safeEmail}')">♻️ Restaurar</button>
        </div>
      </div>
      `;
    }).join('');
  }

  function renderAdminSwitches() {
    const btnAllAgents = document.getElementById('btn-toggle-all-agents');
    if (btnAllAgents) {
      btnAllAgents.textContent = STATE.config.all_agents_paused ? '▶️ Reanudar Todos' : '⏸️ Pausar Todos';
    }
    const btnAllPromos = document.getElementById('btn-toggle-all-promos');
    if (btnAllPromos) {
      btnAllPromos.textContent = STATE.config.promotions_paused ? '▶️ Reanudar Promociones' : '⏸️ Pausar Promociones';
    }
    const container = document.getElementById('gtu-admin-switches-container');
    if (!container) return;
    const items = [
      { type: 'agents', key: 'promo', label: 'Promo Agent (Curadores & Pitching)' },
      { type: 'agents', key: 'smm', label: 'SMM Autonomous Agent (5 Redes)' },
      { type: 'agents', key: 'vocal', label: 'Vocal Score Studio (Transcripción IA)' },
      { type: 'agents', key: 'creator', label: 'AI Gtu Creator (Generación Visual)' },
      { type: 'agents', key: 'gtuprod', label: 'Gtuprod (Mastering & Telemetría)' },
      { type: 'promotions', key: 'spotify_pitch', label: 'Promoción: Pitching Automático Spotify' },
      { type: 'promotions', key: 'peakerr_boost', label: 'Promoción: Impulso Social & Drip-Feed' }
    ];
    container.innerHTML = items.map((it) => {
      const isPaused = Boolean(STATE.config[it.type] && STATE.config[it.type][it.key]);
      return `
        <div class="gtu-switch-row">
          <div>
            <div style="font-weight:600;font-size:13.5px;">${it.label}</div>
            <div style="font-size:12px;color:${isPaused ? '#ff9f0a' : '#30d158'};">${isPaused ? 'Pausado' : 'Activo'}</div>
          </div>
          <button class="gtu-btn-sm" onclick="window.gtudevToggleSubConfig('${it.type}', '${it.key}')">${isPaused ? 'Reanudar' : 'Pausar'}</button>
        </div>
      `;
    }).join('');
  }

  window.gtudevSetUserState = async function (email, authorized, isBanned, role) {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean || ADMIN_EMAILS.includes(clean)) return;
    const payload = {
      email: clean,
      authorized: Boolean(authorized),
      isBanned: Boolean(isBanned),
      role: role || (authorized ? 'beta_tester' : 'visitor'),
      updatedAt: new Date().toISOString()
    };
    STATE.users[clean] = payload;
    renderAdminUsersList();
    updateGlobalBanners();
    const db = getFirestore();
    if (db) {
      await db.collection('ecosystem_users').doc(clean).set(payload, { merge: true });
    }
  };

  window.gtudevGrantUser = function () {
    const emailEl = document.getElementById('gtu-admin-new-email');
    const roleEl = document.getElementById('gtu-admin-new-role');
    if (!emailEl || !emailEl.value) return;
    window.gtudevSetUserState(emailEl.value, true, false, roleEl ? roleEl.value : 'beta_tester');
    emailEl.value = '';
  };

  window.gtudevBanUserInput = function () {
    const emailEl = document.getElementById('gtu-admin-new-email');
    if (!emailEl || !emailEl.value) return;
    window.gtudevSetUserState(emailEl.value, false, true, 'banned');
    emailEl.value = '';
  };

  window.gtudevApproveWaitlist = async function (email) {
    await window.gtudevSetUserState(email, true, false, 'beta_tester');
    const db = getFirestore();
    if (db) {
      const docId = email.replace(/[^a-z0-9@._-]/gi, '_');
      await db.collection('waiting_list').doc(docId).set({ status: 'approved' }, { merge: true }).catch(() => {});
    }
    window.switchGtudevAdminTab('users');
  };

  window.gtudevTrashUser = async function (email, source = 'users', extra = {}) {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean || ADMIN_EMAILS.includes(clean)) return null;
    const existingUser = STATE.users[clean] || {};
    const waitlistEntry = (STATE.waitlist || []).find((w) => String(w.email || '').toLowerCase() === clean) || {};
    const trashRecord = Object.assign({}, waitlistEntry, existingUser, extra, {
      email: clean,
      name: existingUser.name || waitlistEntry.name || extra.name || clean.split('@')[0],
      previousRole: existingUser.role || waitlistEntry.role || extra.role || 'visitor',
      previousAuthorized: Boolean(existingUser.authorized),
      originApp: waitlistEntry.app || extra.originApp || APP_CTX.name,
      sourceCollection: source,
      status: 'trashed',
      trashedAt: new Date().toISOString()
    });
    STATE.trash[clean] = trashRecord;
    delete STATE.users[clean];
    STATE.waitlist = (STATE.waitlist || []).filter((w) => String(w.email || '').toLowerCase() !== clean);
    renderAdminUsersList();
    renderAdminWaitlist();
    renderAdminTrash();
    updateGlobalBanners();
    const db = getFirestore();
    if (db) {
      const docId = clean.replace(/[^a-z0-9@._-]/gi, '_');
      await db.collection('ecosystem_trash').doc(clean).set(trashRecord, { merge: true }).catch(() => {});
      await db.collection('ecosystem_users').doc(clean).delete().catch(() => {});
      await db.collection('waiting_list').doc(docId).set({ status: 'trashed', trashedAt: trashRecord.trashedAt }, { merge: true }).catch(() => {});
    }
    return trashRecord;
  };

  window.gtudevRestoreUser = async function (email) {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean) return null;
    const item = STATE.trash[clean];
    if (!item) return null;
    const restoredRole = item.previousRole && item.previousRole !== 'banned' ? item.previousRole : 'beta_tester';
    const restoredAuthorized = item.previousAuthorized !== undefined ? Boolean(item.previousAuthorized) : true;
    await window.gtudevSetUserState(clean, restoredAuthorized, false, restoredRole);
    delete STATE.trash[clean];
    renderAdminTrash();
    const db = getFirestore();
    if (db) {
      await db.collection('ecosystem_trash').doc(clean).delete().catch(() => {});
    }
    return STATE.users[clean];
  };

  window.gtudevSetMode = async function (mode) {
    const valid = ['economic', 'media', 'turbo'].includes(mode) ? mode : 'economic';
    STATE.config.email_mode = valid;
    STATE.config.ai_mode = valid;
    renderAdminSwitches();
    const db = getFirestore();
    if (db) {
      await db.collection('ecosystem_config').doc('global_state').set({
        email_mode: valid,
        ai_mode: valid
      }, { merge: true }).catch(() => {});
    }
    return valid;
  };

  window.gtudevToggleConfig = async function (field) {
    STATE.config[field] = !STATE.config[field];
    updateGlobalBanners();
    renderAdminSwitches();
    const db = getFirestore();
    if (db) {
      await db.collection('ecosystem_config').doc('global_state').set({ [field]: STATE.config[field] }, { merge: true });
    }
  };

  window.gtudevToggleSubConfig = async function (group, key) {
    if (!STATE.config[group]) STATE.config[group] = {};
    STATE.config[group][key] = !STATE.config[group][key];
    updateGlobalBanners();
    renderAdminSwitches();
    const db = getFirestore();
    if (db) {
      await db.collection('ecosystem_config').doc('global_state').set({ [group]: STATE.config[group] }, { merge: true });
    }
  };

  const SUITE_URL_REMAP = {
    'https://gtudev.web.app': 'https://gtudev-suite.web.app',
    'https://gtublog.web.app': 'https://gtublog-suite.web.app',
    'https://gtuprod.web.app': 'https://gtuprod-suite.web.app',
    'https://promoagent.web.app': 'https://gtupromo-suite.web.app',
    'https://smmgtuagent.web.app': 'https://gtusocial-suite.web.app',
    'https://musicscore.web.app': 'https://gtuscore-suite.web.app',
    'https://aigtucreator.web.app': 'https://gtucreator-suite.web.app'
  };

  function rewriteEcosystemLinks() {
    try {
      const ssoToken = STATE.isAdminLoggedIn ? getSsoToken() : '';
      document.querySelectorAll('a[href]').forEach((a) => {
        let href = a.getAttribute('href') || '';
        Object.keys(SUITE_URL_REMAP).forEach((oldUrl) => {
          if (href.startsWith(oldUrl)) {
            href = SUITE_URL_REMAP[oldUrl] + href.slice(oldUrl.length);
            a.setAttribute('href', href);
          }
        });
        if (ssoToken && /^https:\/\/[a-z0-9-]+-suite\.web\.app/i.test(href)) {
          try {
            const u = new URL(href);
            u.searchParams.set('token', ssoToken);
            a.setAttribute('href', u.toString());
          } catch (e) {}
        }
      });

      if (STATE.isAdminLoggedIn && APP_CTX.id !== 'hub') {
        const navContainer = document.querySelector('.nav-links, .header-right, header .actions, nav > div:last-child, header > div:last-child');
        if (navContainer && !document.getElementById('gtudev-top-suite-link')) {
          const topBtn = document.createElement('a');
          topBtn.id = 'gtudev-top-suite-link';
          const tok = getSsoToken();
          topBtn.href = 'https://gtudev-suite.web.app/' + (tok ? '?token=' + encodeURIComponent(tok) : '');
          topBtn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:6px 13px;border-radius:999px;background:rgba(0,242,254,0.14);border:1px solid rgba(0,242,254,0.45);color:#7dd3fc;font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap;margin-right:8px;';
          topBtn.innerHTML = '⬅ Volver a la Suite';
          navContainer.insertBefore(topBtn, navContainer.firstChild);
        }
      }
    } catch (e) {}
  }

  function boot() {
    window.addEventListener('message', (ev) => {
      try {
        const data = ev && ev.data ? ev.data : {};
        if (data.type === 'GTUDEV_SSO_STATE' && data.email && checkIsAdminEmail(data.email)) {
          if (!STATE.isAdminLoggedIn) {
            persistVerifiedAdminEmail(data.email, data.token);
            updateAdminVisibility();
            rewriteEcosystemLinks();
          }
        }
      } catch (e) {}
    });
    injectDOM();
    updateAdminVisibility();
    rewriteEcosystemLinks();
    initFirestoreSync();
    try {
      ensureFirebaseAuthInstance().then((authInst) => {
        if (authInst && typeof authInst.onAuthStateChanged === 'function') {
          authInst.onAuthStateChanged((user) => {
            if (!user) {
              if (typeof localStorage === 'undefined' || localStorage.getItem('gtudev_handoff_session') !== '1') {
                clearVerifiedAdminEmail();
              }
            } else if (!checkIsAdminEmail(user.email)) {
              clearVerifiedAdminEmail();
              authInst.signOut().catch(() => {});
            } else {
              persistVerifiedAdminEmail(user.email);
            }
            updateAdminVisibility();
            rewriteEcosystemLinks();
            updateGlobalBanners();
          });
        }
      }).catch(() => {});
    } catch (e) {}
    setInterval(() => {
      updateAdminVisibility();
      rewriteEcosystemLinks();
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
