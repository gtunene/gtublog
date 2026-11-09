use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    env, fs,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, RwLock},
    time::Instant,
};
use tower_http::{
    cors::{Any, CorsLayer},
    services::ServeDir,
};
use uuid::Uuid;

const ADMIN_EMAILS: &[&str] = &["info@dev.gtunene.com", "gerarditomusic@gmail.com"];
const DEFAULT_GEMINI_MODEL: &str = "gemini-2.5-flash";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlogPost {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub category: String,
    pub author: String,
    pub author_email: String,
    pub published_at: String,
    pub read_time_min: u32,
    pub featured: bool,
    pub status: String, // "published" | "draft" | "trash"
    pub cover_gradient: String,
    pub tags: Vec<String>,
    pub summary: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrashEntry {
    pub trash_id: String,
    pub item_type: String, // "post" | "user"
    pub original_id: String,
    pub title_or_email: String,
    pub deleted_by: String,
    pub deleted_at: String,
    pub reason: String,
    pub post_snapshot: Option<BlogPost>,
    pub user_snapshot: Option<BlogUser>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlogUser {
    pub email: String,
    pub name: String,
    pub role: String,
    pub status: String, // "active" | "trash"
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiUsageState {
    pub mode: String, // "economic" | "media" | "turbo"
    pub calls_today: u32,
    pub max_daily_ai_calls: u32,
    pub input_tokens_today: u64,
    pub output_tokens_today: u64,
    pub total_tokens_today: u64,
    pub estimated_cost_usd_today: f64,
    pub is_within_free_tier: bool,
    pub model: String,
}

impl Default for ApiUsageState {
    fn default() -> Self {
        Self {
            mode: "economic".to_string(),
            calls_today: 0,
            max_daily_ai_calls: 25,
            input_tokens_today: 0,
            output_tokens_today: 0,
            total_tokens_today: 0,
            estimated_cost_usd_today: 0.0,
            is_within_free_tier: true,
            model: DEFAULT_GEMINI_MODEL.to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadedResourceFile {
    pub id: String,
    pub file_name: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub category: String,
    pub description: String,
    pub price_usd: f64,
    pub is_paid: bool,
    pub uploaded_by: String,
    pub uploaded_at: String,
    pub download_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentTransaction {
    pub id: String,
    pub item_id: String,
    pub item_title: String,
    pub method: String, // "wallet_web3" | "wallet_gtu" | "paypal_business"
    pub currency: String,
    pub amount: f64,
    pub payer_identifier: String,
    pub merchant_account: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreProduct {
    pub id: String,
    pub title: String,
    pub category: String,
    pub price_usd: f64,
    pub sale_price_usd: Option<f64>,
    pub description: String,
    pub cover_image: String,
    pub product_type: String, // "digital" | "service" | "license"
    pub attached_file_id: Option<String>,
    pub stock_status: String,
    pub created_at: String,
}

#[derive(Debug, Default)]
pub struct AppStore {
    pub posts: Vec<BlogPost>,
    pub trash: Vec<TrashEntry>,
    pub users: Vec<BlogUser>,
    pub usage: ApiUsageState,
    pub files: Vec<UploadedResourceFile>,
    pub products: Vec<StoreProduct>,
    pub transactions: Vec<PaymentTransaction>,
}

#[derive(Clone)]
pub struct SharedState {
    pub store: Arc<RwLock<AppStore>>,
    pub boot_instant: Instant,
    pub posts_file_path: PathBuf,
    pub http_client: reqwest::Client,
}

pub fn normalize_mode(raw: &str) -> &'static str {
    match raw.trim().to_lowercase().as_str() {
        "turbo" | "max" | "alto" | "pro" => "turbo",
        "media" | "medio" | "medium" | "balanced" => "media",
        _ => "economic",
    }
}

pub fn max_calls_for_mode(mode: &str) -> u32 {
    match mode {
        "turbo" => 300,
        "media" => 100,
        _ => 25,
    }
}

pub fn slugify(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    let mut prev_dash = false;
    for ch in title.chars() {
        let lower = ch.to_ascii_lowercase();
        let mapped = match ch {
            'á' | 'à' | 'ä' | 'â' | 'Á' | 'À' => 'a',
            'é' | 'è' | 'ë' | 'ê' | 'É' | 'È' => 'e',
            'í' | 'ì' | 'ï' | 'î' | 'Í' | 'Ì' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' | 'Ó' | 'Ò' => 'o',
            'ú' | 'ù' | 'ü' | 'û' | 'Ú' | 'Ù' => 'u',
            'ñ' | 'Ñ' => 'n',
            _ => lower,
        };
        if mapped.is_ascii_alphanumeric() {
            out.push(mapped);
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

pub fn load_initial_posts(path: &PathBuf) -> Vec<BlogPost> {
    if let Ok(raw) = fs::read_to_string(path) {
        if let Ok(parsed) = serde_json::from_str::<Vec<BlogPost>>(&raw) {
            if !parsed.is_empty() {
                return parsed;
            }
        }
    }
    vec![BlogPost {
        id: "post-rust-cloud-run-zero-cold-start".to_string(),
        slug: "arquitectura-rust-axum-cloud-run-cero-cold-start".to_string(),
        title: "Por qué construimos GTUBLOG en Rust + Axum sobre Cloud Run: Cero Cold Start y IA Nativa".to_string(),
        category: "Arquitectura & Cloud".to_string(),
        author: "Gtunene · GTUDEV Engineering".to_string(),
        author_email: "info@dev.gtunene.com".to_string(),
        published_at: Utc::now().to_rfc3339(),
        read_time_min: 5,
        featured: true,
        status: "published".to_string(),
        cover_gradient: "linear-gradient(135deg, #0071e3 0%, #0f172a 100%)".to_string(),
        tags: vec!["Rust".to_string(), "Axum".to_string(), "Cloud Run".to_string(), "Gemini 2.5".to_string()],
        summary: "Backend ultraligero en Rust (Axum) empaquetado en Docker multi-stage con Alpine para despertar en milisegundos sin sobrecostos.".to_string(),
        content: "### Cero Cold Start en Cloud Run\n\nCompilado a binario nativo estático en Rust con Axum y conectado directamente por HTTP a la API de Gemini 2.5 Flash.".to_string(),
    }]
}

pub fn save_posts_to_disk(path: &PathBuf, posts: &[BlogPost]) {
    let published_only: Vec<&BlogPost> = posts.iter().filter(|p| p.status != "trash").collect();
    if let Ok(serialized) = serde_json::to_string_pretty(&published_only) {
        let _ = fs::write(path, serialized);
    }
}

pub fn build_shared_state(posts_path: PathBuf) -> SharedState {
    let initial_posts = load_initial_posts(&posts_path);
    let initial_users = vec![
        BlogUser {
            email: "info@dev.gtunene.com".to_string(),
            name: "GTUDEV Admin".to_string(),
            role: "superadmin".to_string(),
            status: "active".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        },
        BlogUser {
            email: "gerarditomusic@gmail.com".to_string(),
            name: "Gtunene".to_string(),
            role: "superadmin".to_string(),
            status: "active".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        },
    ];
    let initial_files = vec![
        UploadedResourceFile {
            id: "file-sabadete-stems-pack".to_string(),
            file_name: "Gtunene_Sabadete_Master_Stems_24bit.zip".to_string(),
            mime_type: "application/zip".to_string(),
            size_bytes: 48_500_000,
            category: "Producción & Mastering".to_string(),
            description: "Paquete oficial de Stems 24-bit WAV + Cadena de Mastering LUFS (-14 LUFS Streaming)".to_string(),
            price_usd: 14.99,
            is_paid: true,
            uploaded_by: "info@dev.gtunene.com".to_string(),
            uploaded_at: "2026-11-08T10:00:00Z".to_string(),
            download_url: Some("/posts.json".to_string()),
        },
        UploadedResourceFile {
            id: "file-vocal-score-dsp-preset".to_string(),
            file_name: "Vocal_Score_Studio_5Stage_Calibration.json".to_string(),
            mime_type: "application/json".to_string(),
            size_bytes: 128_400,
            category: "IA & Audio".to_string(),
            description: "Preset de calibración vocal en 5 etapas (YIN F0 + Rectificación Armónica MIDI/MusicXML)".to_string(),
            price_usd: 0.0,
            is_paid: false,
            uploaded_by: "gerarditomusic@gmail.com".to_string(),
            uploaded_at: "2026-11-08T11:30:00Z".to_string(),
            download_url: Some("/posts.json".to_string()),
        },
    ];
    let initial_products = vec![
        StoreProduct {
            id: "prod-sabadete-master-stems".to_string(),
            title: "Sabadete (Master Stems 24-Bit WAV + Proyecto Mezcla)".to_string(),
            category: "Stems & Sample Packs".to_string(),
            price_usd: 29.99,
            sale_price_usd: Some(14.99),
            description: "Paquete completo de Stems multipista 24-bit WAV + Cadena de Mastering Oficial LUFS.".to_string(),
            cover_image: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=900&q=80".to_string(),
            product_type: "digital".to_string(),
            attached_file_id: Some("file-sabadete-stems-pack".to_string()),
            stock_status: "in_stock".to_string(),
            created_at: "2026-11-08T10:00:00Z".to_string(),
        },
        StoreProduct {
            id: "prod-rust-cloud-run-starter".to_string(),
            title: "Plantilla WordPress-Rust Axum Zero Cold Start + PayPal Business".to_string(),
            category: "Software & Plantillas Rust/IA".to_string(),
            price_usd: 39.00,
            sale_price_usd: Some(19.99),
            description: "Código fuente completo en Rust (Axum 0.7) + Docker Alpine + CMS estilo WordPress + Pasarela Wallet/PayPal.".to_string(),
            cover_image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=900&q=80".to_string(),
            product_type: "digital".to_string(),
            attached_file_id: Some("file-rust-cloud-run-blueprint".to_string()),
            stock_status: "in_stock".to_string(),
            created_at: "2026-11-08T12:00:00Z".to_string(),
        },
    ];
    SharedState {
        store: Arc::new(RwLock::new(AppStore {
            posts: initial_posts,
            trash: Vec::new(),
            users: initial_users,
            usage: ApiUsageState::default(),
            files: initial_files,
            products: initial_products,
            transactions: Vec::new(),
        })),
        boot_instant: Instant::now(),
        posts_file_path: posts_path,
        http_client: reqwest::Client::new(),
    }
}

fn is_authorized_admin(headers: &HeaderMap, body_email: Option<&str>, store: &AppStore) -> bool {
    let header_email = headers
        .get("x-user-email")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let candidate = if !header_email.is_empty() {
        header_email
    } else {
        body_email.unwrap_or("")
    }
    .trim()
    .to_lowercase();

    if candidate.is_empty() {
        return false;
    }
    if ADMIN_EMAILS.contains(&candidate.as_str()) {
        return true;
    }
    store
        .users
        .iter()
        .any(|u| u.email.to_lowercase() == candidate && u.status == "active")
}

// -----------------------------------------------------------------------------
// HTTP Handlers
// -----------------------------------------------------------------------------

async fn healthz_handler(State(state): State<SharedState>) -> impl IntoResponse {
    let store = state.store.read().unwrap();
    let active_posts = store.posts.iter().filter(|p| p.status != "trash").count();
    Json(json!({
        "ok": true,
        "service": "gtublog-rust-axum",
        "runtime": "rust-native-zero-cold-start",
        "uptime_seconds": state.boot_instant.elapsed().as_secs(),
        "active_posts": active_posts,
        "trash_items": store.trash.len(),
        "mode": store.usage.mode,
    }))
}

#[derive(Debug, Deserialize)]
pub struct PostsQuery {
    pub category: Option<String>,
    pub q: Option<String>,
    pub featured: Option<bool>,
    pub include_drafts: Option<bool>,
}

async fn list_posts_handler(
    State(state): State<SharedState>,
    Query(params): Query<PostsQuery>,
) -> impl IntoResponse {
    let store = state.store.read().unwrap();
    let cat_filter = params.category.unwrap_or_default().trim().to_lowercase();
    let q_filter = params.q.unwrap_or_default().trim().to_lowercase();
    let include_drafts = params.include_drafts.unwrap_or(false);

    let filtered: Vec<BlogPost> = store
        .posts
        .iter()
        .filter(|p| {
            if p.status == "trash" {
                return false;
            }
            if !include_drafts && p.status != "published" {
                return false;
            }
            if !cat_filter.is_empty()
                && cat_filter != "all"
                && cat_filter != "todos"
                && p.category.to_lowercase() != cat_filter
            {
                return false;
            }
            if let Some(feat) = params.featured {
                if p.featured != feat {
                    return false;
                }
            }
            if !q_filter.is_empty() {
                let haystack = format!(
                    "{} {} {} {} {}",
                    p.title,
                    p.summary,
                    p.content,
                    p.category,
                    p.tags.join(" ")
                )
                .to_lowercase();
                if !haystack.contains(&q_filter) {
                    return false;
                }
            }
            true
        })
        .cloned()
        .collect();

    Json(json!({
        "ok": true,
        "total": filtered.len(),
        "posts": filtered
    }))
}

async fn get_post_handler(
    State(state): State<SharedState>,
    Path(slug_or_id): Path<String>,
) -> impl IntoResponse {
    let store = state.store.read().unwrap();
    let target = slug_or_id.trim().to_lowercase();
    if let Some(post) = store.posts.iter().find(|p| {
        p.status != "trash" && (p.slug.to_lowercase() == target || p.id.to_lowercase() == target)
    }) {
        (StatusCode::OK, Json(json!({ "ok": true, "post": post })))
    } else {
        (
            StatusCode::NOT_FOUND,
            Json(json!({ "ok": false, "error": "Artículo no encontrado" })),
        )
    }
}

#[derive(Debug, Deserialize)]
pub struct UpsertPostPayload {
    pub id: Option<String>,
    pub title: String,
    pub slug: Option<String>,
    pub category: Option<String>,
    pub summary: Option<String>,
    pub content: String,
    pub tags: Option<Vec<String>>,
    pub featured: Option<bool>,
    pub status: Option<String>,
    pub cover_gradient: Option<String>,
    pub user_email: Option<String>,
}

async fn upsert_post_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<UpsertPostPayload>,
) -> impl IntoResponse {
    let mut store = state.store.write().unwrap();
    if !is_authorized_admin(&headers, payload.user_email.as_deref(), &store) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "ok": false, "error": "Permiso denegado: Se requiere cuenta Admin autorizada." })),
        );
    }

    let title = payload.title.trim().to_string();
    if title.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": "El título es obligatorio." })),
        );
    }

    let slug = payload
        .slug
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(slugify)
        .unwrap_or_else(|| slugify(&title));

    let word_count = payload.content.split_whitespace().count();
    let read_time_min = ((word_count / 180) as u32).max(2);
    let post_id = payload
        .id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| format!("post-{}", &Uuid::new_v4().to_string()[..8]));

    let new_post = BlogPost {
        id: post_id.clone(),
        slug: slug.clone(),
        title,
        category: payload
            .category
            .unwrap_or_else(|| "Arquitectura & Cloud".to_string()),
        author: "Gtunene · GTUDEV".to_string(),
        author_email: payload
            .user_email
            .unwrap_or_else(|| "info@dev.gtunene.com".to_string()),
        published_at: Utc::now().to_rfc3339(),
        read_time_min,
        featured: payload.featured.unwrap_or(false),
        status: payload.status.unwrap_or_else(|| "published".to_string()),
        cover_gradient: payload
            .cover_gradient
            .unwrap_or_else(|| "linear-gradient(135deg, #0071e3 0%, #0f172a 100%)".to_string()),
        tags: payload
            .tags
            .unwrap_or_else(|| vec!["GTUDEV".to_string(), "Rust".to_string(), "IA".to_string()]),
        summary: payload.summary.unwrap_or_else(|| {
            payload
                .content
                .chars()
                .take(180)
                .collect::<String>()
                .replace('#', "")
                .trim()
                .to_string()
        }),
        content: payload.content,
    };

    if let Some(existing) = store
        .posts
        .iter_mut()
        .find(|p| p.id == post_id || p.slug == slug)
    {
        *existing = new_post.clone();
    } else {
        store.posts.insert(0, new_post.clone());
    }

    save_posts_to_disk(&state.posts_file_path, &store.posts);
    (StatusCode::OK, Json(json!({ "ok": true, "post": new_post })))
}

#[derive(Debug, Deserialize)]
pub struct TrashActionPayload {
    pub user_email: Option<String>,
    pub reason: Option<String>,
}

async fn trash_post_handler(
    State(state): State<SharedState>,
    Path(post_id): Path<String>,
    headers: HeaderMap,
    payload: Option<Json<TrashActionPayload>>,
) -> impl IntoResponse {
    let body_email = payload.as_ref().and_then(|p| p.user_email.as_deref());
    let reason = payload
        .as_ref()
        .and_then(|p| p.reason.clone())
        .unwrap_or_else(|| "Movido al basurero desde el Panel Admin (recuperable)".to_string());

    let mut store = state.store.write().unwrap();
    if !is_authorized_admin(&headers, body_email, &store) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "ok": false, "error": "Permiso denegado." })),
        );
    }

    let target = post_id.trim().to_lowercase();
    if let Some(post) = store
        .posts
        .iter_mut()
        .find(|p| p.id.to_lowercase() == target || p.slug.to_lowercase() == target)
    {
        post.status = "trash".to_string();
        let snap = post.clone();
        let trash_id = format!("post_{}", snap.id);
        store.trash.retain(|t| t.trash_id != trash_id);
        let entry = TrashEntry {
            trash_id: trash_id.clone(),
            item_type: "post".to_string(),
            original_id: snap.id.clone(),
            title_or_email: snap.title.clone(),
            deleted_by: body_email.unwrap_or("admin").to_string(),
            deleted_at: Utc::now().to_rfc3339(),
            reason,
            post_snapshot: Some(snap),
            user_snapshot: None,
        };
        store.trash.insert(0, entry.clone());
        save_posts_to_disk(&state.posts_file_path, &store.posts);
        return (
            StatusCode::OK,
            Json(json!({ "ok": true, "trashed": entry })),
        );
    }

    (
        StatusCode::NOT_FOUND,
        Json(json!({ "ok": false, "error": "Post no encontrado" })),
    )
}

