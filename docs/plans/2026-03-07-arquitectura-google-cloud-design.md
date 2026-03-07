# Rol.IA — Diseno de Arquitectura Google Cloud

**Fecha:** 2026-03-07
**Estado:** Aprobado

---

## Resumen Ejecutivo

Migrar Rol.IA de un prototipo Next.js (100% client-side, datos hardcodeados) a una plataforma SaaS empresarial multi-tenant desplegada en Google Cloud con costo inicial $0/mes.

### Stack Final

| Capa | Tecnologia | Servicio |
|---|---|---|
| Frontend | React + Vite | Firebase Hosting (CDN gratis) |
| API | Hono + Node.js | Cloud Run (free tier) |
| Base de datos | PostgreSQL 17 + Prisma | Neon (free tier) -> Cloud SQL (produccion) |
| Cache / Real-time | Redis | Upstash (free tier) -> Memorystore (produccion) |
| Auth | Firebase Authentication | Free hasta 10K MAU |
| Secrets | Google Secret Manager | Free (6 versions) |
| Workers | Cloud Scheduler + Cloud Run | Free (3 jobs) |
| CI/CD | Cloud Build | Free (120 min/dia) |
| Monorepo | pnpm workspaces + Turborepo | — |

---

## 1. Estructura del Proyecto (Monorepo)

