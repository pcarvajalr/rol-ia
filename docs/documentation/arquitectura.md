# Rol.IA — Documentacion de Arquitectura

> Ultima actualizacion: 2026-03-14
> Estado: Produccion

Plataforma SaaS multi-tenant de inteligencia comercial para marketing digital. Monitorea leads, rendimiento de ads, diagnostica fugas de conversion y genera proyecciones de ventas.

---

## 1. Infraestructura General

### Stack tecnologico

| Capa | Tecnologia | Version |
|------|-----------|---------|
| Frontend | React + Vite + TypeScript | React 19.2, Vite 6.2 |
| UI | shadcn/ui + Tailwind CSS + Radix UI | Tailwind 4.2 |
| Estado | Zustand | 5.0 |
| Routing | React Router | 7.3 |
| Charts | Recharts | 2.15 |
| Animaciones | Framer Motion | 11.15 |
| Backend | Hono + Node.js + TypeScript | Hono 4.7 |
| ORM | Prisma | 6.4 |
| Base de datos | PostgreSQL (Neon) | — |
| Auth | Firebase Auth (frontend) + Firebase Admin (backend) | Firebase 11.3 / Admin 13.0 |
| Monorepo | pnpm workspaces + Turborepo | pnpm 9.15, Turbo 2 |
| Shared | @rol-ia/shared (types, validators, constants) | workspace |

### URLs de produccion

| Servicio | URL | Hosting |
|----------|-----|---------|
| Web (SPA) | https://rolia-92d5d.web.app | Firebase Hosting |
| API REST | Cloud Run (ver Google Cloud Console) | Google Cloud Run |
| Base de datos | Neon PostgreSQL (region SA) | Neon |

### Diagrama de componentes

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENTE                            │
│  React 19 SPA (Firebase Hosting)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────────┐│
│  │ Firebase  │ │ Zustand  │ │ shadcn/ui + Recharts     ││
│  │ Auth SDK  │ │ Store    │ │ Dashboard Panels         ││
│  └────┬─────┘ └────┬─────┘ └──────────────────────────┘│
│       │Bearer Token │                                    │
└───────┼─────────────┼────────────────────────────────────┘
        │             │
        ▼             ▼
┌─────────────────────────────────────────────────────────┐
│                    API (Cloud Run)                       │
│  Hono + Node.js                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────────┐│
│  │ Firebase  │ │ Tenant   │ │ Routes:                  ││
│  │ Admin     │ │ Isolation│ │ /auth /admin /api/intel   ││
│  │ (verify)  │ │ (RLS)   │ │                           ││
│  └──────────┘ └────┬─────┘ └──────────────────────────┘│
│                     │                                    │
└─────────────────────┼────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              PostgreSQL (Neon)                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ RLS Policies por tenant_id                       │   │
│  │ Pooled (PgBouncer) + Unpooled (migraciones)      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Estructura del Monorepo

```
rol-ia/
├── apps/
│   ├── web/                  → SPA React (puerto 5173 dev)
│   │   ├── src/
│   │   │   ├── pages/        → Componentes de pagina
│   │   │   ├── components/   → Paneles del dashboard + shadcn/ui
│   │   │   ├── stores/       → Zustand (auth-store.ts)
│   │   │   ├── hooks/        → use-intel-fetch, use-mobile, use-toast
│   │   │   ├── lib/          → firebase.ts, utils.ts (cn helper)
│   │   │   └── styles/       → globals.css (theme dark-only)
│   │   ├── firebase.json     → Config Firebase Hosting
│   │   ├── .firebaserc       → Proyecto: rolia-92d5d
│   │   └── vite.config.ts    → Proxy /api → localhost:3001
│   │
│   └── api/                  → API REST Hono (puerto 3001 dev)
│       ├── src/
│       │   ├── routes/       → auth.ts, admin.ts, intel.ts
│       │   ├── middleware/    → auth.ts, tenant.ts, superadmin.ts
│       │   ├── db/           → client.ts (Prisma + tenant isolation)
│       │   └── index.ts      → Server setup, CORS, route mounting
│       ├── prisma/
│       │   ├── schema.prisma → Modelos + RLS policies
│       │   ├── seed.ts       → Datos demo (idempotente)
│       │   └── migrations/   → Historial de migraciones
│       └── Dockerfile        → Multi-stage build para Cloud Run
│
├── packages/
│   └── shared/               → @rol-ia/shared
│       └── src/
│           ├── types/        → Tenant, User, UserRole, AuthContext
│           ├── validators/   → loginSchema, registerSchema, inviteUserSchema
│           └── constants/    → ROLE_HIERARCHY, hasPermission()
│
├── docs/                     → Documentacion
├── Dockerfile                → Build container API (node:20-slim)
├── turbo.json                → Pipeline: dev, build, lint
├── pnpm-workspace.yaml       → apps/* + packages/*
└── package.json              → Scripts raiz (dev, build, deploy:web, db:*)
```