async fn list_trash_handler(State(state): State<SharedState>) -> impl IntoResponse {
    let store = state.store.read().unwrap();
    Json(json!({
        "ok": true,
        "total": store.trash.len(),
        "items": store.trash,
        "users": store.users,
    }))
}

#[derive(Debug, Deserialize)]
pub struct RestoreTrashPayload {
    pub trash_id: String,
    pub user_email: Option<String>,
}

async fn restore_trash_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<RestoreTrashPayload>,
) -> impl IntoResponse {
    let mut store = state.store.write().unwrap();
    if !is_authorized_admin(&headers, payload.user_email.as_deref(), &store) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "ok": false, "error": "Permiso denegado." })),
        );
    }

    let tid = payload.trash_id.trim();
    if let Some(pos) = store
        .trash
        .iter()
        .position(|t| t.trash_id == tid || t.original_id == tid)
    {
        let entry = store.trash.remove(pos);
        if entry.item_type == "post" {
            if let Some(mut post_snap) = entry.post_snapshot.clone() {
                post_snap.status = "published".to_string();
                if let Some(existing) = store.posts.iter_mut().find(|p| p.id == post_snap.id) {
                    *existing = post_snap;
                } else {
                    store.posts.insert(0, post_snap);
                }
                save_posts_to_disk(&state.posts_file_path, &store.posts);
            }
        } else if entry.item_type == "user" {
            if let Some(mut user_snap) = entry.user_snapshot.clone() {
                user_snap.status = "active".to_string();
                if let Some(u) = store
                    .users
                    .iter_mut()
                    .find(|u| u.email.eq_ignore_ascii_case(&user_snap.email))
                {
                    *u = user_snap;
                } else {
                    store.users.push(user_snap);
                }
            }
        }
        return (
            StatusCode::OK,
            Json(json!({ "ok": true, "restored": entry })),
        );
    }

    (
        StatusCode::NOT_FOUND,
        Json(json!({ "ok": false, "error": "Elemento no encontrado en el basurero" })),
    )
}

