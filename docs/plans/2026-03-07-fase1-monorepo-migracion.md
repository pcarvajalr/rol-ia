# Fase 1: Monorepo + Migracion Vite + API Base + Auth + DB Schema

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transformar el prototipo Next.js en un monorepo con frontend React+Vite, API Hono, PostgreSQL con Prisma, y autenticacion Firebase — todo funcional en local.

**Architecture:** Monorepo con pnpm workspaces y Turborepo. Frontend en apps/web (React+Vite+React Router), API en apps/api (Hono+Prisma), tipos compartidos en packages/shared. Auth via Firebase con JWT, DB en Neon PostgreSQL con RLS multi-tenant.

**Tech Stack:** React 19, Vite 6, Hono, Prisma, PostgreSQL (Neon), Firebase Auth, Zustand, React Router 7, Zod, pnpm, Turborepo

---

## Task 1: Inicializar Monorepo

**Files:**
- Create: `package.json` (root — reescribir)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.npmrc`

**Step 1: Inicializar estructura pnpm workspaces**

Desde la raiz del proyecto, crear el package.json root:

```json
{
  "name": "rol-ia",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "db:migrate": "pnpm --filter api db:migrate",
    "db:generate": "pnpm --filter api db:generate",
    "db:studio": "pnpm --filter api db:studio"
  },
  "devDependencies": {
    "turbo": "^2"
  },
  "packageManager": "pnpm@9.15.0"
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    }
  }
}
```

```ini
# .npmrc
auto-install-peers=true
strict-peer-dependencies=false
```

**Step 2: Verificar que pnpm reconoce los workspaces**

Run: `pnpm install`
Expected: Instala turbo sin errores

**Step 3: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .npmrc
git commit -m "chore: initialize pnpm monorepo with turborepo"
```

---

## Task 2: Crear packages/shared (tipos y validaciones)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types/tenant.ts`
- Create: `packages/shared/src/types/user.ts`
- Create: `packages/shared/src/types/index.ts`
- Create: `packages/shared/src/validators/auth.ts`
- Create: `packages/shared/src/validators/index.ts`
- Create: `packages/shared/src/constants/roles.ts`
- Create: `packages/shared/src/constants/index.ts`

**Step 1: Crear package.json de shared**

```json
{
  "name": "@rol-ia/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "typescript": "^5.7.3"
  }
}
```

**Step 2: Crear tipos base**

```typescript
// packages/shared/src/types/tenant.ts
export interface Tenant {
  id: string
  name: string
  slug: string
  plan: "free" | "pro" | "enterprise"
  settings: Record<string, unknown>
  active: boolean
  createdAt: Date
}
```

```typescript
// packages/shared/src/types/user.ts
export type UserRole = "owner" | "admin" | "analyst" | "viewer"

export interface User {
  id: string
  tenantId: string
  firebaseUid: string
  email: string
  role: UserRole
  permissions: Record<string, boolean>
}

export interface AuthContext {
  user: User
  tenantId: string
}
```

```typescript
// packages/shared/src/types/index.ts
export * from "./tenant"
export * from "./user"
```

**Step 3: Crear validadores Zod**

```typescript
// packages/shared/src/validators/auth.ts
import { z } from "zod"

export const loginSchema = z.object({
  email: z.string().email("Email invalido"),
  password: z.string().min(6, "Minimo 6 caracteres"),
})

export const inviteUserSchema = z.object({
  email: z.string().email("Email invalido"),
  role: z.enum(["admin", "analyst", "viewer"]),
})

export type LoginInput = z.infer<typeof loginSchema>
export type InviteUserInput = z.infer<typeof inviteUserSchema>
```

```typescript
// packages/shared/src/validators/index.ts
export * from "./auth"
```

**Step 4: Crear constantes**

```typescript
// packages/shared/src/constants/roles.ts
import type { UserRole } from "../types/user"

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 4,
  admin: 3,
  analyst: 2,
  viewer: 1,
}

export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}
```

```typescript
// packages/shared/src/constants/index.ts
export * from "./roles"
```

```typescript
// packages/shared/src/index.ts
export * from "./types"
export * from "./validators"
export * from "./constants"
```

**Step 5: Crear tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

**Step 6: Instalar dependencias y verificar**

Run: `pnpm install && pnpm --filter @rol-ia/shared lint`
Expected: Sin errores de TypeScript

---

## Task 3: Crear apps/api (Hono + Prisma)

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/.env.example`
- Create: `apps/api/.env`
- Create: `apps/api/Dockerfile`

**Step 1: Crear package.json de la API**

```json
{
  "name": "api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "tsc --noEmit",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "@prisma/client": "^6.4.0",
    "hono": "^4.7.0",
    "firebase-admin": "^13.0.0",
    "@rol-ia/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22",
    "prisma": "^6.4.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.3"
  }
}
```

**Step 2: Crear servidor Hono minimo**

```typescript
// apps/api/src/index.ts
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"

const app = new Hono()

app.use("*", logger())
app.use("*", cors({
  origin: ["http://localhost:5173"],
  credentials: true,
}))

