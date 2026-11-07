/**
 * GTUBLOG Local / Edge HTTP Mirror Server (Node.js)
 * Mirrors the exact REST API contract of src/main.rs (Rust Axum) for local development & integration testing
 * when MSVC link.exe is not present on Windows, while Cloud Run builds the static Rust Alpine binary via Dockerfile.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createGtublogServer() {
  const postsPath = path.join(__dirname, 'public', 'posts.json');
  const initialPosts = fs.existsSync(postsPath)
    ? JSON.parse(fs.readFileSync(postsPath, 'utf8'))
    : [];

  const state = {
    posts: structuredClone(initialPosts),
    trash: [],
    users: [
      { email: 'gerarditomusic@gmail.com', name: 'Gerardo (SuperAdmin)', role: 'admin', status: 'active' },
      { email: 'info@dev.gtunene.com', name: 'GTUDEV Admin', role: 'admin', status: 'active' },
      { email: 'lector@gtudev.com', name: 'Productor Invitado', role: 'subscriber', status: 'active' }
    ],
    usage: {
      mode: 'economic',
      ai_calls_today: 0,
      ai_daily_limit: 25,
      tokens_used_today: 0,
      estimated_cost_usd: 0.0,
      cold_start_ms: 1.4
    }
  };

  function sendJson(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(body);
  }

  function readBody(req) {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
    });
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      return sendJson(res, 200, { ok: true });
    }

    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;

    if (req.method === 'GET' && pathname === '/healthz') {
      return sendJson(res, 200, {
        ok: true,
        service: 'gtublog',
        runtime: 'rust-axum-alpine',
        cold_start_ms: state.usage.cold_start_ms,
        mode: state.usage.mode,
        active_posts: state.posts.length,
        trashed_items: state.trash.length
      });
    }

    if (req.method === 'GET' && pathname === '/api/posts') {
      const cat = url.searchParams.get('category');
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const filtered = state.posts.filter((p) => {
        const matchCat = !cat || cat === 'all' || (p.category || '').toLowerCase() === cat.toLowerCase();
        const matchQ = !q ||
          (p.title || '').toLowerCase().includes(q) ||
          (p.excerpt || '').toLowerCase().includes(q) ||
          (p.content || '').toLowerCase().includes(q);
        return matchCat && matchQ;
      });
      return sendJson(res, 200, { ok: true, count: filtered.length, posts: filtered });
    }

    if (req.method === 'POST' && pathname === '/api/posts') {
      const body = await readBody(req);
      const title = (body.title || '').trim() || 'Nuevo Artículo GTUBLOG';
      const slug = body.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const post = {
        id: `post-${Date.now()}`,
        slug,
        title,
        excerpt: body.excerpt || String(body.content || '').slice(0, 140),
        content: body.content || '',
        category: body.category || 'Ingeniería & IA',
        tags: Array.isArray(body.tags) && body.tags.length ? body.tags : ['gtudev', 'rust', 'ia'],
        author: body.author || 'GTUDEV Engineering',
        read_time_minutes: body.read_time_minutes || 4,
        published_at: new Date().toISOString(),
        featured_on_gtudev: body.featured_on_gtudev !== false,
        cover_image: body.cover_image || 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80'
      };
      state.posts.unshift(post);
      return sendJson(res, 201, { ok: true, post });
    }

    const trashPostMatch = pathname.match(/^\/api\/posts\/([^/]+)\/trash$/);
    if (req.method === 'POST' && trashPostMatch) {
      const slugOrId = decodeURIComponent(trashPostMatch[1]);
      const body = await readBody(req);
      const idx = state.posts.findIndex((p) => p.id === slugOrId || p.slug === slugOrId);
      if (idx === -1) {
        return sendJson(res, 404, { ok: false, error: 'Post no encontrado' });
      }
      const [removed] = state.posts.splice(idx, 1);
      const trashed = {
        id: removed.id,
        item_type: 'post',
        title_or_email: removed.title,
        trashed_at: new Date().toISOString(),
        reason: body.reason || 'Movido al basurero desde el panel admin',
        payload: removed
      };
      state.trash.unshift(trashed);
      return sendJson(res, 200, { ok: true, message: 'Post enviado al basurero (recuperable)', trashed });
    }

    const getPostMatch = pathname.match(/^\/api\/posts\/([^/]+)$/);
    if (req.method === 'GET' && getPostMatch) {
      const slugOrId = decodeURIComponent(getPostMatch[1]);
      const found = state.posts.find((p) => p.id === slugOrId || p.slug === slugOrId);
      if (!found) return sendJson(res, 404, { ok: false, error: 'Artículo no encontrado' });
      return sendJson(res, 200, { ok: true, post: found });
    }

    if (req.method === 'GET' && pathname === '/api/trash') {
      return sendJson(res, 200, { ok: true, count: state.trash.length, trash: state.trash });
    }

    if (req.method === 'POST' && pathname === '/api/trash/restore') {
      const body = await readBody(req);
      const idx = state.trash.findIndex((t) => t.id === body.id);
      if (idx === -1) return sendJson(res, 404, { ok: false, error: 'Elemento no encontrado en el basurero' });
      const [item] = state.trash.splice(idx, 1);
      if (item.item_type === 'post') {
        state.posts.unshift(item.payload);
      } else if (item.item_type === 'user') {
        const u = { ...item.payload, status: 'active' };
        state.users.push(u);
      }
      return sendJson(res, 200, { ok: true, restored: item });
    }

    if (req.method === 'GET' && pathname === '/api/users') {
      return sendJson(res, 200, { ok: true, users: state.users });
    }

    const trashUserMatch = pathname.match(/^\/api\/users\/([^/]+)\/trash$/);
    if (req.method === 'POST' && trashUserMatch) {
      const email = decodeURIComponent(trashUserMatch[1]).toLowerCase();
      if (email === 'gerarditomusic@gmail.com' || email === 'info@dev.gtunene.com') {
        return sendJson(res, 403, { ok: false, error: 'No se puede enviar un SuperAdmin al basurero' });
      }
      const body = await readBody(req);
      const idx = state.users.findIndex((u) => u.email.toLowerCase() === email);
      if (idx === -1) return sendJson(res, 404, { ok: false, error: 'Usuario no encontrado' });
      const [removed] = state.users.splice(idx, 1);
      const trashed = {
        id: removed.email,
        item_type: 'user',
        title_or_email: removed.email,
        trashed_at: new Date().toISOString(),
        reason: body.reason || 'Usuario enviado al basurero para uso futuro',
        payload: removed
      };
      state.trash.unshift(trashed);
      return sendJson(res, 200, { ok: true, trashed });
    }

    if (req.method === 'GET' && pathname === '/api/usage') {
      return sendJson(res, 200, { ok: true, usage: state.usage });
    }

    if (req.method === 'POST' && pathname === '/api/mode') {
      const body = await readBody(req);
      const mode = ['economic', 'media', 'turbo'].includes(body.mode) ? body.mode : 'economic';
      const limits = { economic: 25, media: 150, turbo: 1000 };
      state.usage.mode = mode;
      state.usage.ai_daily_limit = limits[mode];
      return sendJson(res, 200, { ok: true, mode, ai_daily_limit: limits[mode] });
    }

    if (req.method === 'POST' && pathname === '/api/chat') {
      const body = await readBody(req);
      const msg = (body.message || '').trim();
      state.usage.ai_calls_today += 1;
      state.usage.tokens_used_today += 240;
      state.usage.estimated_cost_usd = Number((state.usage.tokens_used_today * 0.00000015).toFixed(6));

      const q = msg.toLowerCase();
      let reply = `🤖 **Asistente GTUBLOG** (Modo \`${state.usage.mode}\` · Artículos activos: **${state.posts.length}** · En basurero: **${state.trash.length}**): Todos los artículos están sincronizados con GTUDEV Hub.`;
      if (q.includes('rust') || q.includes('cold start') || q.includes('axum')) {
        reply = '🦀 **Arquitectura Cero Cold Start**: `gtublog` está compilado en **Rust (Axum)** dentro de un contenedor multi-stage con **Alpine Linux** (~18 MB), despertando en menos de 5 ms en Google Cloud Run.';
      } else if (q.includes('gtuprod') || q.includes('playlist') || q.includes('demos')) {
        reply = '🎧 **Player Multi-Playlist en Gtuprod**: Permite organizar y escuchar una detrás de otra tus **Demos**, **Canciones Terminadas**, **Por Publicar** y **Para Publicar**.';
      }
      return sendJson(res, 200, { ok: true, source: 'rust-local-rag', reply, usage: state.usage });
    }

    if (req.method === 'POST' && pathname === '/api/ai/generate-post') {
      const body = await readBody(req);
      const topic = (body.topic || 'Innovación Musical e IA en GTUDEV').trim();
      const category = body.category || 'IA & Audio';
      return sendJson(res, 200, {
        ok: true,
        title: `${topic} · Guía Técnica GTUDEV`,
        category,
        excerpt: `Análisis sobre ${topic} integrado con la arquitectura sin cold start de GTUBLOG y la suite musical GTUDEV.`,
        content: `## ${topic}\n\nEste artículo técnico explora cómo **GTUDEV** aborda **${topic}** combinando microservicios ultraligeros en **Rust (Axum)** sobre Cloud Run y modelos **Gemini 2.5 Flash**.`
      });
    }

    // Serve static files from public/
    const filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mime = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.css': 'text/css; charset=utf-8'
      }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      return res.end(fs.readFileSync(filePath));
    }

    return sendJson(res, 404, { ok: false, error: 'Not found' });
  });

  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  const srv = createGtublogServer();
  srv.listen(port, () => {
    console.log(`🦀 GTUBLOG Server listening on http://127.0.0.1:${port}`);
  });
}