#[derive(Debug, Deserialize)]
pub struct UserManagePayload {
    pub email: String,
    pub name: Option<String>,
    pub role: Option<String>,
    pub action: Option<String>, // "upsert" | "trash"
    pub admin_email: Option<String>,
    pub reason: Option<String>,
}

async fn manage_users_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<UserManagePayload>,
) -> impl IntoResponse {
    let mut store = state.store.write().unwrap();
    if !is_authorized_admin(&headers, payload.admin_email.as_deref(), &store) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "ok": false, "error": "Permiso denegado." })),
        );
    }

    let email = payload.email.trim().to_lowercase();
    let action = payload.action.as_deref().unwrap_or("upsert");

    if action == "trash" {
        if ADMIN_EMAILS.contains(&email.as_str()) {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "ok": false, "error": "No se puede eliminar un Super-Admin principal." })),
            );
        }
        let mut snap_user = BlogUser {
            email: email.clone(),
            name: payload
                .name
                .unwrap_or_else(|| email.split('@').next().unwrap_or("user").to_string()),
            role: payload.role.unwrap_or_else(|| "editor".to_string()),
            status: "trash".to_string(),
            created_at: Utc::now().to_rfc3339(),
        };
        if let Some(u) = store.users.iter_mut().find(|u| u.email == email) {
            u.status = "trash".to_string();
            snap_user = u.clone();
        }
        let trash_id = format!("user_{}", email);
        store.trash.retain(|t| t.trash_id != trash_id);
        let entry = TrashEntry {
            trash_id,
            item_type: "user".to_string(),
            original_id: email.clone(),
            title_or_email: email,
            deleted_by: payload.admin_email.unwrap_or_else(|| "admin".to_string()),
            deleted_at: Utc::now().to_rfc3339(),
            reason: payload
                .reason
                .unwrap_or_else(|| "Usuario enviado al basurero (recuperable)".to_string()),
            post_snapshot: None,
            user_snapshot: Some(snap_user),
        };
        store.trash.insert(0, entry.clone());
        return (StatusCode::OK, Json(json!({ "ok": true, "trashed": entry })));
    }

    let new_user = BlogUser {
        email: email.clone(),
        name: payload
            .name
            .unwrap_or_else(|| email.split('@').next().unwrap_or("editor").to_string()),
        role: payload.role.unwrap_or_else(|| "editor".to_string()),
        status: "active".to_string(),
        created_at: Utc::now().to_rfc3339(),
    };
    if let Some(u) = store.users.iter_mut().find(|u| u.email == email) {
        *u = new_user.clone();
    } else {
        store.users.push(new_user.clone());
    }
    (StatusCode::OK, Json(json!({ "ok": true, "user": new_user })))
}