app.get("/", (c) => c.json({ status: "ok", service: "rol-ia-api" }))

app.get("/health", (c) => c.json({ status: "healthy", timestamp: new Date().toISOString() }))

const port = Number(process.env.PORT) || 3001
console.log(`API running on http://localhost:${port}`)

serve({ fetch: app.fetch, port })

export default app
```

**Step 3: Crear .env.example y .env**

```bash
# apps/api/.env.example
DATABASE_URL="postgresql://user:pass@host/dbname?sslmode=require"
FIREBASE_PROJECT_ID="your-project-id"
PORT=3001
```

Mover el `.env` de la raiz del proyecto a `apps/api/.env` y agregar las variables faltantes:

```bash
mv .env apps/api/.env
```

Luego agregar al final de `apps/api/.env`:

```bash
FIREBASE_PROJECT_ID=rolia-92d5d
PORT=3001
```

Nota: Las credenciales de Neon ya estan configuradas (sa-east-1, Sao Paulo). Usar `DATABASE_URL` (pooled) para Prisma queries y `DATABASE_URL_UNPOOLED` para migraciones.

**Step 4: Crear tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "paths": {
      "@rol-ia/shared": ["../../packages/shared/src"]
    }
  },
  "include": ["src"]
}
```

**Step 5: Crear Dockerfile**

```dockerfile
FROM node:22-slim AS base
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY packages/shared packages/shared
RUN pnpm --filter api build

FROM base AS runtime
WORKDIR /app
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./
COPY --from=build /app/node_modules ./node_modules
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

**Step 6: Instalar y verificar**

Run: `pnpm install && pnpm --filter api dev`
Expected: "API running on http://localhost:3001"

Run (en otra terminal): `curl http://localhost:3001/health`
Expected: `{"status":"healthy","timestamp":"..."}`

---

## Task 4: Prisma Schema + Migracion DB

**Files:**
- Create: `apps/api/prisma/schema.prisma`

**Prerequisito:** Neon ya configurado. La DATABASE_URL esta en `apps/api/.env` (movida en Task 3).

**Step 1: Crear schema Prisma completo**