```
rol-ia/
├── apps/
│   ├── web/                    <- React + Vite (frontend)
│   │   ├── src/
│   │   │   ├── components/     <- Componentes migrados de Next.js
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── pages/          <- React Router (login, dashboard, settings)
│   │   │   ├── stores/         <- Zustand (estado global)
│   │   │   ├── services/       <- API client (fetch wrappers)
│   │   │   └── types/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── api/                    <- Hono (backend)
│       ├── src/
│       │   ├── routes/         <- Endpoints por dominio
│       │   │   ├── auth.ts
│       │   │   ├── leads.ts
│       │   │   ├── campaigns.ts
│       │   │   ├── guardians.ts
│       │   │   └── reports.ts
│       │   ├── middleware/     <- Auth, tenant isolation, logging
│       │   ├── services/      <- Logica de negocio
│       │   ├── integrations/  <- Google Ads, Meta, CRM, WhatsApp
│       │   ├── db/
│       │   │   ├── schema.ts  <- Prisma schema
│       │   │   └── migrations/
│       │   ├── realtime/      <- SSE handlers
│       │   └── index.ts
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   └── shared/                <- Tipos, constantes, validaciones (Zod)
│       ├── types/
│       ├── validators/
│       └── constants/
│
├── infra/                     <- Cloud Build configs
│   └── cloudbuild.yaml
│
├── package.json               <- Workspaces root (pnpm)
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 2. Base de Datos — Multi-tenant con PostgreSQL + RLS

### Tablas de Infraestructura

**tenants**
- id (PK, UUID), name, slug, plan, settings (JSONB), api_keys_encrypted, active, created_at

**users**
- id (PK, UUID), tenant_id (FK), firebase_uid, email, role (owner/admin/analyst/viewer), permissions (JSONB)

### Tablas de Guardianes

**config_guardianes**
- guardian_id (PK), tenant_id, nombre, esta_activo (BOOL), ultima_activacion, usuario_cambio

**leads_event_history** (Auditoria Forense)
- event_id (PK), tenant_id, lead_id (FK), id_tipo_evento (FK), actor_intervencion (IA/HUMANO), descripcion, timestamp

**cat_tipos_evento** — Catalogo de tipos de evento
**cat_estados_gestion** — Catalogo de estados (nombre, color)

### Tablas de Leads

**leads_tracking** (Operativa)
- lead_id (PK), tenant_id, nombre_lead, fuente (Meta/Google/Organico), fecha_creacion, id_estado (FK)

**citas_agendadas**
- id_cita (PK), tenant_id, lead_id (FK), hora_agenda, canal (Voz/WhatsApp), id_google_calendar

### Tablas de Metricas (Time-Series)

**metrics_ad_performance** (cada 15 min)
- id (PK), tenant_id, timestamp, fuente_id (META_ADS/GOOGLE_ADS), gasto_intervalo (FLOAT), conv_intervalo (INT), ad_account_id

**ad_performance_detail** (por creativo)
- ad_id (PK), tenant_id, nombre_creativo, cpl_actual (FLOAT), trend (Baja/Sube/Est), presupuesto_actual (FLOAT), estado_ia (Ganador/Perdedor/Pausado)

**budget_recommendations**
- id (PK), tenant_id, ad_id (FK), presupuesto_sugerido (FLOAT), ahorro_detectado (FLOAT), fecha_calculo

### Tablas de Diagnosticos

**ia_fuga_diagnostico**
- id (PK), tenant_id, categoria_fuga, frecuencia_porcentaje (FLOAT), impacto_negocio (FLOAT), volumen_leads (INT), color_hex

**ia_content_hooks**
- hook_id (PK), tenant_id, contenido (TEXT), categoria, score_probabilidad (INT), brief_visual (JSON), created_at

**metrics_roas_history**
- id (PK), tenant_id, fecha (DATE), fuente (Meta/Google), roas_diario (FLOAT), umbral_corte (FLOAT)

### Tablas de Predictivos

**ventas_proyecciones**
- pk_id (PK, CONCAT(fuente, '_', id_externo)), tenant_id, fecha (DATE), ventas_reales (INT), ventas_proyectadas (FLOAT), meta_mensual (INT), fuente

### Row-Level Security

Todas las tablas con tenant_id tienen RLS policy:
```sql
SET app.current_tenant_id = 'tenant-uuid';
POLICY tenant_isolation USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
```

El middleware de Prisma inyecta tenant_id en cada query automaticamente.

### Roles

| Rol | Permisos |
|---|---|
| owner | Todo + billing + gestion de usuarios |
| admin | Configuracion guardianes + credenciales vault |
| analyst | Ver reportes + intel panels |
| viewer | Solo lectura de dashboards |

---

## 3. Data Pipeline e Integraciones

### Workers Programados (Pull — Cloud Scheduler -> Cloud Run)

| Worker | Frecuencia | Accion |
|---|---|---|
| Worker 1: Gasto Ads | cada 15 min | Meta/Google Ads API -> metrics_ad_performance |
| Worker 2: Performance Creativo | cada 1-2 hrs | Clasificacion IA (Ganador/Perdedor/Pausado) -> ad_performance_detail + budget_recommendations |
| Worker 3+4: ROAS + Forecast | cada 24 hrs | Calculo ROAS -> metrics_roas_history, ML forecast -> ventas_proyecciones |

**Logica de clasificacion (Worker 2):**
- Ganador: CPL < (CPL_Global x 0.8) — 20% mas barato que promedio
- Perdedor: CPL > (CPL_Global x 1.3) — 30% mas caro que promedio
- Pausado: Gasto > 0, Conversiones = 0 en 48h
- Bolsa Reasignable = Suma(Presupuesto Perdedores) + Suma(Presupuesto Pausados)

### Webhooks (Push — Cloud Run endpoints publicos)

- `POST /webhooks/leads` — Clientify / Meta Lead Ads -> leads_tracking + conv_intervalo + SSE
- `POST /webhooks/lead-status` — CRM status change -> leads_tracking + leads_event_history

### Real-time (SSE)

- `GET /api/stream/dashboard` — Bearer token + tenant_id
- Eventos: lead:new, lead:rescued, campaign:paused, metrics:update, alert:sla
- Canal aislado por tenant via Redis pub/sub (Upstash)

### Credenciales (Secret Manager, por tenant)

- Meta: App ID, App Secret, System User Access Token (ads_read)
- Google Ads: Developer Token, Client ID/Secret, Refresh Token
- CRM: API key (Clientify/HubSpot/Salesforce)
- WhatsApp: Business API Token

---

## 4. Autenticacion y Seguridad

### Flujo de Login

1. Frontend envia email + password a Firebase Auth
2. Firebase devuelve ID Token (JWT firmado por Google)
3. Frontend envia JWT en header Authorization a la API
4. API middleware: verifica JWT -> extrae firebase_uid -> busca user -> obtiene tenant_id -> SET RLS -> adjunta user al request
5. PostgreSQL RLS filtra datos automaticamente por tenant

### 4 Capas de Seguridad

1. **Firebase Auth** — JWT firmado, brute force protection, MFA-ready, SSO-ready
2. **API Middleware (Hono)** — Valida JWT, rate limiting por tenant, CORS, logs auditoria
3. **PostgreSQL RLS** — Filtrado automatico por tenant_id (ultimo muro de defensa)
4. **Secret Manager** — API keys encriptadas por Google, acceso solo via IAM

### Permisos por Rol

| Endpoint | owner | admin | analyst | viewer |
|---|---|---|---|---|
| GET /reports/* | si | si | si | si |
| GET /guardians/* | si | si | si | si |
| POST /guardians/toggle | si | si | no | no |
| PUT /config/* | si | si | no | no |
| POST /vault/secrets | si | si | no | no |
| POST /users/invite | si | no | no | no |
| PUT /tenant/settings | si | no | no | no |
| DELETE /users/* | si | no | no | no |

---

## 5. Infraestructura Google Cloud (MVP — $0/mes)

| Servicio | Tier | Costo |
|---|---|---|
| Firebase Hosting + CDN | Free (10GB, 360MB/dia) | $0 |
| Cloud Run (API) | Free (2M req/mes) | $0 |
| Neon PostgreSQL | Free (512MB) | $0 |
| Upstash Redis | Free (10K cmd/dia) | $0 |
| Firebase Auth | Free (10K MAU) | $0 |
| Cloud Scheduler | Free (3 jobs) | $0 |
| Secret Manager | Free (6 versions) | $0 |
| Cloud Build | Free (120 min/dia) | $0 |
| **Total** | | **$0/mes** |

### Path de Escalamiento

| Fase | Cambio | Costo |
|---|---|---|
| MVP | Neon free + Upstash free | $0 |
| Growth | Neon Pro + Upstash Pro | ~$30/mes |
| Scale | Cloud SQL + Memorystore + LB | ~$110-160/mes |

Migracion: solo cambiar connection strings en Secret Manager. Zero cambios de codigo.

---

## 6. Migracion Next.js -> React + Vite

### Lo que NO cambia (cero esfuerzo)
- 22 componentes custom + 60 componentes shadcn/ui
- Tailwind CSS 4, Framer Motion, Recharts, Zod, React Hook Form
- Hooks, estilos globals.css

### Lo que cambia
- Eliminar: next.config.mjs, app/layout.tsx, app/page.tsx, @vercel/analytics, "use client"
- Agregar: vite.config.ts, index.html, src/main.tsx, src/router.tsx (React Router)
- Routing: tabs internos -> rutas reales (/login, /dashboard, /dashboard/guardians, /dashboard/settings)

### Rendimiento esperado

| Metrica | Next.js (actual) | Vite (nuevo) |
|---|---|---|
| Dev server startup | ~3-5s | ~300ms |
| Build production | ~30-60s | ~3-5s |
| Bundle size (gzip) | ~350KB+ | ~200KB |
| Hot reload | ~1-2s | ~50ms |

---

## 7. CI/CD (Cloud Build)

```
Push a main -> Build paralelo:
  ├── apps/web  -> vite build -> upload Firebase Hosting
  └── apps/api  -> docker build -> deploy Cloud Run

Push a develop -> Solo build + tests (no deploy)
```

---

## 8. Fases de Implementacion

| Fase | Que incluye | Resultado |
|---|---|---|
| Fase 1 | Monorepo + migracion Vite + API base + Auth + DB schema | App funcional con login real y estructura lista |
| Fase 2 | Conectar dashboard a datos reales (API endpoints + SSE) | Dashboard con datos de PostgreSQL en vivo |
| Fase 3 | Workers de integracion (Meta, Google Ads, CRM) | Data pipeline alimentando metricas reales |
| Fase 4 | Deploy a Google Cloud + CI/CD | App en produccion con dominio propio |
| Fase 5 | WhatsApp, ML forecasting, onboarding multi-tenant | Plataforma SaaS completa |
