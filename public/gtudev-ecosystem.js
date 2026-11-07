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

  function detectAppContext() {
    const host = (window.location.hostname || '').toLowerCase();
    const title = (document.title || '').toLowerCase();
    if (host.includes('promoagent') || title.includes('promo')) {
      return {
        id: 'promo',
        name: 'Promo Agent',
        tagline: 'Curaduría y pitching inteligente para lanzamientos musicales.',
        features: 'Análisis acústico, pitching editorial a curadores de Spotify y salas de escucha privadas.'
      };
    }
    if (host.includes('smmgtuagent') || title.includes('smm')) {
      return {
        id: 'smm',
        name: 'SMM Autonomous',
        tagline: 'Crecimiento orgánico y gestión multicanal para artistas.',
        features: 'Sincronización con Instagram, TikTok, YouTube, Facebook y Threads, curva armónica y auditoría de audiencia.'
      };
    }
    if (host.includes('musicscore') || title.includes('vocal') || title.includes('score')) {
      return {
        id: 'vocal',
        name: 'Vocal Score Studio',
        tagline: 'Separación de stems y transcripción vocal de precisión.',
        features: 'Aislamiento vocal, transcripción automática a MusicXML y partituras PDF listas para estudio.'
      };
    }
    if (host.includes('aigtucreator') || title.includes('creative') || title.includes('creator')) {
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
        tagline: 'Ingeniería acústica, telemetría LUFS, mastering y reproductor multi-playlist.',
        features: 'Medición de sonoridad en tiempo real, cadena DSP vocal, playlists continuas (Demos, Canciones Terminadas, Por Publicar y Para Publicar) y diagnóstico técnico.'
      };
    }
    if (host.includes('gtublog') || title.includes('gtublog')) {
      return {
        id: 'gtublog',
        name: 'GTUBLOG',
        tagline: 'Blog editorial de ingeniería IA, música y arquitectura Rust Zero Cold Start.',
        features: 'Backend ultraligero en Rust (Axum + Alpine Docker) en Cloud Run, artículos técnicos sincronizados con GTUDEV, redacción con Gemini 2.5 y Basurero CMS.'
      };
    }
    return {
      id: 'hub',
      name: 'GTUDEV',
      tagline: 'Suite creativa e inteligencia artificial para la música.',
      features: 'Seis herramientas diseñadas para potenciar la producción, el blog editorial, el arte visual y el lanzamiento de música.'
    };
  }

  const APP_CTX = detectAppContext();

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
    if (q.includes('basurero') || q.includes('papelera') || q.includes('trash') || q.includes('eliminado')) {
      const trashCount = Object.keys(STATE.trash || {}).length;
      return `El **Basurero del Ecosistema (Trash Bin)** guarda de forma segura los usuarios y contactos eliminados para que nunca pierdas información y puedas restaurarlos en el futuro. Actualmente hay **${trashCount}** registro(s) en el basurero.`;
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

  function updateAdminVisibility() {
    let email = null;
    try {
      if (window.firebase && window.firebase.auth) {
        const u = window.firebase.auth().currentUser;
        if (u && u.email) email = u.email.trim().toLowerCase();
      }
    } catch (e) {}

    STATE.currentUserEmail = email;
    STATE.isAdminLoggedIn = checkIsAdminEmail(email);

    const adminBtn = document.getElementById('gtudev-chat-admin-btn');
    const floatingAdminPill = document.getElementById('gtudev-floating-admin-pill');
    if (adminBtn) {
      adminBtn.style.display = STATE.isAdminLoggedIn ? 'inline-flex' : 'none';
    }
    if (floatingAdminPill) {
      floatingAdminPill.style.display = STATE.isAdminLoggedIn ? 'inline-flex' : 'none';
    }
  }

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
        bottom: 24px;
        right: 24px;
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif;
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
    `;
    document.head.appendChild(style);
  }

  function injectDOM() {
    injectStyles();

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
      <button id="gtudev-floating-admin-pill" onclick="window.openGtudevAdminModal()" title="Abrir Panel de Administración">
        <span>⚙️</span> <span>Admin</span>
      </button>
      <button id="gtudev-chat-fab" title="Hablar con el asistente">
        <span class="dot"></span>
        <span>Asistente</span>
      </button>
    `;
    document.body.appendChild(stack);

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
        <button class="gtu-chip" data-q="¿Cuál es el estado en vivo y resumen de usuarios?">📊 Estado en vivo</button>
        <button class="gtu-chip" data-q="¿Qué hace esta aplicación y cómo funciona?">✨ ¿Cómo funciona?</button>
        <button class="gtu-chip" data-q="¿Cómo funcionan los 3 modos de cuota API (Economic, Media, Turbo)?">⚡ Cuotas & API</button>
        <button class="gtu-chip" data-q="¿Cuántos usuarios hay en el basurero?">🗑️ Basurero</button>
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
                <a href="https://aigtucreator.web.app" target="_blank" class="gtu-btn-sm gtu-btn-success" style="text-decoration:none;display:inline-block;">Abrir Galería en AI Gtu Creator ↗</a>
                <a href="https://smmgtuagent.web.app" target="_blank" class="gtu-btn-sm" style="text-decoration:none;display:inline-block;">Catálogo DB Peakerr en SMM Agent ↗</a>
                <a href="https://promoagent.web.app" target="_blank" class="gtu-btn-sm" style="text-decoration:none;display:inline-block;">Consumo API & Curadores en Promo Agent ↗</a>
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

    // STRICT CHECK: External / unauthenticated visitors DO NOT call the API!
    if (!STATE.isAdminLoggedIn) {
      const bDiv = document.createElement('div');
      bDiv.className = 'gtu-msg bot';
      const reply = generateLocalSimulatedReply(userText);
      bDiv.innerHTML = reply.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
      container.appendChild(bDiv);
      container.scrollTop = container.scrollHeight;
      return;
    }

    const bDiv = document.createElement('div');
    bDiv.className = 'gtu-msg bot';
    bDiv.innerHTML = '<span style="color:#86868b;">Escribiendo...</span>';
    container.appendChild(bDiv);
    container.scrollTop = container.scrollHeight;

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
      bDiv.innerHTML = generateLocalSimulatedReply(userText).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
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
      { type: 'agents', key: 'gtuprod', label: 'Gtuprod (Mastering, Playlists & Telemetría)' },
      { type: 'agents', key: 'gtublog', label: 'GTUBLOG (CMS Rust Cloud Run & IA Editorial)' },
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

  function boot() {
    injectDOM();
    initFirestoreSync();
    updateAdminVisibility();
    try {
      if (window.firebase && window.firebase.auth) {
        window.firebase.auth().onAuthStateChanged(() => {
          updateAdminVisibility();
          updateGlobalBanners();
        });
      }
    } catch (e) {}
    setInterval(updateAdminVisibility, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