```prisma
// apps/api/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// === INFRAESTRUCTURA MULTI-TENANT ===

model Tenant {
  id               String   @id @default(uuid()) @db.Uuid
  name             String
  slug             String   @unique
  plan             String   @default("free")
  settings         Json     @default("{}")
  apiKeysEncrypted Json?    @map("api_keys_encrypted")
  active           Boolean  @default(true)
  createdAt        DateTime @default(now()) @map("created_at")

  users              User[]
  configGuardianes   ConfigGuardian[]
  leadsTracking      LeadTracking[]
  leadsEventHistory  LeadEventHistory[]
  citasAgendadas     CitaAgendada[]
  metricsAdPerf      MetricsAdPerformance[]
  adPerfDetail       AdPerformanceDetail[]
  budgetRecs         BudgetRecommendation[]
  fugaDiagnostico    IaFugaDiagnostico[]
  contentHooks       IaContentHook[]
  roasHistory        MetricsRoasHistory[]
  ventasProyecciones VentasProyeccion[]

  @@map("tenants")
}

model User {
  id          String   @id @default(uuid()) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  firebaseUid String   @unique @map("firebase_uid")
  email       String
  role        String   @default("viewer")
  permissions Json     @default("{}")
  createdAt   DateTime @default(now()) @map("created_at")

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@map("users")
}

// === GUARDIANES ===

model ConfigGuardian {
  guardianId        String   @id @map("guardian_id")
  tenantId          String   @map("tenant_id") @db.Uuid
  nombre            String
  estaActivo        Boolean  @default(false) @map("esta_activo")
  ultimaActivacion  DateTime? @map("ultima_activacion")
  usuarioCambio     String?  @map("usuario_cambio")

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@map("config_guardianes")
}

model CatTipoEvento {
  id     Int    @id @default(autoincrement())
  nombre String

  eventos LeadEventHistory[]

  @@map("cat_tipos_evento")
}

model CatEstadoGestion {
  id     Int    @id @default(autoincrement())
  nombre String
  color  String?

  leads LeadTracking[]

  @@map("cat_estados_gestion")
}

// === LEADS ===

model LeadTracking {
  leadId        String   @id @map("lead_id")
  tenantId      String   @map("tenant_id") @db.Uuid
  nombreLead    String   @map("nombre_lead")
  fuente        String
  fechaCreacion DateTime @default(now()) @map("fecha_creacion")
  idEstado      Int?     @map("id_estado")

  tenant  Tenant            @relation(fields: [tenantId], references: [id])
  estado  CatEstadoGestion? @relation(fields: [idEstado], references: [id])
  eventos LeadEventHistory[]
  citas   CitaAgendada[]

  @@index([tenantId])
  @@index([tenantId, fechaCreacion])
  @@map("leads_tracking")
}

model LeadEventHistory {
  eventId            String   @id @default(uuid()) @map("event_id")
  tenantId           String   @map("tenant_id") @db.Uuid
  leadId             String   @map("lead_id")
  idTipoEvento       Int?     @map("id_tipo_evento")
  actorIntervencion  String   @map("actor_intervencion")
  descripcion        String?
  timestamp          DateTime @default(now())

  tenant     Tenant         @relation(fields: [tenantId], references: [id])
  lead       LeadTracking   @relation(fields: [leadId], references: [leadId])
  tipoEvento CatTipoEvento? @relation(fields: [idTipoEvento], references: [id])

  @@index([tenantId])
  @@index([leadId])
  @@map("leads_event_history")
}

model CitaAgendada {
  idCita           String   @id @default(uuid()) @map("id_cita")
  tenantId         String   @map("tenant_id") @db.Uuid
  leadId           String   @map("lead_id")
  horaAgenda       DateTime @map("hora_agenda")
  canal            String
  idGoogleCalendar String?  @map("id_google_calendar")

  tenant Tenant       @relation(fields: [tenantId], references: [id])
  lead   LeadTracking @relation(fields: [leadId], references: [leadId])

  @@index([tenantId])
  @@map("citas_agendadas")
}

// === METRICAS TIME-SERIES ===

model MetricsAdPerformance {
  id             String   @id @default(uuid()) @db.Uuid
  tenantId       String   @map("tenant_id") @db.Uuid
  timestamp      DateTime
  fuenteId       String   @map("fuente_id")
  gastoIntervalo Float    @map("gasto_intervalo")
  convIntervalo  Int      @default(0) @map("conv_intervalo")
  adAccountId    String?  @map("ad_account_id")

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([tenantId, timestamp])
  @@map("metrics_ad_performance")
}

model AdPerformanceDetail {
  adId              String @id @map("ad_id")
  tenantId          String @map("tenant_id") @db.Uuid
  nombreCreativo    String @map("nombre_creativo")
  cplActual         Float  @map("cpl_actual")
  trend             String
  presupuestoActual Float  @map("presupuesto_actual")
  estadoIa          String @map("estado_ia")

  tenant      Tenant                 @relation(fields: [tenantId], references: [id])
  budgetRecs  BudgetRecommendation[]

  @@index([tenantId])
  @@map("ad_performance_detail")
}

model BudgetRecommendation {
  id                  String   @id @default(uuid()) @db.Uuid
  tenantId            String   @map("tenant_id") @db.Uuid
  adId                String   @map("ad_id")
  presupuestoSugerido Float    @map("presupuesto_sugerido")
  ahorroDetectado     Float    @map("ahorro_detectado")
  fechaCalculo        DateTime @default(now()) @map("fecha_calculo")

  tenant Tenant              @relation(fields: [tenantId], references: [id])
  ad     AdPerformanceDetail @relation(fields: [adId], references: [adId])

  @@index([tenantId])
  @@map("budget_recommendations")
}

// === DIAGNOSTICOS ===

model IaFugaDiagnostico {
  id                   String @id @default(uuid()) @db.Uuid
  tenantId             String @map("tenant_id") @db.Uuid
  categoriaFuga        String @map("categoria_fuga")
  frecuenciaPorcentaje Float  @map("frecuencia_porcentaje")
  impactoNegocio       Float  @map("impacto_negocio")
  volumenLeads         Int    @map("volumen_leads")
  colorHex             String @map("color_hex")

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@map("ia_fuga_diagnostico")
}

model IaContentHook {
  hookId             String   @id @default(uuid()) @map("hook_id")
  tenantId           String   @map("tenant_id") @db.Uuid
  contenido          String
  categoria          String
  scoreProbabilidad  Int      @map("score_probabilidad")
  briefVisual        Json?    @map("brief_visual")
  createdAt          DateTime @default(now()) @map("created_at")

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@map("ia_content_hooks")
}

model MetricsRoasHistory {
  id          String   @id @default(uuid()) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  fecha       DateTime @db.Date
  fuente      String
  roasDiario  Float    @map("roas_diario")
  umbralCorte Float    @map("umbral_corte")

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([tenantId, fecha])
  @@map("metrics_roas_history")
}

// === PREDICTIVOS ===

model VentasProyeccion {
  pkId               String   @id @map("pk_id")
  tenantId           String   @map("tenant_id") @db.Uuid
  fecha              DateTime @db.Date
  ventasReales       Int      @default(0) @map("ventas_reales")
  ventasProyectadas  Float    @default(0) @map("ventas_proyectadas")
  metaMensual        Int      @default(0) @map("meta_mensual")
  fuente             String

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([tenantId, fecha])
  @@map("ventas_proyecciones")
}
```

**Step 2: Configurar Prisma para usar URL sin pooler en migraciones**

En `apps/api/prisma/schema.prisma`, el datasource debe usar la URL con pooler para queries pero la unpooled para migraciones:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_UNPOOLED")
}
```

**Step 3: Ejecutar migracion**

Run: `cd apps/api && pnpm db:generate && pnpm db:migrate --name init`
Expected: Prisma crea todas las tablas en Neon (sa-east-1). Output incluye "Your database is now in sync with your schema."

**Step 3: Verificar con Prisma Studio**

Run: `pnpm db:studio`
Expected: Abre browser con todas las tablas visibles y vacias.

---

## Task 5: RLS (Row-Level Security) en PostgreSQL

**Files:**
- Create: `apps/api/prisma/migrations/rls_policies.sql`
- Create: `apps/api/src/db/client.ts`

**Step 1: Crear SQL de RLS policies**

Este archivo se ejecuta manualmente despues de la migracion inicial de Prisma.

```sql
-- apps/api/prisma/migrations/rls_policies.sql

