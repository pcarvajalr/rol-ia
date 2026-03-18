# Rol.IA

Plataforma SaaS multi-tenant de inteligencia comercial para marketing digital. Monitorea leads, rendimiento de ads, diagnostica fugas de conversión y genera proyecciones de ventas.

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Frontend** (`apps/web`): React 19 + Vite + TypeScript + Tailwind CSS 4 + shadcn/ui + Zustand + React Router 7
- **Backend** (`apps/api`): Hono + Node.js + TypeScript
- **DB**: PostgreSQL (Neon) + Prisma ORM (con RLS policies)
- **Auth**: Firebase Auth (frontend) + Firebase Admin (backend verifica tokens)
- **Hosting**: Firebase Hosting (web) + Google Cloud Run (API)
- **Shared** (`packages/shared`): tipos, validadores y constantes compartidas

## Estructura

```
apps/
  web/          → SPA React (puerto 5173)
  api/          → API REST Hono (puerto 3001)
packages/
  shared/       → @rol-ia/shared (types, validators, constants)
docs/
  plans/        → Documentos de arquitectura y planes de migración
  prompts/      → Prompts/specs originales de features
  superpowers/
    specs/      → Documentos de diseño validados
    plans/      → Planes de implementación detallados
```

## Comandos

```bash
pnpm install              # Instalar dependencias
pnpm dev                  # Dev todos los apps (Turbo)
pnpm build                # Build todos los apps
pnpm db:migrate           # Prisma migrate dev (API)
pnpm db:generate          # Prisma generate (API)
pnpm db:studio            # Prisma Studio
pnpm deploy:web           # Build + deploy web a Firebase Hosting
```

### Deploy API a Cloud Run

```bash
# Desde la raíz del proyecto (usa Dockerfile raíz)
gcloud run deploy rolia-api --source . --region southamerica-east1

# Si solo necesitas actualizar variables de entorno (no rebuild)
gcloud run services update rolia-api --region=southamerica-east1 --update-env-vars="KEY=value"
```

El deploy usa el `Dockerfile` de la raíz del proyecto. Build toma ~3-5 minutos. Las variables de entorno se configuran en Cloud Run, no en el Dockerfile.

## Variables de entorno

### `apps/api/.env`
```
DATABASE_URL=             # PostgreSQL connection string (Neon pooled)
DATABASE_URL_UNPOOLED=    # PostgreSQL direct connection (Neon unpooled, para migraciones)
FIREBASE_PROJECT_ID=      # ID del proyecto Firebase
PORT=3001
GCP_PROJECT_ID=           # ID del proyecto GCP (para Cloud Tasks)
GCP_LOCATION=             # Región de Cloud Tasks (us-central1)
GCP_QUEUE_NAME=           # Nombre de la queue (rol-ia-leads)
API_BASE_URL=             # URL del API en Cloud Run (para que Cloud Tasks llame de vuelta)
META_VERIFY_TOKEN=        # Token de verificación webhook Meta (compartido, una sola env var)
VAULT_ENCRYPTION_KEY=     # Clave de encriptación para bóveda de seguridad
```

### `apps/web/.env`
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_API_URL=             # URL del API (local: http://localhost:3001)
```

## URLs de producción

- **Web**: https://rolia-92d5d.web.app
- **API**: https://rolia-api-377846873300.southamerica-east1.run.app
- **Webhook Clientify**: `POST https://rolia-api-377846873300.southamerica-east1.run.app/webhook/clientify/{tenantId}`
- **Webhook Meta (verificación)**: `GET https://rolia-api-377846873300.southamerica-east1.run.app/webhook/meta`
- **Webhook Meta (callback)**: `POST https://rolia-api-377846873300.southamerica-east1.run.app/webhook/meta`

## Arquitectura multi-tenant

- Cada request del API se asocia a un `tenantId` via middleware
- El schema Prisma usa `@@map()` para snake_case en PostgreSQL
- Modelos principales: Tenant, User, ConfigGuardian, LeadTracking, MetricsAdPerformance, VentasProyeccion
- Auth flow: Firebase Auth → registro en DB → aprobación por admin → acceso

## Seed y datos de desarrollo