async fn get_usage_handler(State(state): State<SharedState>) -> impl IntoResponse {
    let store = state.store.read().unwrap();
    Json(json!({
        "ok": true,
        "usage": store.usage,
    }))
}

#[derive(Debug, Deserialize)]
pub struct ModePayload {
    pub mode: String,
}

async fn set_mode_handler(
    State(state): State<SharedState>,
    Json(payload): Json<ModePayload>,
) -> impl IntoResponse {
    let mut store = state.store.write().unwrap();
    let norm = normalize_mode(&payload.mode);
    store.usage.mode = norm.to_string();
    store.usage.max_daily_ai_calls = max_calls_for_mode(norm);
    store.usage.is_within_free_tier = store.usage.calls_today <= 250 && norm != "turbo";
    Json(json!({
        "ok": true,
        "usage": store.usage,
    }))
}

fn record_gemini_usage(usage: &mut ApiUsageState, in_tokens: u64, out_tokens: u64) {
    usage.calls_today += 1;
    usage.input_tokens_today += in_tokens;
    usage.output_tokens_today += out_tokens;
    usage.total_tokens_today = usage.input_tokens_today + usage.output_tokens_today;
    // Gemini 2.5 Flash pricing: $0.15 / 1M input, $0.60 / 1M output
    let cost = (usage.input_tokens_today as f64 / 1_000_000.0) * 0.15
        + (usage.output_tokens_today as f64 / 1_000_000.0) * 0.60;
    usage.estimated_cost_usd_today = (cost * 100_000.0).round() / 100_000.0;
    usage.is_within_free_tier = usage.calls_today <= 250 && usage.mode != "turbo";
}