-- Habilitar RLS en todas las tablas con tenant_id
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_guardianes ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads_event_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE citas_agendadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_ad_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_performance_detail ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_fuga_diagnostico ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_content_hooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_roas_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_proyecciones ENABLE ROW LEVEL SECURITY;

-- Crear policies de aislamiento por tenant
-- Nota: Prisma usa un rol que es owner de las tablas, por lo que
-- RLS no aplica por defecto. Usamos middleware de Prisma como
-- capa primaria de aislamiento y RLS como red de seguridad
-- para queries directas o futuras conexiones externas.

CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_config_guardianes ON config_guardianes
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_leads_tracking ON leads_tracking
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_leads_event_history ON leads_event_history
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_citas_agendadas ON citas_agendadas
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_metrics_ad_performance ON metrics_ad_performance
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_ad_performance_detail ON ad_performance_detail
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_budget_recommendations ON budget_recommendations
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_ia_fuga_diagnostico ON ia_fuga_diagnostico
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_ia_content_hooks ON ia_content_hooks
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_metrics_roas_history ON metrics_roas_history
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_ventas_proyecciones ON ventas_proyecciones
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

**Step 2: Crear Prisma client con tenant isolation middleware**

```typescript
// apps/api/src/db/client.ts
import { PrismaClient } from "@prisma/client"

const globalPrisma = new PrismaClient()

export function createTenantClient(tenantId: string) {
  return globalPrisma.$extends({
    query: {
      $allOperations({ args, query, model }) {
        // Tablas sin tenant_id (catalogos globales)
        const globalTables = ["CatTipoEvento", "CatEstadoGestion", "Tenant"]
        if (model && globalTables.includes(model)) {
          return query(args)
        }

        // Inyectar tenant_id en WHERE para reads
        if ("where" in args) {
          args.where = { ...args.where, tenantId }
        }

        // Inyectar tenant_id en CREATE
        if ("data" in args) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: Record<string, unknown>) => ({ ...d, tenantId }))
          } else {
            args.data = { ...args.data, tenantId }
          }
        }

        return query(args)
      },
    },
  })
}

export { globalPrisma as prisma }
```

**Step 3: Ejecutar RLS SQL en Neon**

Run: `psql $DATABASE_URL -f apps/api/prisma/migrations/rls_policies.sql`
Expected: 12x "ALTER TABLE" + 12x "CREATE POLICY" sin errores.

Alternativa si no tienes psql: Usar la consola SQL de Neon (web) y pegar el contenido.

---

## Task 6: Middleware de Auth (Firebase Admin)

**Files:**
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/middleware/tenant.ts`
- Modify: `apps/api/src/index.ts`

**Prerequisito:** Firebase proyecto ya creado (rolia-92d5d). Habilitar Authentication > Sign-in method > Email/Password en la consola.

**Step 1: Crear middleware de auth**

```typescript
// apps/api/src/middleware/auth.ts
import { createMiddleware } from "hono/factory"
import admin from "firebase-admin"

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
  })
}

export interface AuthUser {
  firebaseUid: string
  email: string
}

export const authMiddleware = createMiddleware<{
  Variables: { authUser: AuthUser }
}>(async (c, next) => {
  const header = c.req.header("Authorization")
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Token requerido" }, 401)
  }

  const token = header.slice(7)

  try {
    const decoded = await admin.auth().verifyIdToken(token)
    c.set("authUser", {
      firebaseUid: decoded.uid,
      email: decoded.email ?? "",
    })
    await next()
  } catch {
    return c.json({ error: "Token invalido" }, 401)
  }
})
```

**Step 2: Crear middleware de tenant**

```typescript
// apps/api/src/middleware/tenant.ts
import { createMiddleware } from "hono/factory"
import { prisma } from "../db/client"
import type { AuthUser } from "./auth"
import type { User } from "@rol-ia/shared"

export const tenantMiddleware = createMiddleware<{
  Variables: {
    authUser: AuthUser
    user: User
    tenantId: string
  }
}>(async (c, next) => {
  const authUser = c.get("authUser")

  const user = await prisma.user.findUnique({
    where: { firebaseUid: authUser.firebaseUid },
  })

  if (!user) {
    return c.json({ error: "Usuario no registrado" }, 403)
  }

  c.set("user", {
    id: user.id,
    tenantId: user.tenantId,
    firebaseUid: user.firebaseUid,
    email: user.email,
    role: user.role as User["role"],
    permissions: user.permissions as Record<string, boolean>,
  })
  c.set("tenantId", user.tenantId)

  await next()
})
```

**Step 3: Actualizar index.ts con rutas protegidas**

```typescript
// apps/api/src/index.ts
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { authMiddleware } from "./middleware/auth"
import { tenantMiddleware } from "./middleware/tenant"

