import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGtublogServer } from '../server.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

test('1. gtublog project structure has Rust Cargo.toml, Axum main.rs, and multi-stage Alpine Dockerfile', () => {
  const cargo = fs.readFileSync(path.join(ROOT, 'Cargo.toml'), 'utf8');
  const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
  const mainRs = fs.readFileSync(path.join(ROOT, 'src', 'main.rs'), 'utf8');

  assert.match(cargo, /name = "gtublog"/);
  assert.match(cargo, /axum = .*0\.7/);
  assert.match(dockerfile, /FROM rust:.*alpine AS builder/);
  assert.match(dockerfile, /FROM alpine:3\.20/);
  assert.match(mainRs, /\/api\/posts/);
  assert.match(mainRs, /\/api\/chat/);
  assert.match(mainRs, /\/api\/trash\/restore/);
});

test('2. gtublog Firebase config belongs to project gtudev with site gtublog and Cloud Run rewrite', () => {
  const rc = JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8'));
  const fb = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));

  assert.equal(rc.projects.default, 'gtudev');
  assert.equal(fb.hosting.site, 'gtublog');
  assert.equal(fb.hosting.rewrites[0].run.serviceId, 'gtublog');
});

test('3. gtublog seed posts and frontend include AI Chatbot, 3 modes, and Soft-Delete Trash Bin', () => {
  const posts = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'posts.json'), 'utf8'));
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

  assert.ok(posts.length >= 6, 'Should have at least 6 initial technical/music blog posts');
  assert.ok(posts.some(p => p.slug.includes('rust-axum-cloud-run')));
  assert.match(html, /GTUBLOG/);
  assert.match(html, /Basurero/);
  assert.match(html, /gtudev-ecosystem\.js/);
});

test('4. Live HTTP Server endpoints: /healthz, /api/posts, /api/trash, /api/trash/restore, /api/mode, /api/chat', async () => {
  const server = createGtublogServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Healthz
    const hRes = await fetch(`${baseUrl}/healthz`);
    assert.equal(hRes.status, 200);
    const hData = await hRes.json();
    assert.equal(hData.service, 'gtublog');
    assert.equal(hData.runtime, 'rust-axum-alpine');
    assert.equal(hData.active_posts, 6);

    // 2. Create Post
    const createRes = await fetch(`${baseUrl}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Post Rust Cloud Run',
        content: 'Contenido de prueba en Rust.',
        category: 'Arquitectura & Cloud'
      })
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    const postId = created.post.id;

    // 3. Soft-Delete Post to Trash Bin (Basurero)
    const trashRes = await fetch(`${baseUrl}/api/posts/${encodeURIComponent(postId)}/trash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Prueba de basurero' })
    });
    assert.equal(trashRes.status, 200);

    const listTrash = await (await fetch(`${baseUrl}/api/trash`)).json();
    assert.equal(listTrash.count, 1);
    assert.equal(listTrash.trash[0].id, postId);

    // 4. Restore Post from Trash Bin
    const restoreRes = await fetch(`${baseUrl}/api/trash/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: postId })
    });
    assert.equal(restoreRes.status, 200);

    // 5. Switch Quota Mode & Ask AI Chatbot
    const modeRes = await fetch(`${baseUrl}/api/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'turbo' })
    });
    const modeData = await modeRes.json();
    assert.equal(modeData.mode, 'turbo');
    assert.equal(modeData.ai_daily_limit, 1000);

    const chatRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '¿Por qué usamos Rust y Axum en Cloud Run?' })
    });
    const chatData = await chatRes.json();
    assert.equal(chatData.ok, true);
    assert.match(chatData.reply, /Rust/);

    // 6. WordPress-Rust Media Files (/api/files) & WooCommerce Store (/api/products)
    const fileRes = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_name: 'Sabadete_Preset_Master.zip',
        category: 'Producción & Mastering',
        price_usd: 0
      })
    });
    assert.equal(fileRes.status, 201);

    const prodRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Beat Exclusivo + Stems WAV 24-Bit',
        category: 'Beats & Instrumentales',
        price_usd: 49.99,
        sale_price_usd: 29.99
      })
    });
    assert.equal(prodRes.status, 201);
    const prodsList = await (await fetch(`${baseUrl}/api/products`)).json();
    assert.ok(prodsList.products.some(p => p.title.includes('Beat Exclusivo')));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