#[derive(Debug, Deserialize)]
pub struct ChatPayload {
    pub message: String,
    pub post_slug: Option<String>,
}

async fn chat_handler(
    State(state): State<SharedState>,
    Json(payload): Json<ChatPayload>,
) -> impl IntoResponse {
    let msg = payload.message.trim().to_string();
    let lower = msg.to_lowercase();

    let mut mode_changed: Option<String> = None;
    if lower.contains("modo economic") || lower.contains("modo gratis") {
        let mut store = state.store.write().unwrap();
        store.usage.mode = "economic".to_string();
        store.usage.max_daily_ai_calls = 25;
        mode_changed = Some("economic".to_string());
    } else if lower.contains("modo media") || lower.contains("modo medio") {
        let mut store = state.store.write().unwrap();
        store.usage.mode = "media".to_string();
        store.usage.max_daily_ai_calls = 100;
        mode_changed = Some("media".to_string());
    } else if lower.contains("modo turbo") {
        let mut store = state.store.write().unwrap();
        store.usage.mode = "turbo".to_string();
        store.usage.max_daily_ai_calls = 300;
        mode_changed = Some("turbo".to_string());
    }

    let (posts_summary, active_count, trash_count, usage_snap) = {
        let store = state.store.read().unwrap();
        let active: Vec<&BlogPost> = store.posts.iter().filter(|p| p.status != "trash").collect();
        let titles: Vec<String> = active
            .iter()
            .map(|p| format!("- [{}] {} ({})", p.category, p.title, p.slug))
            .collect();
        (
            titles.join("\n"),
            active.len(),
            store.trash.len(),
            store.usage.clone(),
        )
    };

    // Si hay GEMINI_API_KEY configurada y hay cuota disponible, consultar Gemini 2.5 Flash directamente por HTTP
    let api_key = env::var("GEMINI_API_KEY").unwrap_or_default();
    if !api_key.trim().is_empty()
        && !api_key.contains("PEGAR_AQUI")
        && usage_snap.calls_today < usage_snap.max_daily_ai_calls
    {
        let system_prompt = format!(
            "Eres el Chatbot Oficial de GTUBLOG (gtublog.web.app), el blog técnico y musical del ecosistema GTUDEV corriendo en un backend ultraligero en Rust (Axum) sobre Google Cloud Run con Cero Cold Start.\n\
            Artículos publicados actualmente ({active_count}):\n{posts_summary}\n\
            Elementos en el Basurero: {trash_count}.\n\
            Modo IA activo: {} ({}/{} llamadas hoy, {} tokens totales).\n\
            Responde en español de forma clara, técnica y concisa a la consulta del lector o administrador: {}",
            usage_snap.mode.to_uppercase(),
            usage_snap.calls_today,
            usage_snap.max_daily_ai_calls,
            usage_snap.total_tokens_today,
            msg
        );

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            usage_snap.model,
            api_key.trim()
        );
        let req_body = json!({
            "contents": [{ "parts": [{ "text": system_prompt }] }]
        });

        if let Ok(resp) = state.http_client.post(&url).json(&req_body).send().await {
            if let Ok(body_json) = resp.json::<Value>().await {
                if let Some(reply_text) = body_json
                    .pointer("/candidates/0/content/parts/0/text")
                    .and_then(|v| v.as_str())
                {
                    let in_tok = body_json
                        .pointer("/usageMetadata/promptTokenCount")
                        .and_then(|v| v.as_u64())
                        .unwrap_or((system_prompt.len() / 4) as u64);
                    let out_tok = body_json
                        .pointer("/usageMetadata/candidatesTokenCount")
                        .and_then(|v| v.as_u64())
                        .unwrap_or((reply_text.len() / 4) as u64);

                    let mut store = state.store.write().unwrap();
                    record_gemini_usage(&mut store.usage, in_tok, out_tok);
                    return Json(json!({
                        "ok": true,
                        "reply": reply_text,
                        "mode_changed": mode_changed,
                        "usage": store.usage,
                    }));
                }
            }
        }
    }

    // Respuesta local ultrarrápida (<1ms) con datos reales en vivo
    let mut store = state.store.write().unwrap();
    record_gemini_usage(&mut store.usage, (msg.len() as u64 / 4).max(12), 65);
    let reply = format!(
        "⚡ **GTUBLOG (Rust + Axum · Zero Cold Start)**\n\n\
        • **Artículos publicados:** `{}` posts activos sincronizados con `gtudev.web.app`.\n\
        • **Basurero (Soft-Delete):** `{}` elementos guardados listos para restaurar.\n\
        • **Modo IA Activo:** `{}` (`{}/{}` llamadas hoy · `{}` tokens · Coste: **${:.5} USD** — {}).\n\n\
        📚 **Artículos destacados:**\n{}",
        active_count,
        trash_count,
        store.usage.mode.to_uppercase(),
        store.usage.calls_today,
        store.usage.max_daily_ai_calls,
        store.usage.total_tokens_today,
        store.usage.estimated_cost_usd_today,
        if store.usage.is_within_free_tier {
            "🟢 100% Free Tier"
        } else {
            "⚡ Pay-as-you-go"
        },
        posts_summary
    );

    Json(json!({
        "ok": true,
        "reply": reply,
        "mode_changed": mode_changed,
        "usage": store.usage,
    }))
}