const app = new Hono()

app.use("*", logger())
app.use("*", cors({
  origin: ["http://localhost:5173"],
  credentials: true,
}))

// Rutas publicas
app.get("/health", (c) => c.json({ status: "healthy", timestamp: new Date().toISOString() }))

// Rutas protegidas
const api = new Hono()
api.use("*", authMiddleware)
api.use("*", tenantMiddleware)

api.get("/me", (c) => {
  const user = c.get("user")
  return c.json({ user })
})

app.route("/api", api)

const port = Number(process.env.PORT) || 3001
console.log(`API running on http://localhost:${port}`)

serve({ fetch: app.fetch, port })

export default app
```

**Step 4: Verificar que compila**

Run: `pnpm --filter api lint`
Expected: Sin errores de TypeScript

---

## Task 7: Crear apps/web (React + Vite)

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.app.json`
- Create: `apps/web/index.html`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/globals.css`
- Create: `apps/web/src/vite-env.d.ts`

**Step 1: Crear package.json**

```json
{
  "name": "web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.9.1",
    "@radix-ui/react-accordion": "1.2.12",
    "@radix-ui/react-alert-dialog": "1.1.15",
    "@radix-ui/react-aspect-ratio": "1.1.8",
    "@radix-ui/react-avatar": "1.1.11",
    "@radix-ui/react-checkbox": "1.3.3",
    "@radix-ui/react-collapsible": "1.1.12",
    "@radix-ui/react-context-menu": "2.2.16",
    "@radix-ui/react-dialog": "1.1.15",
    "@radix-ui/react-dropdown-menu": "2.1.16",
    "@radix-ui/react-hover-card": "1.1.15",
    "@radix-ui/react-label": "2.1.8",
    "@radix-ui/react-menubar": "1.1.16",
    "@radix-ui/react-navigation-menu": "1.2.14",
    "@radix-ui/react-popover": "1.1.15",
    "@radix-ui/react-progress": "1.1.8",
    "@radix-ui/react-radio-group": "1.3.8",
    "@radix-ui/react-scroll-area": "1.2.10",
    "@radix-ui/react-select": "2.2.6",
    "@radix-ui/react-separator": "1.1.8",
    "@radix-ui/react-slider": "1.3.6",
    "@radix-ui/react-slot": "1.2.4",
    "@radix-ui/react-switch": "1.2.6",
    "@radix-ui/react-tabs": "1.1.13",
    "@radix-ui/react-toast": "1.2.15",
    "@radix-ui/react-toggle": "1.1.10",
    "@radix-ui/react-toggle-group": "1.1.11",
    "@radix-ui/react-tooltip": "1.2.8",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "1.1.1",
    "date-fns": "4.1.0",
    "embla-carousel-react": "8.6.0",
    "firebase": "^11.3.0",
    "framer-motion": "^11.15.0",
    "input-otp": "1.4.2",
    "lucide-react": "^0.564.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-day-picker": "9.13.2",
    "react-hook-form": "^7.54.1",
    "react-resizable-panels": "^2.1.7",
    "react-router": "^7.3.0",
    "recharts": "2.15.0",
    "sonner": "^1.7.1",
    "tailwind-merge": "^3.3.1",
    "vaul": "^1.1.2",
    "zod": "^3.24.1",
    "zustand": "^5.0.0",
    "@rol-ia/shared": "workspace:*"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.2.0",
    "@tailwindcss/vite": "^4.2.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^4.4.0",
    "postcss": "^8.5",
    "tailwindcss": "^4.2.0",
    "tw-animate-css": "1.3.3",
    "typescript": "^5.7.3",
    "vite": "^6.2.0"
  }
}
```

**Step 2: Crear vite.config.ts**

```typescript
// apps/web/vite.config.ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
})
```

**Step 3: Crear index.html**

```html
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#09090b" />
    <title>Rol.IA - Centro de Comando</title>
  </head>
  <body class="font-sans antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 4: Crear main.tsx y App.tsx**

```typescript
// apps/web/src/main.tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"
import { App } from "./App"
import "./globals.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
```

```typescript
// apps/web/src/App.tsx
import { Routes, Route, Navigate } from "react-router"

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<div>Login (placeholder)</div>} />
      <Route path="/dashboard" element={<div>Dashboard (placeholder)</div>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
```

**Step 5: Copiar globals.css del proyecto actual**

Copiar el contenido de `app/globals.css` actual a `apps/web/src/globals.css`.

```typescript
// apps/web/src/vite-env.d.ts
/// <reference types="vite/client" />
```

**Step 6: Crear tsconfig**

```json
// apps/web/tsconfig.json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }]
}
```

