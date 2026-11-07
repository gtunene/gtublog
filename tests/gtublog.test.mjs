import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

test('1. gtublog project structure has Rust Cargo.toml, Axum main.rs, and multi-stage Alpine Dockerfile', () => {
  const cargo = fs.readFileSync(path.join(ROOT, 'Cargo.toml'), 'utf8');
  const dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
  const mainRs = fs.readFileSync(path.join(ROOT, 'src', 'main.rs'), 'utf8');

  assert.match(cargo, /name = "gtublog"/);
  assert.match(cargo, /axum = .*0\.7/);
  assert.match(dockerfile, /FROM rust:1\.83-alpine AS builder/);
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