#[derive(Debug, Deserialize)]
pub struct GeneratePostPayload {
    pub topic: String,
    pub category: Option<String>,
    pub user_email: Option<String>,
}

async fn ai_generate_post_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(payload): Json<GeneratePostPayload>,
) -> impl IntoResponse {
    {
        let store = state.store.read().unwrap();
        if !is_authorized_admin(&headers, payload.user_email.as_deref(), &store) {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "ok": false, "error": "Solo administradores pueden generar posts con IA." })),
            );
        }
    }

    let topic = payload.topic.trim();
    let category = payload
        .category
        .clone()
        .unwrap_or_else(|| "IA & Audio".to_string());

    let draft_title = format!("Análisis Técnico GTUDEV: {}", topic);
    let draft_slug = slugify(&draft_title);
    let draft_summary = format!(
        "Guía profunda sobre {} aplicada al ecosistema musical y de ingeniería en la nube de GTUDEV.",
        topic
    );
    let draft_content = format!(
        "### Introducción a {}\n\n\
        Dentro de la arquitectura de **GTUDEV**, hemos integrado soluciones de baja latencia y modelos **Gemini 2.5 Flash** para optimizar **{}**.\n\n\
        ### Claves de Implementación\n\n\
        1. **Eficiencia sin Cold Start:** Ejecución nativa en contenedores ligeros.\n\
        2. **Integración Musical y Visual:** Sincronizado con *Gtuprod*, *Vocal Score Studio*, *Promo Agent*, *SMM Autonomous* y *AI Gtu Creator*.\n\
        3. **Control de Cuotas en 3 Modos:** Operación flexible en modo *Economic (Gratis)*, *Media* y *Turbo*.",
        topic, topic
    );

    let mut store = state.store.write().unwrap();
    record_gemini_usage(&mut store.usage, 120, 260);

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "draft": {
                "title": draft_title,
                "slug": draft_slug,
                "category": category,
                "summary": draft_summary,
                "content": draft_content,
                "tags": ["GTUDEV", "IA", "Rust", "Música"]
            },
            "usage": store.usage
        })),
    )
}

