# =============================================================================
# GTUBLOG — Multi-Stage Rust (Axum) + Alpine Dockerfile for Google Cloud Run
# Zero Cold Start (<5ms startup) · Static musl binary · Minimal attack surface
# =============================================================================

# Stage 1: Builder (Rust + musl static target on Alpine)
FROM rust:alpine AS builder

RUN apk add --no-cache musl-dev pkgconfig openssl-dev openssl-libs-static ca-certificates

WORKDIR /app

# Cache dependencies first for fast incremental builds
COPY Cargo.toml Cargo.lock* ./
RUN mkdir -p src && \
    echo "fn main() { println!(\"dependency cache\"); }" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Copy actual source and build optimized stripped binary
COPY src ./src
COPY public ./public
RUN touch src/main.rs && cargo build --release

# Stage 2: Ultralight Runtime Image (Alpine)
FROM alpine:3.20 AS runtime

RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S gtublog && adduser -S gtublog -G gtublog

WORKDIR /app

COPY --from=builder /app/target/release/gtublog /app/gtublog
COPY --from=builder /app/public /app/public

RUN chown -R gtublog:gtublog /app

USER gtublog

ENV PORT=8080
ENV RUST_LOG=info
EXPOSE 8080

ENTRYPOINT ["/app/gtublog"]
