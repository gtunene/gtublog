$ErrorActionPreference = "Stop"
$PROJECT_ID = "gtudev"
$REGION = "europe-west1"
$SERVICE_NAME = "gtublog"

Write-Host "🚀 Desplegando GTUBLOG (Rust + Axum Zero Cold Start) en Cloud Run ($PROJECT_ID / $REGION)..." -ForegroundColor Cyan

gcloud run deploy $SERVICE_NAME `
  --source . `
  --project $PROJECT_ID `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --memory 256Mi `
  --cpu 1 `
  --min-instances 0 `
  --max-instances 10 `
  --set-env-vars "GCP_PROJECT=$PROJECT_ID,RUST_LOG=info" `
  --quiet

Write-Host "✅ Servicio Cloud Run '$SERVICE_NAME' desplegado. Publicando Firebase Hosting (gtublog.web.app)..." -ForegroundColor Green
& "C:\Users\Gtunene\Documents\antigravity\Suite Gtudev\deploy-static-hosting.ps1" -SiteId "gtublog" -PublicDir "$PSScriptRoot\public" -ProjectId $PROJECT_ID -FirebaseJsonPath "$PSScriptRoot\firebase.json"