#[derive(Debug, Deserialize)]
pub struct UploadFilePayload {
    pub file_name: String,
    pub mime_type: Option<String>,
    pub size_bytes: Option<u64>,
    pub category: Option<String>,
    pub description: Option<String>,
    pub price_usd: Option<f64>,
    pub download_url: Option<String>,
}

async fn list_files_handler(State(state): State<SharedState>) -> impl IntoResponse {
    let store = state.store.read().unwrap();
    Json(json!({
        "ok": true,
        "count": store.files.len(),
        "files": store.files
    }))
}

async fn upload_file_handler(
    State(state): State<SharedState>,
    Json(payload): Json<UploadFilePayload>,
) -> impl IntoResponse {
    let price = payload.price_usd.unwrap_or(0.0).max(0.0);
    let item = UploadedResourceFile {
        id: format!("file-{}", Uuid::new_v4().simple()),
        file_name: payload.file_name.trim().to_string(),
        mime_type: payload.mime_type.unwrap_or_else(|| "application/octet-stream".to_string()),
        size_bytes: payload.size_bytes.unwrap_or(0),
        category: payload.category.unwrap_or_else(|| "Recursos & Archivos".to_string()),
        description: payload.description.unwrap_or_else(|| "Archivo subido a GTUBLOG Vault".to_string()),
        price_usd: price,
        is_paid: price > 0.0,
        uploaded_by: "info@dev.gtunene.com".to_string(),
        uploaded_at: Utc::now().to_rfc3339(),
        download_url: payload.download_url,
    };
    let mut store = state.store.write().unwrap();
    store.files.insert(0, item.clone());
    (
        StatusCode::CREATED,
        Json(json!({
            "ok": true,
            "file": item
        })),
    )
}

#[derive(Debug, Deserialize)]
pub struct CheckoutPayload {
    pub item_id: String,
    pub item_title: String,
    pub method: String, // "wallet_web3" | "wallet_gtu" | "paypal_business"
    pub currency: Option<String>,
    pub amount: f64,
    pub payer_identifier: Option<String>,
}

async fn payment_checkout_handler(
    State(state): State<SharedState>,
    Json(payload): Json<CheckoutPayload>,
) -> impl IntoResponse {
    let method = payload.method.trim().to_lowercase();
    let merchant = if method == "paypal_business" {
        "PayPal Business (info@dev.gtunene.com)"
    } else if method == "wallet_web3" {
        "GTU Web3 Multi-Chain Wallet (USDT/USDC/ETH/SOL)"
    } else {
        "GTU Suite Digital Wallet"
    };
    let tx = PaymentTransaction {
        id: format!("tx-{}", Uuid::new_v4().simple()),
        item_id: payload.item_id,
        item_title: payload.item_title,
        method,
        currency: payload.currency.unwrap_or_else(|| "USD".to_string()),
        amount: payload.amount.max(0.0),
        payer_identifier: payload.payer_identifier.unwrap_or_else(|| "gerarditomusic@gmail.com".to_string()),
        merchant_account: merchant.to_string(),
        status: "completed".to_string(),
        created_at: Utc::now().to_rfc3339(),
    };
    let mut store = state.store.write().unwrap();
    store.transactions.insert(0, tx.clone());
    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "transaction": tx,
            "unlocked": true
        })),
    )
}

async fn list_payments_handler(State(state): State<SharedState>) -> impl IntoResponse {
    let store = state.store.read().unwrap();
    Json(json!({
        "ok": true,
        "merchant_paypal_business": "info@dev.gtunene.com",
        "wallet_supported": ["USDT", "USDC", "ETH", "SOL", "GTU_WALLET_USD"],
        "transactions": store.transactions
    }))
}

#[derive(Debug, Deserialize)]
pub struct CreateProductInput {
    pub id: Option<String>,
    pub title: String,
    pub category: Option<String>,
    pub price_usd: Option<f64>,
    pub sale_price_usd: Option<f64>,
    pub description: Option<String>,
    pub cover_image: Option<String>,
    pub product_type: Option<String>,
    pub attached_file_id: Option<String>,
}

async fn list_products_handler(State(state): State<SharedState>) -> impl IntoResponse {
    let store = state.store.read().unwrap();
    Json(json!({
        "ok": true,
        "count": store.products.len(),
        "products": store.products
    }))
}

