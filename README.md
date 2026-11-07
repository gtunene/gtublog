# 🦀 GTUBLOG · Blog & CMS Ultraligero en Rust (Axum) con IA en Cloud Run

**GTUBLOG** es el blog oficial de ingeniería de IA, producción musical y arquitectura cloud del ecosistema **GTUDEV** (`gtudev`).

## Arquitectura Técnica
- **Cero Cold Start (< 5 ms)**: Binario nativo compilado en **Rust 2021 (`Axum 0.7` + `Tokio`)** con optimización `opt-level = "z"`, `lto = true` y `strip = true`.
- **Docker Multi-Stage con Alpine**: Compilación estática en `rust:1.83-alpine` (`musl-dev`) y ejecución en `alpine:3.20` sin privilegios de root (`gtublog` user).
- **Integración Directa con Gemini 2.5 Flash**: Conexión HTTP directa (`reqwest` + `rustls-tls`) en `/api/chat` y `/api/ai/generate-post` con control de cuota en 3 modos (`economic`, `media`, `turbo`).
- **Persistencia & Basurero Recuperable (`🗑️ Basurero`)**: Cualquier artículo o usuario eliminado pasa al basurero (`blog_trash`) y puede restaurarse con 1 clic (`/api/trash/restore`).
- **Sincronización con GTUDEV Hub**: Todos los artículos con `featured_on_gtudev: true` se muestran automáticamente en la página principal de `gtudev`.