- **Ejecutar**: `pnpm --filter api db:seed` (corre `tsx prisma/seed.ts`)
- **Usuario demo**: `admin@rol.ia` / `Admin123!` (superadmin)
- **Tenant demo**: `75c003f2-d881-4343-8637-0477db03fbc1` ("Rol Demo", plan pro)
- **Idempotente**: el seed borra y recrea todos los datos del tenant demo. Cualquier cambio manual en ese tenant se pierde al re-ejecutar
- **Timestamps relativos**: `MetricsAdPerformance` y `CitaAgendada` usan offsets desde `now` para que siempre caigan dentro de las ventanas de consulta de los endpoints
- **Datos reales**: todos los componentes del dashboard consultan PostgreSQL via Prisma (no hay datos mockeados en frontend). Los endpoints filtran por tiempo (`>= now - 5h`, `>= startOfDay`), por lo que el seed debe re-ejecutarse si los datos quedan fuera de rango

## Convenciones

- Nombres de tablas/columnas en DB: snake_case (via `@map` / `@@map`)
- Nombres en código TypeScript: camelCase
- UI: shadcn/ui + Tailwind CSS, diseño mobile-first
- API routes organizadas por dominio: `auth.ts`, `admin.ts`, `intel.ts`
- Middleware: `auth.ts` (verifica Firebase token), `tenant.ts` (extrae tenant), `superadmin.ts`

## Sistema de Leads — Arquitectura

### Flujo del lead
```
Webhook Clientify → crear lead + evento "Lead ingreso" → Cloud Task (timer 1)
  → timeout → consulta CRM → WhatsApp template → evento "WhatsApp" → Cloud Task (timer 2)
    → botón "Llamar Ahora" → VAPI call → evento "Llamada" → fin
    → botón "Agendar Cita" → Calendar link → evento "Cita" → fin
    → botón "No Contactar" → email owner → evento "No contactar" → fin
    → timeout → VAPI call → evento "Llamada" → fin
  → 12h TTL → cleanup → evento "Timeout" → fin
```

### Archivos clave
- `routes/webhook.ts` — endpoints de webhook (Clientify + Meta). Procesamiento sync (no usar setImmediate — Cloud Run corta ejecución post-response)
- `routes/internal.ts` — `POST /internal/lead-timeout/:leadId` y `POST /internal/lead-cleanup`
- `modules/clientify.ts` — parseo payload y consulta API Clientify
- `modules/whatsapp.ts` — Meta Cloud API (templates, texto, webhook parsing, firma)
- `modules/vapi.ts` — llamadas outbound VAPI
- `services/lead-flow.ts` — orquestador de flujo (startFlow, handleTimeout, handleButtonResponse, endFlow)
- `services/task-scheduler.ts` — wrapper Google Cloud Tasks SDK (lazy init del client)
- `utils/encryption.ts` — helpers AES-256-GCM compartidos + validateCredentials

### Estado del flujo
Derivado del último evento en `leads_event_history`, NO de un campo. Consultar con `getLastEvent(leadId, tenantId)`.

### Rutas montadas antes de CORS
`/webhook` y `/internal` se montan ANTES del middleware CORS en `index.ts` para permitir llamadas de servicios externos.

### Infraestructura GCP (producción)
- **Cloud Run**: `rolia-api` en `southamerica-east1`
- **Cloud Tasks**: queue `rol-ia-leads` en `us-central1`, max 3 retries, 10s backoff
- **Variables de entorno**: `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_QUEUE_NAME`, `API_BASE_URL`, `META_VERIFY_TOKEN`
- **Pendiente**: Cloud Scheduler job para cleanup cada hora:
  ```bash
  gcloud scheduler jobs create http lead-cleanup \
    --schedule="0 * * * *" \
    --uri="https://rolia-api-377846873300.southamerica-east1.run.app/internal/lead-cleanup" \
    --http-method=POST \
    --location=us-central1
  ```

### WhatsApp — cada tenant tiene su Meta App
Campos en bóveda (slug `whatsapp`): `phone_number`, `phone_number_id`, `account_id`, `access_token`, `app_secret`

### Desarrollo local vs producción
- **Cloud Tasks no funciona en local**: no hay adapter in-memory. En local, el webhook crea el lead y registra el evento, pero `startFlow` falla silenciosamente (no hay credenciales GCP). El lead queda con `flowJobId: null`.
- **Para probar el flujo completo**: desplegar a Cloud Run. Cloud Tasks requiere la queue en GCP y las variables de entorno configuradas.
- **Para probar solo persistencia**: en local, enviar POST al webhook y verificar en BD que el lead y evento se crearon.