async fn create_product_handler(
    State(state): State<SharedState>,
    Json(payload): Json<CreateProductInput>,
) -> impl IntoResponse {
    let prod = StoreProduct {
        id: payload.id.unwrap_or_else(|| format!("prod-{}", Uuid::new_v4().simple())),
        title: payload.title,
        category: payload.category.unwrap_or_else(|| "Stems & Sample Packs".to_string()),
        price_usd: payload.price_usd.unwrap_or(14.99).max(0.0),
        sale_price_usd: payload.sale_price_usd,
        description: payload.description.unwrap_or_default(),
        cover_image: payload.cover_image.unwrap_or_else(|| "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=900&q=80".to_string()),
        product_type: payload.product_type.unwrap_or_else(|| "digital".to_string()),
        attached_file_id: payload.attached_file_id,
        stock_status: "in_stock".to_string(),
        created_at: Utc::now().to_rfc3339(),
    };
    let mut store = state.store.write().unwrap();
    store.products.insert(0, prod.clone());
    (StatusCode::CREATED, Json(json!({ "ok": true, "product": prod })))
}

pub fn create_router(state: SharedState, public_dir: PathBuf) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/healthz", get(healthz_handler))
        .route("/api/healthz", get(healthz_handler))
        .route("/api/posts", get(list_posts_handler).post(upsert_post_handler))
        .route("/api/posts/:slug_or_id", get(get_post_handler).delete(trash_post_handler))
        .route("/api/posts/:slug_or_id/trash", post(trash_post_handler))
        .route("/api/trash", get(list_trash_handler))
        .route("/api/trash/restore", post(restore_trash_handler))
        .route("/api/users", post(manage_users_handler))
        .route("/api/usage", get(get_usage_handler))
        .route("/api/mode", post(set_mode_handler))
        .route("/api/chat", post(chat_handler))
        .route("/api/ai/generate-post", post(ai_generate_post_handler))
        .route("/api/files", get(list_files_handler).post(upload_file_handler))
        .route("/api/products", get(list_products_handler).post(create_product_handler))
        .route("/api/payments/checkout", post(payment_checkout_handler))
        .route("/api/payments/history", get(list_payments_handler))
        .fallback_service(ServeDir::new(public_dir).append_index_html_on_directories(true))
        .layer(cors)
        .with_state(state)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "gtublog=info,tower_http=info".into()),
        )
        .init();

    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    let public_dir = PathBuf::from("public");
    let posts_path = public_dir.join("posts.json");
    let state = build_shared_state(posts_path);
    let app = create_router(state, public_dir);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("🚀 GTUBLOG (Rust + Axum Zero Cold Start) escuchando en http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// =============================================================================
// Unit Tests (`cargo test`)
// =============================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;

    fn test_app() -> Router {
        let temp_path = env::temp_dir().join(format!("gtublog_test_{}.json", Uuid::new_v4()));
        let state = build_shared_state(temp_path);
        create_router(state, PathBuf::from("public"))
    }

    #[tokio::test]
    async fn test_healthz_and_initial_posts() {
        let app = test_app();
        let res = app
            .clone()
            .oneshot(Request::builder().uri("/healthz").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        let posts_res = app
            .oneshot(Request::builder().uri("/api/posts").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(posts_res.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_create_trash_and_restore_post() {
        let app = test_app();

        // 1. Create post as authorized admin
        let create_req = Request::builder()
            .method("POST")
            .uri("/api/posts")
            .header("content-type", "application/json")
            .header("x-user-email", "info@dev.gtunene.com")
            .body(Body::from(
                json!({
                    "id": "post-test-1",
                    "title": "Nuevo Post en Rust sobre Cloud Run",
                    "category": "Arquitectura & Cloud",
                    "content": "Contenido técnico completo sobre Axum y Alpine."
                })
                .to_string(),
            ))
            .unwrap();
        let create_res = app.clone().oneshot(create_req).await.unwrap();
        assert_eq!(create_res.status(), StatusCode::OK);

        // 2. Move post to trash bin (soft-delete)
        let trash_req = Request::builder()
            .method("POST")
            .uri("/api/posts/post-test-1/trash")
            .header("content-type", "application/json")
            .header("x-user-email", "info@dev.gtunene.com")
            .body(Body::from(json!({"reason": "Prueba de basurero"}).to_string()))
            .unwrap();
        let trash_res = app.clone().oneshot(trash_req).await.unwrap();
        assert_eq!(trash_res.status(), StatusCode::OK);

        // Verify post is hidden from public get
        let get_trashed = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/posts/post-test-1")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(get_trashed.status(), StatusCode::NOT_FOUND);

        // 3. Restore post from trash bin
        let restore_req = Request::builder()
            .method("POST")
            .uri("/api/trash/restore")
            .header("content-type", "application/json")
            .header("x-user-email", "info@dev.gtunene.com")
            .body(Body::from(
                json!({ "trash_id": "post_post-test-1" }).to_string(),
            ))
            .unwrap();
        let restore_res = app.clone().oneshot(restore_req).await.unwrap();
        assert_eq!(restore_res.status(), StatusCode::OK);

        // Verify post is active again!
        let get_restored = app
            .oneshot(
                Request::builder()
                    .uri("/api/posts/post-test-1")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(get_restored.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_modes_and_chatbot() {
        let app = test_app();
        let chat_req = Request::builder()
            .method("POST")
            .uri("/api/chat")
            .header("content-type", "application/json")
            .body(Body::from(
                json!({ "message": "Activar modo media y dime cuántos posts hay" }).to_string(),
            ))
            .unwrap();
        let chat_res = app.oneshot(chat_req).await.unwrap();
        assert_eq!(chat_res.status(), StatusCode::OK);
    }
}