```json
// apps/web/tsconfig.app.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

```javascript
// apps/web/postcss.config.mjs
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}
```

**Step 7: Instalar y verificar**

Run: `pnpm install && pnpm --filter web dev`
Expected: Vite server en http://localhost:5173, muestra "Login (placeholder)"

---

## Task 8: Migrar componentes al frontend Vite

**Files:**
- Copy: todos los archivos de `components/` -> `apps/web/src/components/`
- Copy: `hooks/` -> `apps/web/src/hooks/`
- Copy: `lib/` -> `apps/web/src/lib/`
- Copy: `styles/` -> `apps/web/src/styles/`

**Step 1: Copiar todos los archivos**

```bash
# Desde la raiz del monorepo
cp -r components/* apps/web/src/components/
cp -r hooks/* apps/web/src/hooks/
cp -r lib/* apps/web/src/lib/
mkdir -p apps/web/src/styles
cp styles/* apps/web/src/styles/ 2>/dev/null || true
```

**Step 2: Eliminar "use client" de todos los archivos**

En Vite no existe el concepto de "use client" (todo es client-side).

```bash
find apps/web/src -name "*.tsx" -exec sed -i '' '/"use client"/d' {} +
```

**Step 3: Verificar que compila**

Run: `pnpm --filter web build`
Expected: Build exitoso. Si hay errores de import de `next/font` o `next/...`, corregir en el paso siguiente.

---

## Task 9: Crear Router y Pages con componentes migrados

**Files:**
- Create: `apps/web/src/pages/LoginPage.tsx`
- Create: `apps/web/src/pages/DashboardPage.tsx`
- Modify: `apps/web/src/App.tsx`

**Step 1: Crear LoginPage**

Extraer el contenido de LoginScreen como pagina standalone:

```typescript
// apps/web/src/pages/LoginPage.tsx
import { useNavigate } from "react-router"
import { LoginScreen } from "@/components/login-screen"

export function LoginPage() {
  const navigate = useNavigate()

  return (
    <LoginScreen onAuthenticated={() => navigate("/dashboard")} />
  )
}
```

**Step 2: Crear DashboardPage**

Mover el contenido del Home actual (page.tsx) pero sin LoginScreen y sin AnimatePresence login/dashboard:

```typescript
// apps/web/src/pages/DashboardPage.tsx
import { useState } from "react"
import { motion } from "framer-motion"
// ... (copiar todos los imports del page.tsx actual excepto LoginScreen y AnimatePresence)
// Copiar los componentes ReportGroup y fadeIn del page.tsx actual
// Copiar el JSX del dashboard (todo lo que esta dentro del else del ternario authenticated)

export function DashboardPage() {
  const [demoMode, setDemoMode] = useState(false)
  const [slaMinutes, setSlaMinutes] = useState(7)
  const [criticalState, setCriticalState] = useState("cold-lead")
  const [doubleTouchMinutes, setDoubleTouchMinutes] = useState(2)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="bg-background text-foreground flex min-h-screen flex-col"
    >
      {/* Copiar header, main, y footer del page.tsx actual */}
      {/* ... todo el JSX del dashboard ... */}
    </motion.div>
  )
}
```

Nota: el contenido exacto se copia del `app/page.tsx` actual, lineas 159-435 (el bloque del dashboard).

**Step 3: Actualizar App.tsx con las rutas reales**

```typescript
// apps/web/src/App.tsx
import { Routes, Route, Navigate } from "react-router"
import { LoginPage } from "@/pages/LoginPage"
import { DashboardPage } from "@/pages/DashboardPage"

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
```

**Step 4: Verificar en browser**

Run: `pnpm --filter web dev`
Expected:
- http://localhost:5173/login muestra la pantalla de login
- Login con rol/tato/tato123 redirige a /dashboard
- http://localhost:5173/dashboard muestra el dashboard completo con todas las secciones

---

## Task 10: Firebase Auth en el Frontend

**Files:**
- Create: `apps/web/src/lib/firebase.ts`
- Create: `apps/web/src/stores/auth-store.ts`
- Modify: `apps/web/src/components/login-screen.tsx` (reemplazar hardcoded auth)
- Modify: `apps/web/src/App.tsx` (agregar auth guard)
- Create: `apps/web/.env`

**Prerequisito:** En Firebase Console, habilitar Authentication > Email/Password. Firebase ya configurado (proyecto: rolia-92d5d).

**Step 1: Crear config Firebase**

```bash
# apps/web/.env
VITE_FIREBASE_API_KEY=AIzaSyDVqr-MtzUSMN3peNBzhDNcvNENx3UpaZY
VITE_FIREBASE_AUTH_DOMAIN=rolia-92d5d.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=rolia-92d5d
VITE_FIREBASE_STORAGE_BUCKET=rolia-92d5d.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=377846873300
VITE_FIREBASE_APP_ID=1:377846873300:web:9eda5abc55ddf79a948f41
VITE_API_URL=http://localhost:3001
```

```typescript
// apps/web/src/lib/firebase.ts
import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
```

**Step 2: Crear auth store (Zustand)**

```typescript
// apps/web/src/stores/auth-store.ts
import { create } from "zustand"
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth"
import { auth } from "@/lib/firebase"
import type { User } from "@rol-ia/shared"

interface AuthState {
  firebaseUser: FirebaseUser | null
  user: User | null
  token: string | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  init: () => () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  user: null,
  token: null,
  loading: true,
  error: null,