---

## 3. Base de Datos

### Proveedor

PostgreSQL en **Neon** con dos connection strings:
- **Pooled** (`DATABASE_URL`): PgBouncer para la API en runtime
- **Unpooled** (`DATABASE_URL_UNPOOLED`): conexion directa para migraciones Prisma

### Modelo de datos

#### Infraestructura multi-tenant

```
Tenant                          User
├── id (UUID, PK)               ├── id (UUID, PK)
├── name                        ├── tenantId (UUID, FK → Tenant, nullable)
├── slug (unique)               ├── firebaseUid (unique)
├── plan ("free"|"pro"|"enterprise") ├── email
├── settings (JSON)             ├── name (nullable)
├── apiKeysEncrypted (JSON)     ├── role ("superadmin"|"owner"|"admin"|"analyst"|"viewer")
├── active (Boolean)            ├── approved (Boolean, default: false)
└── createdAt                   ├── approvedAt, approvedBy (nullable)
                                ├── permissions (JSON)
                                └── createdAt
```

#### Gestion de leads

```
LeadTracking                    LeadEventHistory
├── leadId (String, PK)         ├── eventId (UUID, PK)
├── tenantId (FK)               ├── tenantId (FK)
├── nombreLead                  ├── leadId (FK → LeadTracking)
├── fuente                      ├── idTipoEvento (FK → CatTipoEvento)
├── fechaCreacion               ├── actorIntervencion ("IA"|"HUMANO")
└── idEstado (FK → CatEstadoGestion) ├── descripcion
                                └── timestamp

CitaAgendada                    CatEstadoGestion (global)
├── idCita (UUID, PK)           ├── id (auto-increment, PK)
├── tenantId (FK)               ├── nombre
├── leadId (FK)                 └── color
├── horaAgenda
├── canal                       CatTipoEvento (global)
└── idGoogleCalendar (nullable) ├── id (auto-increment, PK)
                                └── nombre
```

#### Metricas y rendimiento de ads

```
MetricsAdPerformance            AdPerformanceDetail
├── id (UUID, PK)               ├── adId (String, PK)
├── tenantId (FK)               ├── tenantId (FK)
├── timestamp                   ├── nombreCreativo
├── fuenteId ("Meta"|"Google")  ├── cplActual, trend
├── gastoIntervalo              ├── presupuestoActual
├── convIntervalo               └── estadoIa ("winner"|"loser"|"paused")
└── adAccountId (nullable)

BudgetRecommendation            MetricsRoasHistory
├── id (UUID, PK)               ├── id (UUID, PK)
├── tenantId (FK)               ├── tenantId (FK)
├── adId (FK → AdPerformanceDetail) ├── fecha (Date)
├── presupuestoSugerido         ├── fuente
├── ahorroDetectado             ├── roasDiario
└── fechaCalculo                └── umbralCorte
```

#### Inteligencia y proyecciones

```
IaFugaDiagnostico               IaContentHook
├── id (UUID, PK)               ├── hookId (UUID, PK)
├── tenantId (FK)               ├── tenantId (FK)
├── categoriaFuga               ├── contenido, categoria
├── frecuenciaPorcentaje        ├── scoreProbabilidad (Int)
├── impactoNegocio              ├── briefVisual (JSON, nullable)
├── volumenLeads                └── createdAt
└── colorHex

VentasProyeccion                ConfigGuardian
├── pkId (String, PK)           ├── guardianId (String, PK)
├── tenantId (FK)               ├── tenantId (FK)
├── fecha (Date)                ├── nombre
├── ventasReales                ├── estaActivo (Boolean)
├── ventasProyectadas           ├── ultimaActivacion
├── metaMensual                 └── usuarioCambio
└── fuente
```

### Row-Level Security (RLS)

Todas las tablas con `tenantId` tienen politicas RLS que filtran por `app.current_tenant_id`. Tablas exentas (globales): `CatTipoEvento`, `CatEstadoGestion`, `Tenant`, `User`.