### Decisiones técnicas
- **Sin setImmediate en Cloud Run**: el procesamiento del webhook es sync porque Cloud Run apaga instancias tras enviar la respuesta HTTP
- **Cloud Tasks client con lazy init**: se instancia al primer uso, no al importar, para evitar crash sin credenciales GCP en desarrollo local
- **Solo Cloud Tasks**: sin adapter in-memory para desarrollo local

## Autenticación de webhooks entrantes

Cada plataforma que envía datos via webhook usa su propio mecanismo de autenticación. La validación siempre ocurre en `webhook.ts` (la ruta), nunca en el módulo de la plataforma.

### Mecanismos actuales
- **Clientify**: header `Authorization: Token {api_token}` — se valida contra el `api_token` de la bóveda (slug `clientify`)
- **Meta/WhatsApp**: `verify_token` para verificación (GET) + firma de payload (POST) — rutas separadas en `webhook.ts`

### Agregar una plataforma nueva
1. Crear el módulo en `apps/api/src/modules/{plataforma}.ts` — solo parseo de payload y lógica de negocio, sin auth
2. En `webhook.ts`, agregar la lógica de autenticación específica de la plataforma dentro del handler de `POST /webhook/:plataforma/:idEmpresa`
3. Documentar aquí qué mecanismo usa la plataforma (header, firma, API key, etc.)
4. Las credenciales de auth se obtienen de la bóveda de seguridad del tenant (slug de la plataforma correspondiente)

## Implementaciones futuras (pendientes)

### Retry y error handling para integraciones externas
- Implementar retry con backoff exponencial para fallos temporales de WhatsApp (Meta API) y VAPI
- Máximo 3 reintentos por acción, con delays de 1s, 3s, 9s
- Si falla tras 3 intentos: registrar evento con descripcion "Error: {servicio} no disponible" y notificar al owner del tenant
- Considerar estado intermedio en `leads_event_history` con descripcion "retry_pending" para tracking

### Validación pre-WhatsApp contra CRM en producción
- Antes de enviar el mensaje WhatsApp automático, consultar el estado del lead en la API del CRM origen (Clientify u otro)
- Si el lead ya fue atendido por un asesor humano (estado actualizado en el CRM), NO enviar el WhatsApp y terminar el flujo
- Esto evita contacto redundante cuando el asesor respondió entre el ingreso del lead y el vencimiento del timer
- En MVP se omite esta validación y se envía WhatsApp directamente

### Tracking de mensajes WhatsApp para facturación
- Cada tenant tiene su propia Meta App — la facturación de Meta queda a nombre del tenant
- Registrar cada template enviado con `tenantId`, timestamp, tipo de conversación (marketing/utility)
- Dashboard o reporte de consumo por tenant para control de costos
- Meta cobra por conversaciones (no por mensaje individual), ventana de 24h por conversación

### Manejo de sesión expirada en frontend
- No hay manejo de 401 en el frontend — cuando el token de Firebase expira, las llamadas al API fallan silenciosamente
- No hay interceptor global ni API client centralizado — hay 30+ `fetch()` directos en componentes
- Crear un wrapper de fetch que detecte 401 y muestre toast "Sesión expirada, recarga la página" o haga refresh automático del token con `firebaseUser.getIdToken(true)`
- Implementar logout automático o redirect a login tras N fallos de auth
- Afecta toda la app, no solo la bóveda

### Multi-lenguaje para plantillas WhatsApp
- Selección automática de idioma del template según el país del lead (detectado por número telefónico con `libphonenumber-js`)
- Cadena de resolución: idioma exacto → idioma base (`es_CO` → `es`) → cualquier variante (`es_*`) → idioma del tenant → primer idioma disponible → fallback a texto
- Requiere campos `defaultCountry` y `defaultLanguage` en el modelo Tenant
- Actualmente `sendTemplate` usa el idioma del template existente en Meta; este plan agrega soporte para múltiples traducciones del mismo template
- Plan detallado: `docs/plans/multi-language-templates.md`

### Observabilidad y logging estructurado
- Implementar logging estructurado con correlación por `leadId`, `tenantId`, y paso del flujo
- Cada acción del flujo (webhook recibido, timer creado, WhatsApp enviado, VAPI llamado, etc.) debe emitir un log con contexto completo
- Integración futura con Google Cloud Logging para dashboards de operación
- Alertas cuando un tenant acumule más de N leads en estado de flujo activo sin resolver