  login: async (email, password) => {
    set({ error: null, loading: true })
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch {
      set({ error: "Credenciales invalidas", loading: false })
      throw new Error("Credenciales invalidas")
    }
  },

  logout: async () => {
    await signOut(auth)
    set({ firebaseUser: null, user: null, token: null })
  },

  init: () => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken()
        try {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (res.ok) {
            const { user } = await res.json()
            set({ firebaseUser, user, token, loading: false })
          } else {
            set({ firebaseUser, user: null, token, loading: false })
          }
        } catch {
          set({ firebaseUser, user: null, token, loading: false })
        }
      } else {
        set({ firebaseUser: null, user: null, token: null, loading: false })
      }
    })
    return unsubscribe
  },
}))
```

**Step 3: Modificar login-screen.tsx para usar Firebase**

Reemplazar la validacion hardcodeada por el auth store:

En `apps/web/src/components/login-screen.tsx`:
- Eliminar la constante `VALID_CREDENTIALS`
- Reemplazar la funcion `handleLogin` para que use `useAuthStore().login(email, password)`
- El campo "empresa" se puede mantener como referencia visual pero la auth real es por email+password
- Mostrar `error` del store en el formulario

**Step 4: Agregar auth guard en App.tsx**

```typescript
// apps/web/src/App.tsx
import { useEffect } from "react"
import { Routes, Route, Navigate } from "react-router"
import { useAuthStore } from "@/stores/auth-store"
import { LoginPage } from "@/pages/LoginPage"
import { DashboardPage } from "@/pages/DashboardPage"

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()

  if (loading) return <div className="flex h-screen items-center justify-center">Cargando...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    const unsubscribe = init()
    return unsubscribe
  }, [init])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
```

**Step 5: Verificar flujo completo**

Run: API en terminal 1: `pnpm --filter api dev`
Run: Web en terminal 2: `pnpm --filter web dev`
Expected: Login con email/password de Firebase → llama a /api/me → redirige a /dashboard

---

## Task 11: API Route de Registro (Onboarding primer tenant)

**Files:**
- Create: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Crear ruta de registro**

```typescript
// apps/api/src/routes/auth.ts
import { Hono } from "hono"
import { prisma } from "../db/client"
import admin from "firebase-admin"

const auth = new Hono()

// POST /auth/register - Crear tenant + usuario owner
// Se llama despues de que el usuario ya se creo en Firebase Auth
auth.post("/register", async (c) => {
  const header = c.req.header("Authorization")
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Token requerido" }, 401)
  }

  const token = header.slice(7)
  const decoded = await admin.auth().verifyIdToken(token)

  // Verificar que no existe ya
  const existing = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
  })
  if (existing) {
    return c.json({ error: "Usuario ya registrado" }, 409)
  }

  const body = await c.req.json<{ tenantName: string; tenantSlug: string }>()

  // Crear tenant + owner en una transaccion
  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: body.tenantName,
        slug: body.tenantSlug.toLowerCase().replace(/[^a-z0-9-]/g, ""),
        plan: "free",
      },
    })

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        firebaseUid: decoded.uid,
        email: decoded.email ?? "",
        role: "owner",
      },
    })

    return { tenant, user }
  })

  return c.json({
    tenant: { id: result.tenant.id, name: result.tenant.name, slug: result.tenant.slug },
    user: { id: result.user.id, email: result.user.email, role: result.user.role },
  }, 201)
})

export { auth as authRoutes }
```

**Step 2: Registrar ruta en index.ts**

Agregar antes de `app.route("/api", api)`:

```typescript
import { authRoutes } from "./routes/auth"

// Rutas publicas (solo necesitan Firebase token, no tenant)
app.route("/auth", authRoutes)
```

**Step 3: Verificar**

Run: `pnpm --filter api dev`
Test manual: crear usuario en Firebase Auth, obtener token, hacer POST /auth/register con tenant info.

---

## Task 12: Limpiar proyecto original

**Files:**
- Delete: `app/` (directorio Next.js)
- Delete: `next.config.mjs`
- Delete: `next-env.d.ts`
- Delete: `components/` (ya copiados a apps/web/src/components)
- Delete: `hooks/` (ya copiados)
- Delete: `lib/` (ya copiados)
- Delete: `styles/` (ya copiados)
- Delete: `components.json` (reconfigurar para nueva ruta)
- Keep: `docs/`
- Keep: `.gitignore` (actualizar)

**Step 1: Eliminar archivos Next.js**

```bash
rm -rf app/ components/ hooks/ lib/ styles/
rm -f next.config.mjs next-env.d.ts components.json tsconfig.json
```

**Step 2: Actualizar .gitignore**

```
node_modules/
dist/
.next/
.env
.env.local
*.tsbuildinfo
.turbo/
```

**Step 3: Crear components.json para shadcn en nueva ubicacion**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "apps/web/src/globals.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

**Step 4: Verificar que todo funciona desde cero**

```bash
rm -rf node_modules apps/web/node_modules apps/api/node_modules packages/shared/node_modules
pnpm install
pnpm build
```

Expected: Build exitoso de shared, api, y web sin errores.

---

## Task 13: Inicializar Git y subir a GitHub

**Files:**
- Modify: `.gitignore`

**Step 1: Verificar .gitignore protege credenciales**

Asegurarse de que `.gitignore` incluye:

```
node_modules/
dist/
.next/
.env
.env.local
.env.*.local
*.tsbuildinfo
.turbo/
apps/api/.env
apps/web/.env
```

**Step 2: Inicializar repositorio git**

```bash
git init
git add .
git status
```

Revisar que NO aparezcan archivos `.env` ni `node_modules/` en los tracked files.

**Step 3: Primer commit**

```bash
git commit -m "feat: initialize monorepo with React+Vite frontend, Hono API, Prisma+Neon DB, and Firebase Auth