El cliente Prisma usa un middleware que inyecta automaticamente `tenantId` en todas las queries (WHERE) y creaciones (CREATE).

### Convenciones de nombrado

| Contexto | Convencion | Ejemplo |
|----------|-----------|---------|
| Tablas en PostgreSQL | snake_case via `@@map()` | `leads_tracking` |
| Columnas en PostgreSQL | snake_case via `@map()` | `nombre_lead` |
| Modelos en Prisma/TS | PascalCase / camelCase | `LeadTracking.nombreLead` |

---

## 4. API REST

### Servidor

- **Framework**: Hono sobre Node.js (`@hono/node-server`)
- **Puerto**: 3001 (dev), 8080 (Docker/Cloud Run)
- **CORS**: `localhost:5173`, `rolia-92d5d.web.app`, `rolia-92d5d.firebaseapp.com`

### Cadena de middleware

```
Request
  → cors()
  → logger()
  → [authMiddleware]     → Verifica Firebase token → sets authUser
  → [tenantMiddleware]   → Busca user en DB, valida aprobacion → sets user, tenantId
  → [superadminMiddleware] → Valida role === "superadmin" (solo /admin)
  → Route handler
```

### Endpoints

#### Publicos

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/health` | Health check |

#### Auth (`/auth/*`) — sin tenant middleware

| Metodo | Ruta | Auth | Descripcion |
|--------|------|------|-------------|
| POST | `/auth/register` | Token Firebase (inline) | Crea tenant + usuario owner |
| POST | `/auth/verify-email` | authMiddleware | Verifica estado de email en Firebase |
| GET | `/auth/status` | authMiddleware | Status de registro, verificacion y aprobacion |

#### Admin (`/admin/*`) — auth + tenant + superadmin

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/admin/pending-users` | Lista usuarios pendientes de aprobacion |
| POST | `/admin/users/:id/approve` | Aprueba un usuario |
| POST | `/admin/users/:id/reject` | Rechaza usuario (desactiva tenant + elimina user) |
| GET | `/admin/tenants` | Lista todos los tenants con conteo de usuarios |

#### Intel (`/api/intel/*`) — auth + tenant

| Metodo | Ruta | Descripcion | Datos clave |
|--------|------|-------------|-------------|
| GET | `/api/me` | Perfil del usuario autenticado | user object |
| GET | `/api/intel/kpi` | KPIs principales | capitalAtRisk, tiempos de respuesta humano/IA |
| GET | `/api/intel/cpa-realtime` | CPA en intervalos de 10 min (ultimas 5h) | Gasto y conversiones Meta/Google |
| GET | `/api/intel/abandonment` | Leads sin actividad reciente (top 6) | waitMs vs maxMs (umbral 900s) |
| GET | `/api/intel/optimizer` | Creativos con recomendaciones de budget | cpl, trend, status, presupuesto sugerido |
| GET | `/api/intel/scheduling` | Citas agendadas para hoy | lead, hora, canal, estado, agente |
| GET | `/api/intel/leak-diagnosis` | Categorias de fuga de conversion | frecuencia%, impacto, color hex |
| GET | `/api/intel/copywriter` | Hooks de contenido + brief de diseno | hooks con score, angulo, sentimiento |
| GET | `/api/intel/roas-trend` | ROAS 7 dias por fuente | dia, meta, google, threshold |
| GET | `/api/intel/goal-predictor` | Proyeccion de ventas (regresion lineal) | monthlyGoal, puntos actual/forecast |
| GET | `/api/intel/roas-guardian` | ROAS diario promedio vs umbral (7 dias) | points, threshold, belowThreshold |
| GET | `/api/intel/activity-feed` | Ultimos 20 eventos de leads | time, message, type |
| GET | `/api/intel/rescue-history` | Top 5 leads con tiempos de respuesta | time, human (min), aura (IA) |

---

## 5. Frontend (SPA)

### Rutas y navegacion

El routing es condicional segun `authStatus` del store de Zustand:

| Estado | Rutas disponibles | Pagina |
|--------|-------------------|--------|
| `unauthenticated` | `/login`, `/register` | Login / Registro |
| `pending_verification` | `/verify-email` | Verificacion de email |
| `pending_approval` | `/pending-approval` | Esperando aprobacion |
| `active` | `/dashboard` | Dashboard principal |
| `superadmin` | `/dashboard`, `/admin/*` | Dashboard + Panel admin |

**Rutas admin:**
- `/admin/pending-users` — Aprobar/rechazar usuarios
- `/admin/tenants` — Ver todos los tenants

### Componentes del dashboard

El dashboard esta organizado en modulos de inteligencia:

#### KPIs (header)
- `kpi-cards.tsx` — Capital en riesgo, tiempo respuesta humano, tiempo respuesta IA

#### Reportes descriptivos (tiempo real)
- `intel-cpa-realtime.tsx` — Grafico CPA en tiempo real (Meta vs Google)
- `intel-abandonment.tsx` — Metricas de abandono de leads
- `intel-optimizer.tsx` — Recomendaciones de optimizacion de ads
- `intel-scheduling.tsx` — Citas agendadas del dia

#### Reportes de diagnostico
- `intel-leak-diagnosis.tsx` — Analisis de fugas de conversion
- `intel-copywriter.tsx` — Performance de copy y hooks
- `intel-roas-trend.tsx` — Tendencia de ROAS 7 dias

#### Reportes predictivos
- `intel-goal-predictor.tsx` — Proyeccion de ventas con regresion lineal

#### Guardianes estrategicos
- `guardian-cards.tsx` — G3 Copywriter, G4 Predictivo, G5 Auditor, G6 Optimizer, G7 Scheduler

#### Guardianes operativos
- `sla-tracker.tsx` — G1 Monitoreo SLA (automatizacion respuesta leads)
- `roas-guardian.tsx` — G2 Proteccion ROAS
- `activity-feed.tsx` — Feed de actividad en tiempo real
- `rescue-history.tsx` — Historial de rescate de leads

#### Configuracion
- `guardian-config.tsx` — Configuracion SLA, estados criticos, doble-touch
- `security-vault.tsx` — Almacenamiento de credenciales encriptadas

### Estado (Zustand)

Un unico store: `auth-store.ts`

```typescript
// State
authStatus: "loading" | "unauthenticated" | "pending_verification" | "pending_approval" | "active" | "superadmin"
firebaseUser: FirebaseUser | null
user: AppUser | null
token: string | null

// Actions
login(email, password)
logout()
register(email, password, tenantName, tenantSlug)
verifyEmail()
resendVerification()
checkStatus()
init()  // listener onAuthStateChanged
```

### Hook de datos: `useIntelFetch<T>`

```typescript
useIntelFetch<T>(path: string, defaultValue: T)
// → { data: T; loading: boolean }
// Usa token del store, soporta cancelacion, valor default como fallback
```

### Sistema de diseno

- **Tema**: Solo dark mode
- **Fuente**: Geist (sans) + Geist Mono
- **Colores principales**:
  - Background: `#09090b`
  - Primary/Aura: `#a855f7` (purple)
  - Rescue: `#22c55e` (green)
  - Alert: `#ef4444` (red)
  - Warning: `#f59e0b` (amber)
- **Componentes**: shadcn/ui estilo "new-york", base color "zinc"
- **Responsive**: mobile-first con breakpoints sm/md/lg

---

## 6. Autenticacion y Autorizacion

### Flujo completo

```
1. Usuario se registra en frontend
   → Firebase Auth crea cuenta (email/password)
   → Frontend llama POST /auth/register con token
   → Backend crea Tenant + User (approved: false)
   → Se envia email de verificacion

2. Usuario verifica email
   → Click en link de Firebase
   → Frontend llama POST /auth/verify-email
   → Backend confirma con Firebase Admin

3. Admin aprueba usuario
   → Superadmin ve en /admin/pending-users
   → POST /admin/users/:id/approve
   → User.approved = true

4. Usuario accede al dashboard
   → GET /auth/status retorna approved + role
   → Frontend navega a /dashboard
```

### Jerarquia de roles

| Rol | Nivel | Permisos |
|-----|-------|----------|
| `superadmin` | 5 | Todo + panel admin |
| `owner` | 4 | Todo en su tenant |
| `admin` | 3 | Gestion de usuarios |
| `analyst` | 2 | Lectura de reportes |
| `viewer` | 1 | Solo lectura basica |

La funcion `hasPermission(userRole, requiredRole)` compara niveles numericos.

### Paquete compartido (@rol-ia/shared)

Exporta tipos, validadores Zod y constantes usados por web y api:

- **Types**: `Tenant`, `User`, `UserRole`, `AuthContext`
- **Validators**: `loginSchema`, `registerSchema`, `inviteUserSchema`
- **Constants**: `ROLE_HIERARCHY`, `hasPermission()`

---

## 7. Deploy y CI/CD

### Frontend → Firebase Hosting

```bash
pnpm deploy:web   # Equivale a: pnpm --filter web build && cd apps/web && firebase deploy
```

- Build: `tsc -b && vite build` → genera `dist/`
- Hosting: Firebase sirve `dist/` con SPA rewrites
- Cache: assets estaticos (js, css, svg, woff2) cacheados 1 ano (immutable)

### Backend → Google Cloud Run

**Dockerfile** (multi-stage, `node:22-slim`):

```
Stage 1 (build):
  → Habilita pnpm via corepack
  → Instala dependencias (frozen lockfile)
  → prisma generate + tsc → genera dist/

Stage 2 (runtime):
  → Copia dist/ y node_modules/
  → PORT=8080
  → CMD: node dist/index.js
```

Deploy manual via `gcloud` CLI o consola de Google Cloud.

### CI/CD

No hay pipeline automatizado configurado (sin GitHub Actions ni Cloud Build). Los deploys son **manuales**.

---

## 8. Variables de Entorno

### `apps/api/.env`

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` | Connection string PostgreSQL pooled (PgBouncer, para API) |
| `DATABASE_URL_UNPOOLED` | Connection string directa (para migraciones Prisma) |
| `FIREBASE_PROJECT_ID` | ID proyecto Firebase (verificacion de tokens) |
| `PORT` | Puerto del servidor (3001 dev, 8080 produccion) |

### `apps/web/.env`

| Variable | Uso |
|----------|-----|
| `VITE_FIREBASE_API_KEY` | API key de Firebase |
| `VITE_FIREBASE_AUTH_DOMAIN` | Dominio de auth Firebase |
| `VITE_FIREBASE_PROJECT_ID` | ID proyecto Firebase |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket de storage |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID FCM |
| `VITE_FIREBASE_APP_ID` | App ID Firebase |
| `VITE_API_URL` | URL del API (dev: `http://localhost:3001`) |

---

## 9. Desarrollo Local

### Requisitos

- Node.js 20+
- pnpm 9.15+
- Acceso a Neon PostgreSQL (o instancia local)
- Proyecto Firebase configurado

### Comandos

```bash
pnpm install              # Instalar dependencias de todo el monorepo
pnpm dev                  # Inicia web (5173) + api (3001) via Turborepo
pnpm build                # Build de produccion
pnpm db:migrate           # Prisma migrate dev (usa DATABASE_URL_UNPOOLED)
pnpm db:generate          # Genera Prisma client
pnpm db:studio            # Abre Prisma Studio (GUI)
pnpm --filter api db:seed # Seed de datos demo
```

### Proxy en desarrollo

Vite proxea `/api/*` a `http://localhost:3001` automaticamente, por lo que el frontend no necesita `VITE_API_URL` en dev.

### Datos de seed

| Entidad | Cantidad | Detalle |
|---------|----------|---------|
| Tenant | 1 | "Rol Demo" (plan pro) — ID: `75c003f2-...` |
| User | 1 | `admin@rol.ia` / `Admin123!` (superadmin) |
| CatEstadoGestion | 5 | Nuevo, Contactado, En proceso, Cerrado, Perdido |
| CatTipoEvento | 5 | Lead ingreso, Llamada, WhatsApp, Email, Cita |
| ConfigGuardian | 7 | G1-G7 (leads, follow-up, WhatsApp, citas, budget, ROAS, content) |
| LeadTracking | 6 | L-001 a L-006 |
| LeadEventHistory | 12 | 2 eventos por lead (IA + HUMANO) |
| CitaAgendada | 5 | Distribuidas 30-270 min adelante |
| MetricsAdPerformance | 30 | Intervalos 10 min, ultimas 5 horas |
| AdPerformanceDetail | 5 | AD-001 a AD-005 |
| BudgetRecommendation | 5 | Una por ad creativo |
| IaFugaDiagnostico | 8 | Categorias de fuga |
| IaContentHook | 3 | Hooks con scores 78-92 |
| MetricsRoasHistory | 14 | 7 dias x 2 fuentes (Meta/Google) |
| VentasProyeccion | 8 | Dias 1-22 del mes, meta 120 |

> El seed es **idempotente**: borra y recrea todos los datos del tenant demo. Los timestamps son relativos a `now` para caer dentro de las ventanas de consulta de los endpoints.