- Monorepo structure with pnpm workspaces + Turborepo
- apps/web: React 19 + Vite + React Router + shadcn/ui (migrated from Next.js)
- apps/api: Hono + Prisma + Firebase Admin (auth middleware + tenant isolation)
- packages/shared: Types, Zod validators, role constants
- PostgreSQL schema: 16 tables with RLS multi-tenant
- Firebase Auth integration with Zustand store

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

**Step 4: Crear repo en GitHub y push**

```bash
gh repo create rol-ia --private --source=. --remote=origin --push
```

Si no tienes `gh` CLI instalado, crear el repo manualmente en github.com y luego:

```bash
git remote add origin git@github.com:TU_USUARIO/rol-ia.git
git branch -M main
git push -u origin main
```

**Step 5: Verificar**

Run: `gh repo view --web` o abrir el repo en github.com
Expected: Repo privado con toda la estructura del monorepo visible, sin archivos `.env`.

---

## Task 14: Deploy Frontend a Firebase Hosting

**Files:**
- Create: `apps/web/firebase.json`
- Create: `apps/web/.firebaserc`

**Prerequisito:** Instalar Firebase CLI si no esta instalada.

```bash
npm install -g firebase-tools
firebase login
```

**Step 1: Crear configuracion de Firebase Hosting**

```json
// apps/web/firebase.json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css|svg|png|woff2)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=31536000, immutable"
          }
        ]
      }
    ]
  }
}
```

El rewrite a `/index.html` es necesario para que React Router funcione (SPA).

```json
// apps/web/.firebaserc
{
  "projects": {
    "default": "rolia-92d5d"
  }
}
```

**Step 2: Build del frontend**

```bash
pnpm --filter web build
```

Expected: Build exitoso, archivos en `apps/web/dist/`

**Step 3: Deploy**

```bash
cd apps/web && firebase deploy --only hosting
```

Expected: Output incluye "Hosting URL: https://rolia-92d5d.web.app"

**Step 4: Verificar en browser**

Abrir `https://rolia-92d5d.web.app`
Expected: Pantalla de login visible, app cargando correctamente con CDN global.

Nota: El dashboard mostrara datos demo (hardcodeados) ya que la API aun no esta en Cloud Run. La conexion a la API real se configura en Fase 4.

**Step 5: Agregar script de deploy al root package.json**

Agregar en scripts del `package.json` root:

```json
"deploy:web": "pnpm --filter web build && cd apps/web && firebase deploy --only hosting"
```

---

## Resumen de Fase 1

Al completar estas 12 tareas tendras:

| Componente | Estado |
|---|---|
| Monorepo (pnpm + Turborepo) | Funcional |
| packages/shared (tipos + Zod) | Funcional |
| apps/api (Hono + Prisma + Auth) | Funcional en local |
| apps/web (React + Vite) | Funcional en local |
| PostgreSQL (Neon) | 16 tablas con RLS |
| Firebase Auth | Login real con email/password |
| React Router | /login, /dashboard con auth guard |
| Zustand | Auth store conectado |
| Dashboard UI | Migrado con todos los componentes |
| GitHub | Repo privado con push inicial |
| Neon (sa-east-1) | 16 tablas con RLS, credenciales en .env |
| Firebase Hosting | Frontend live en https://rolia-92d5d.web.app |

---

## Fases Futuras (outline)

### Fase 2: Conectar Dashboard a Datos Reales
- Crear API endpoints por modulo (leads, campaigns, guardians, reports)
- Crear services/api.ts en frontend con fetch + auth token
- Reemplazar datos hardcodeados en componentes por llamadas a API
- Implementar SSE para real-time
- Seed de datos de prueba

### Fase 3: Workers de Integracion
- Worker de gasto ads (Meta + Google Ads APIs)
- Webhook de leads (Clientify / Meta)
- Logica de clasificacion de creativos (Ganador/Perdedor/Pausado)
- Worker ROAS diario

### Fase 4: Deploy a Google Cloud
- Dockerfile optimizado para Cloud Run
- Firebase Hosting deploy config
- Cloud Build pipeline (CI/CD)
- Secret Manager para credenciales
- Cloud Scheduler para workers
- Dominio personalizado

### Fase 5: SaaS Completo
- Onboarding multi-tenant (registro de empresas)
- WhatsApp Business API integration
- ML forecasting (ventas_proyecciones)
- Panel de administracion (super admin)
- Billing / planes
