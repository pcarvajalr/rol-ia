# Sistema de Captura y Gestión de Leads via Webhook — Plan de Implementación

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar un sistema de captura automática de leads desde Clientify via webhook, con flujo de seguimiento automatizado: ingreso → timer → WhatsApp → timer → VAPI, usando Google Cloud Tasks para timers.

**Architecture:** Orquestador centralizado (`lead-flow.ts`) con módulos desacoplados (Clientify, WhatsApp, VAPI). Estado del flujo derivado del último evento en `leads_event_history`. Rutas de webhook y endpoints internos montados antes del CORS global para permitir llamadas externas.

**Tech Stack:** Hono, Prisma, Google Cloud Tasks SDK (`@google-cloud/tasks`), Meta WhatsApp Cloud API, VAPI API, AES-256-GCM encryption, nodemailer.

**Spec:** `docs/superpowers/specs/2026-03-14-sistema-leads-design.md`

---

## Chunk 1: Fase 1 — Webhook + Clientify + Persistencia de lead

### Task 1: Extraer helpers de encriptación a `utils/encryption.ts`

**Files:**
- Create: `apps/api/src/utils/encryption.ts`
- Modify: `apps/api/src/routes/vault.ts:170-194`
- Modify: `apps/api/src/modules/email.ts:1-21`

- [ ] **Step 1: Create `utils/encryption.ts`**

Extraer las funciones `encrypt` y `decrypt` que están duplicadas en `vault.ts` (líneas 170-194) y `email.ts` (líneas 5-21).

```typescript
// apps/api/src/utils/encryption.ts
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto"

const VAULT_KEY = process.env.VAULT_ENCRYPTION_KEY || "default-dev-key-change-in-production!!"

function getEncryptionKey(): Buffer {
  return createHash("sha256").update(VAULT_KEY).digest()
}

export function encrypt(text: string): { encrypted: string; iv: string } {
  const iv = randomBytes(16)
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  const authTag = cipher.getAuthTag().toString("hex")
  return { encrypted: encrypted + ":" + authTag, iv: iv.toString("hex") }
}

export function decrypt(encrypted: string, ivHex: string): string {
  const [data, authTag] = encrypted.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv)
  decipher.setAuthTag(Buffer.from(authTag!, "hex"))
  let decrypted = decipher.update(data!, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}
```

- [ ] **Step 2: Update `vault.ts` to import from shared utils**

Remove lines 170-194 in `vault.ts` (the local `VAULT_KEY`, `getEncryptionKey`, `encrypt`, and `decrypt` functions). Keep the PIN helpers (`hashPin`, `createPinHash`, `verifyPin`) — those are vault-specific and unrelated.

Update the crypto import at the top of the file (line 5) to only keep what PIN helpers need:

```typescript
import { createHash, randomBytes } from "crypto"
```

Add the shared encryption import:

```typescript
import { encrypt, decrypt } from "../utils/encryption"
```

- [ ] **Step 3: Update `email.ts` to import from shared utils**

Replace lines 1-21 in `email.ts` with:

```typescript
import nodemailer from "nodemailer"
import { prisma } from "../db/client"
import { decrypt } from "../utils/encryption"
```

Remove the local `VAULT_KEY`, `getEncryptionKey`, and `decrypt` functions.

- [ ] **Step 4: Verify app starts correctly**

Run: `cd apps/api && pnpm dev`

Expected: Server starts on port 3001 without errors. Existing vault and email functionality still works.

---

### Task 2: Create `validateCredentials` utility function

**Files:**
- Modify: `apps/api/src/utils/encryption.ts`

- [ ] **Step 1: Add `validateCredentials` to `encryption.ts`**

This function retrieves and decrypts credentials from the vault, validating that required fields exist.

```typescript
// Add to apps/api/src/utils/encryption.ts
import { prisma } from "../db/client"

export async function validateCredentials(
  tenantId: string,
  platformSlug: string,
  requiredFields: string[]
): Promise<Record<string, string>> {
  const platform = await prisma.integrationPlatform.findUnique({
    where: { slug: platformSlug },
  })

  if (!platform) {
    throw new Error(`Plataforma "${platformSlug}" no encontrada`)
  }

  const integration = await prisma.tenantIntegration.findUnique({
    where: {
      tenantId_platformId: { tenantId, platformId: platform.id },
    },
  })

  if (!integration || !integration.isActive) {
    throw new Error(`Integración "${platformSlug}" no activa para tenant ${tenantId}`)
  }

  const credentials = JSON.parse(decrypt(integration.credentialsEncrypted, integration.iv)) as Record<string, string>

  for (const field of requiredFields) {
    if (!credentials[field]) {
      throw new Error(`Campo "${field}" faltante en credenciales de "${platformSlug}"`)
    }
  }

  return credentials
}
```

- [ ] **Step 2: Verify import doesn't create circular dependency**

`encryption.ts` now imports `prisma` from `db/client`. This is fine — `db/client` doesn't import from `utils/`.

---

### Task 3: Create módulo Clientify

**Files:**
- Create: `apps/api/src/modules/clientify.ts`

- [ ] **Step 1: Create `clientify.ts`**

```typescript
// apps/api/src/modules/clientify.ts
import { validateCredentials } from "../utils/encryption"

interface ClientifyPayload {
  id: number
  first_name: string
  last_name?: string
  email?: string
  phone?: string
  status?: string
  contact_source?: string
  company?: string
  custom_fields?: unknown[]
}

interface NormalizedLead {
  externalId: string
  nombreLead: string
  fuente: string
  telefono: string | null
  email: string | null
}

export function parseClientifyPayload(body: unknown): NormalizedLead {
  const payload = body as ClientifyPayload

  if (!payload?.id || !payload?.first_name) {
    throw new Error("Payload inválido: se requiere id y first_name")
  }

  return {
    externalId: String(payload.id),
    nombreLead: [payload.first_name, payload.last_name].filter(Boolean).join(" "),
    fuente: payload.contact_source || "Clientify",
    telefono: payload.phone || null,
    email: payload.email || null,
  }
}

export async function queryContactStatus(
  tenantId: string,
  externalId: string
): Promise<string | null> {
  const credentials = await validateCredentials(tenantId, "clientify", ["api_token"])

  const response = await fetch(`https://api.clientify.net/v1/contacts/${externalId}/`, {
    headers: { Authorization: `Token ${credentials.api_token}` },
  })

  if (!response.ok) {
    console.error(`[clientify] Error consultando contacto ${externalId}: ${response.status}`)
    return null
  }

  const data = (await response.json()) as { status?: string }
  return data.status || null
}
```

---

### Task 4: Create webhook route

**Files:**
- Create: `apps/api/src/routes/webhook.ts`

- [ ] **Step 1: Create `webhook.ts`**

```typescript
// apps/api/src/routes/webhook.ts
import { Hono } from "hono"
import { prisma } from "../db/client"
import { validateCredentials } from "../utils/encryption"
import { parseClientifyPayload } from "../modules/clientify"
import { sendEmailToOwner } from "../modules/email"

const webhookRouter = new Hono()

// POST /webhook/:plataforma/:idEmpresa
webhookRouter.post("/:plataforma/:idEmpresa", async (c) => {
  const { plataforma, idEmpresa } = c.req.param()

  // 1. Verificar tenant existe
  const tenant = await prisma.tenant.findUnique({
    where: { id: idEmpresa },
    select: { id: true, active: true },
  })

  if (!tenant || !tenant.active) {
    return c.json({ error: "Tenant no encontrado" }, 404)
  }

  // 2. Autenticar según plataforma
  if (plataforma === "clientify") {
    const authHeader = c.req.header("Authorization")
    if (!authHeader?.startsWith("Token ")) {
      return c.json({ error: "Token requerido" }, 401)
    }

    const token = authHeader.replace("Token ", "")

    try {
      const credentials = await validateCredentials(idEmpresa, "clientify", ["api_token"])
      if (credentials.api_token !== token) {
        return c.json({ error: "Token inválido" }, 401)
      }
    } catch {
      return c.json({ error: "Integración no configurada" }, 401)
    }
  } else {
    return c.json({ error: `Plataforma "${plataforma}" no soportada` }, 400)
  }

  // 3. Responder 200 inmediatamente
  const body = await c.req.json()

  setImmediate(async () => {
    try {
      if (plataforma === "clientify") {
        await handleClientifyWebhook(idEmpresa, body)
      }
    } catch (error) {
      console.error(`[webhook] Error procesando ${plataforma} para tenant ${idEmpresa}:`, error)
    }
  })

  return c.json({ ok: true })
})

async function handleClientifyWebhook(tenantId: string, body: unknown) {
  // Parsear payload
  const lead = parseClientifyPayload(body)

  // Buscar estado "Nuevo" por nombre
  const estadoNuevo = await prisma.catEstadoGestion.findFirst({
    where: { nombre: "Nuevo" },
  })

  if (!estadoNuevo) {
    console.error("[webhook] Estado 'Nuevo' no encontrado en cat_estados_gestion")
    return
  }

  // Verificar idempotencia
  const existingLead = await prisma.leadTracking.findFirst({
    where: {
      tenantId,
      externalId: lead.externalId,
      fuente: lead.fuente,
    },
  })

  if (existingLead) {
    // Verificar si flujo completado o activo
    const lastEvent = await prisma.leadEventHistory.findFirst({
      where: { leadId: existingLead.leadId, tenantId },
      orderBy: { timestamp: "desc" },
      include: { tipoEvento: true },
    })

    const completedEvents = ["Llamada", "Cita", "Timeout"]
    const isCompleted =
      (lastEvent && completedEvents.includes(lastEvent.tipoEvento.nombre)) ||
      lastEvent?.descripcion?.includes("No contactar")

    if (isCompleted) {
      console.log(`[webhook] Lead ${lead.externalId} ya completado, ignorando`)
    } else {
      console.log(`[webhook] Lead ${lead.externalId} con flujo activo, ignorando`)
    }
    return
  }

  // Buscar tipo de evento "Lead ingreso"
  const tipoIngreso = await prisma.catTipoEvento.findFirst({
    where: { nombre: "Lead ingreso" },
  })

  if (!tipoIngreso) {
    console.error("[webhook] Tipo evento 'Lead ingreso' no encontrado")
    return
  }

  // Crear lead
  const newLead = await prisma.leadTracking.create({
    data: {
      tenantId,
      externalId: lead.externalId,
      nombreLead: lead.nombreLead,
      fuente: lead.fuente,
      telefono: lead.telefono,
      email: lead.email,
      idEstado: estadoNuevo.id,
    },
  })

  // Registrar evento "Lead ingreso"
  await prisma.leadEventHistory.create({
    data: {
      tenantId,
      leadId: newLead.leadId,
      idTipoEvento: tipoIngreso.id,
      actorIntervencion: "IA",
      descripcion: `Lead ingresó desde ${lead.fuente}`,
    },
  })

  console.log(`[webhook] Lead creado: ${newLead.leadId} (${lead.nombreLead})`)

  // Si no tiene teléfono, no iniciar flujo automático
  if (!lead.telefono) {
    console.log(`[webhook] Lead ${newLead.leadId} sin teléfono, requiere gestión manual`)
    await sendEmailToOwner(
      tenantId,
      "Lead sin teléfono",
      `<p>El lead <strong>${lead.nombreLead}</strong> ingresó sin número de teléfono.</p><p>Requiere gestión manual.</p>`
    )
    return
  }

  // TODO Fase 2: llamar startFlow(tenantId, newLead.leadId)
}

export { webhookRouter }
```

---

### Task 5: Mount webhook route in `index.ts` BEFORE CORS

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add webhook import and mount BEFORE CORS**

```typescript
// apps/api/src/index.ts
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { webhookRouter } from "./routes/webhook"        // ADD
import { authMiddleware } from "./middleware/auth"
import { authRoutes } from "./routes/auth"
import { adminRoutes } from "./routes/admin"
import { intelRoutes } from "./routes/intel"
import { vaultRoutes } from "./routes/vault"
import { settingsRoutes } from "./routes/settings"
import { tenantMiddleware, type TenantUser } from "./middleware/tenant"
import { superadminMiddleware } from "./middleware/superadmin"
import type { AuthUser } from "./middleware/auth"

const app = new Hono()

app.use("*", logger())

// Webhooks — SIN CORS (llamados por servicios externos)       // ADD
app.route("/webhook", webhookRouter)                             // ADD

app.use("*", cors({
  origin: ["http://localhost:5173", "https://rolia-92d5d.web.app", "https://rolia-92d5d.firebaseapp.com"],
  credentials: true,
}))

// ... rest stays the same
```

- [ ] **Step 2: Verify app compiles and starts**

Run: `cd apps/api && pnpm dev`

Expected: Server starts. `POST /webhook/clientify/:idEmpresa` is accessible.

- [ ] **Step 3: Validate Fase 1 manually**

Test with curl:

```bash
# Test con tenant y token inválidos → 404/401
curl -X POST http://localhost:3001/webhook/clientify/invalid-tenant \
  -H "Content-Type: application/json" \
  -H "Authorization: Token wrong-token" \
  -d '{"id": 1, "first_name": "Test"}'

# Test con payload válido (reemplazar TENANT_ID y TOKEN con valores reales)
curl -X POST http://localhost:3001/webhook/clientify/TENANT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Token REAL_API_TOKEN" \
  -d '{"id": 12345, "first_name": "Carlos", "last_name": "Perez", "email": "carlos@test.com", "phone": "+573001234567", "contact_source": "Meta"}'

# Verificar en DB que el lead y evento fueron creados
# Repetir el mismo request → no debe duplicar

# Test sin teléfono → debe crear lead pero no iniciar flujo
curl -X POST http://localhost:3001/webhook/clientify/TENANT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Token REAL_API_TOKEN" \
  -d '{"id": 99999, "first_name": "Sin", "last_name": "Telefono", "email": "sin@test.com", "contact_source": "Web"}'
```

---

## Chunk 2: Fase 2 — Task Scheduler + Orquestador base + Endpoints internos

### Task 6: Create Task Scheduler service

**Files:**
- Create: `apps/api/src/services/task-scheduler.ts`

- [ ] **Step 1: Create `task-scheduler.ts`**

```typescript
// apps/api/src/services/task-scheduler.ts
import { CloudTasksClient } from "@google-cloud/tasks"

const client = new CloudTasksClient()

const PROJECT_ID = process.env.GCP_PROJECT_ID!
const LOCATION = process.env.GCP_LOCATION || "us-central1"
const QUEUE_NAME = process.env.GCP_QUEUE_NAME || "rol-ia-leads"
const API_BASE_URL = process.env.API_BASE_URL!

function getQueuePath(): string {
  return client.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME)
}

function getTaskPath(taskId: string): string {
  return `${getQueuePath()}/tasks/${taskId}`
}

export async function createTask(
  taskId: string,
  endpoint: string,
  delaySec: number,
  payload?: object
): Promise<string> {
  const scheduleTime = new Date(Date.now() + delaySec * 1000)

  const [response] = await client.createTask({
    parent: getQueuePath(),
    task: {
      name: getTaskPath(taskId),
      httpRequest: {
        httpMethod: "POST",
        url: `${API_BASE_URL}${endpoint}`,
        headers: { "Content-Type": "application/json" },
        body: payload
          ? Buffer.from(JSON.stringify(payload)).toString("base64")
          : undefined,
      },
      scheduleTime: {
        seconds: Math.floor(scheduleTime.getTime() / 1000),
      },
    },
  })

  console.log(`[task-scheduler] Task created: ${response.name}`)
  return response.name!
}

export async function cancelTask(taskName: string): Promise<void> {
  try {
    await client.deleteTask({ name: taskName })
    console.log(`[task-scheduler] Task cancelled: ${taskName}`)
  } catch (error: unknown) {
    const err = error as { code?: number }
    // Task may have already executed or been deleted
    if (err.code === 5) {
      console.log(`[task-scheduler] Task not found (already executed?): ${taskName}`)
    } else {
      throw error
    }
  }
}
```

---

### Task 7: Create lead flow orchestrator (skeleton)

**Files:**
- Create: `apps/api/src/services/lead-flow.ts`

- [ ] **Step 1: Create `lead-flow.ts` with `startFlow` and `endFlow`**

```typescript
// apps/api/src/services/lead-flow.ts
import { prisma } from "../db/client"
import { createTask, cancelTask } from "./task-scheduler"

const GUARDIAN_DEFAULTS = {
  tiempoRespuestaLeadSeg: 15,
}

async function getTiempoRespuesta(tenantId: string): Promise<number> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  })

  const settings = tenant?.settings as Record<string, unknown> | null
  const guardian = settings?.guardian as Record<string, unknown> | null
  return (guardian?.tiempoRespuestaLeadSeg as number) || GUARDIAN_DEFAULTS.tiempoRespuestaLeadSeg
}

export async function getLastEvent(leadId: string, tenantId: string) {
  return prisma.leadEventHistory.findFirst({
    where: { leadId, tenantId },
    orderBy: { timestamp: "desc" },
    include: { tipoEvento: true },
  })
}

export async function startFlow(tenantId: string, leadId: string): Promise<void> {
  const tiempoRespuesta = await getTiempoRespuesta(tenantId)

  // Crear Cloud Task (timer 1)
  const taskId = `lead-${leadId}-timer1`
  const taskName = await createTask(
    taskId,
    `/internal/lead-timeout/${leadId}`,
    tiempoRespuesta
  )

  // Guardar flow_job_id
  await prisma.leadTracking.update({
    where: { leadId },
    data: { flowJobId: taskName },
  })

  console.log(`[lead-flow] Flow started for lead ${leadId}, timer: ${tiempoRespuesta}s`)
}

export async function endFlow(tenantId: string, leadId: string): Promise<void> {
  const lead = await prisma.leadTracking.findUnique({
    where: { leadId },
    select: { flowJobId: true },
  })

  if (lead?.flowJobId) {
    await cancelTask(lead.flowJobId)
  }

  await prisma.leadTracking.update({
    where: { leadId },
    data: { flowJobId: null },
  })

  console.log(`[lead-flow] Flow ended for lead ${leadId}`)
}
```

---

### Task 8: Create internal routes

**Files:**
- Create: `apps/api/src/routes/internal.ts`

- [ ] **Step 1: Create `internal.ts`**

```typescript
// apps/api/src/routes/internal.ts
import { Hono } from "hono"
import { prisma } from "../db/client"
import { getLastEvent, endFlow } from "../services/lead-flow"

const internalRouter = new Hono()

// POST /internal/lead-timeout/:leadId
internalRouter.post("/lead-timeout/:leadId", async (c) => {
  const { leadId } = c.req.param()

  // Validar que viene de Cloud Tasks en producción
  const taskHeader = c.req.header("X-CloudTasks-TaskName")
  if (process.env.NODE_ENV === "production" && !taskHeader) {
    return c.json({ error: "Unauthorized" }, 403)
  }

  const lead = await prisma.leadTracking.findUnique({
    where: { leadId },
    select: { leadId: true, tenantId: true, telefono: true, nombreLead: true, flowJobId: true },
  })

  if (!lead) {
    return c.json({ error: "Lead no encontrado" }, 404)
  }

  const lastEvent = await getLastEvent(leadId, lead.tenantId)

  if (!lastEvent) {
    console.error(`[internal] No events found for lead ${leadId}`)
    return c.json({ error: "No events" }, 400)
  }

  const completedEvents = ["Llamada", "Cita", "Timeout"]
  const isCompleted =
    completedEvents.includes(lastEvent.tipoEvento.nombre) ||
    lastEvent.descripcion?.includes("No contactar")

  if (isCompleted) {
    console.log(`[internal] Lead ${leadId} already completed, skipping timeout`)
    return c.json({ ok: true, skipped: true })
  }

  // TODO Fase 3: handleTimeout logic (WhatsApp, VAPI)
  console.log(`[internal] Timeout for lead ${leadId}, last event: ${lastEvent.tipoEvento.nombre}`)

  return c.json({ ok: true })
})

// POST /internal/lead-cleanup
internalRouter.post("/lead-cleanup", async (c) => {
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000)

  // Buscar leads con flujo activo cuyo último evento es mayor a 12h
  const activeLeads = await prisma.leadTracking.findMany({
    where: {
      flowJobId: { not: null },
    },
    select: { leadId: true, tenantId: true, flowJobId: true, nombreLead: true },
  })

  const tipoTimeout = await prisma.catTipoEvento.findFirst({
    where: { nombre: "Timeout" },
  })

  if (!tipoTimeout) {
    console.error("[internal] Tipo evento 'Timeout' no encontrado")
    return c.json({ error: "Timeout event type not found" }, 500)
  }

  let cleaned = 0

  for (const lead of activeLeads) {
    const lastEvent = await getLastEvent(lead.leadId, lead.tenantId)

    if (lastEvent && lastEvent.timestamp < twelveHoursAgo) {
      // Registrar evento Timeout
      await prisma.leadEventHistory.create({
        data: {
          tenantId: lead.tenantId,
          leadId: lead.leadId,
          idTipoEvento: tipoTimeout.id,
          actorIntervencion: "IA",
          descripcion: "Timeout - flujo expirado",
        },
      })

      await endFlow(lead.tenantId, lead.leadId)
      cleaned++
      console.log(`[internal] Lead ${lead.leadId} (${lead.nombreLead}) marked as timeout`)
    }
  }

  console.log(`[internal] Cleanup completed: ${cleaned} leads marked as timeout`)
  return c.json({ ok: true, cleaned })
})

export { internalRouter }
```

---

### Task 9: Mount internal routes and connect `startFlow` to webhook

**Files:**
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/routes/webhook.ts`

- [ ] **Step 1: Mount internal routes in `index.ts`**

Add import and mount BEFORE CORS (alongside webhook):

```typescript
import { internalRouter } from "./routes/internal"        // ADD

// Webhooks + internals — SIN CORS (llamados por servicios externos)
app.route("/webhook", webhookRouter)
app.route("/internal", internalRouter)                     // ADD
```

- [ ] **Step 2: Connect `startFlow` in webhook.ts**

In `webhook.ts`, replace the `// TODO Fase 2: llamar startFlow` comment:

```typescript
import { startFlow } from "../services/lead-flow"         // ADD at top

// Replace the TODO comment at the end of handleClientifyWebhook:
  // Si tiene teléfono, iniciar flujo automático
  await startFlow(tenantId, newLead.leadId)
```

- [ ] **Step 3: Verify app compiles and starts**

Run: `cd apps/api && pnpm dev`

- [ ] **Step 4: Validate Fase 2**

Deploy a Cloud Run y probar:

```bash
# 1. Enviar lead via webhook → verificar que Cloud Task se crea
curl -X POST https://API_BASE_URL/webhook/clientify/TENANT_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Token REAL_API_TOKEN" \
  -d '{"id": 55555, "first_name": "Timer", "last_name": "Test", "phone": "+573001234567", "contact_source": "Meta"}'

# 2. Verificar en GCP Console que el Cloud Task fue creado
# 3. Esperar a que el timer venza → verificar logs del endpoint /internal/lead-timeout

# 4. Test cleanup endpoint
curl -X POST https://API_BASE_URL/internal/lead-cleanup
```

---

## Chunk 3: Fase 3 — Módulo WhatsApp + Primer timeout completo

### Task 10: Update WhatsApp seed data

**Files:**
- Modify: `apps/api/prisma/seed.ts:188-199`

- [ ] **Step 1: Update WhatsApp platform fields in seed**

Replace the WhatsApp platform entry (lines 188-199 in seed.ts):

```typescript
    {
      name: "WhatsApp",
      slug: "whatsapp",
      icon: "MessageSquare",
      category: "messaging",
      sortOrder: 1,
      fields: [
        { label: "Número de WhatsApp", fieldKey: "phone_number", fieldType: "text", sortOrder: 1 },
        { label: "Phone Number ID (Meta)", fieldKey: "phone_number_id", fieldType: "text", sortOrder: 2 },
        { label: "ID Cuenta (WABA)", fieldKey: "account_id", fieldType: "text", sortOrder: 3 },
        { label: "Token de Acceso", fieldKey: "access_token", fieldType: "secret", sortOrder: 4 },
        { label: "App Secret", fieldKey: "app_secret", fieldType: "secret", sortOrder: 5 },
      ],
    },
```

- [ ] **Step 2: Run seed**

Run: `cd apps/api && pnpm db:seed`

Expected: Seed completes successfully. WhatsApp platform now has 5 fields.

---

### Task 11: Create WhatsApp module

**Files:**
- Create: `apps/api/src/modules/whatsapp.ts`

- [ ] **Step 1: Create `whatsapp.ts`**

```typescript
// apps/api/src/modules/whatsapp.ts
import { prisma } from "../db/client"
import { validateCredentials, decrypt } from "../utils/encryption"
import { createHmac } from "crypto"

// ---- Template functions ----

interface TemplateComponent {
  type: string
  parameters?: Array<{ type: string; text?: string }>
  sub_type?: string
  index?: string
}

export async function getTemplateStructure(
  tenantId: string,
  templateName: string
): Promise<TemplateComponent[]> {
  const credentials = await validateCredentials(tenantId, "whatsapp", ["account_id", "access_token"])

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${credentials.account_id}/message_templates?name=${templateName}`,
    { headers: { Authorization: `Bearer ${credentials.access_token}` } }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Error consultando template ${templateName}: ${response.status} - ${error}`)
  }

  const data = (await response.json()) as {
    data: Array<{ components: TemplateComponent[] }>
  }

  if (!data.data?.length) {
    throw new Error(`Template "${templateName}" no encontrado`)
  }

  return data.data[0].components
}

export async function sendTemplate(
  tenantId: string,
  to: string,
  templateName: string,
  languageCode: string,
  params: Record<string, string>
): Promise<void> {
  const credentials = await validateCredentials(tenantId, "whatsapp", [
    "phone_number_id",
    "access_token",
  ])

  // Obtener estructura del template
  const templateComponents = await getTemplateStructure(tenantId, templateName)

  // Construir components con parámetros
  const components: TemplateComponent[] = []
  const paramValues = Object.values(params)
  let paramIndex = 0

  for (const comp of templateComponents) {
    if (comp.type === "HEADER" || comp.type === "BODY") {
      // Contar parámetros {{1}}, {{2}}, etc. en el texto del template
      const text = (comp as unknown as { text?: string }).text || ""
      const paramCount = (text.match(/\{\{\d+\}\}/g) || []).length

      if (paramCount > 0) {
        const parameters = []
        for (let i = 0; i < paramCount; i++) {
          parameters.push({
            type: "text" as const,
            text: paramValues[paramIndex] || "",
          })
          paramIndex++
        }
        components.push({
          type: comp.type.toLowerCase(),
          parameters,
        })
      }
    }
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${credentials.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components,
        },
      }),
    }
  )

  if (!response.ok) {
    const errorData = (await response.json()) as {
      error?: { code?: number; message?: string }
    }
    const errorCode = errorData.error?.code
    const errorMessage = errorData.error?.message || "Unknown error"

    // Números inválidos
    if (errorCode === 131026 || errorCode === 131021) {
      const err = new Error(`Número de WhatsApp inválido: ${errorMessage}`) as Error & {
        code: string
      }
      err.code = "INVALID_NUMBER"
      throw err
    }

    throw new Error(`Error enviando template: ${errorCode} - ${errorMessage}`)
  }

  console.log(`[whatsapp] Template "${templateName}" enviado a ${to} para tenant ${tenantId}`)
}

// ---- Text message ----

export async function sendTextMessage(
  tenantId: string,
  to: string,
  text: string
): Promise<void> {
  const credentials = await validateCredentials(tenantId, "whatsapp", [
    "phone_number_id",
    "access_token",
  ])

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${credentials.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Error enviando mensaje de texto: ${response.status} - ${error}`)
  }

  console.log(`[whatsapp] Text message sent to ${to} for tenant ${tenantId}`)
}

// ---- Webhook parsing ----

interface MetaWebhookResult {
  type: "button_reply" | "text" | "unknown"
  buttonId?: string
  from: string
  phoneNumberId: string
}

export function parseWebhookPayload(body: unknown): MetaWebhookResult | null {
  const data = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string }
          messages?: Array<{
            type?: string
            from?: string
            interactive?: {
              type?: string
              button_reply?: { id?: string; title?: string }
            }
            text?: { body?: string }
          }>
        }
      }>
    }>
  }

  const entry = data?.entry?.[0]
  const change = entry?.changes?.[0]
  const value = change?.value
  const message = value?.messages?.[0]

  if (!message || !value?.metadata?.phone_number_id) {
    return null
  }

  const result: MetaWebhookResult = {
    type: "unknown",
    from: message.from || "",
    phoneNumberId: value.metadata.phone_number_id,
  }

  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    result.type = "button_reply"
    result.buttonId = message.interactive.button_reply?.id
  } else if (message.type === "text") {
    result.type = "text"
  }

  return result
}

// ---- Tenant identification ----

export async function findTenantByPhoneNumberId(
  phoneNumberId: string
): Promise<string | null> {
  const platform = await prisma.integrationPlatform.findUnique({
    where: { slug: "whatsapp" },
  })

  if (!platform) return null

  const integrations = await prisma.tenantIntegration.findMany({
    where: {
      platformId: platform.id,
      isActive: true,
    },
    select: {
      tenantId: true,
      credentialsEncrypted: true,
      iv: true,
    },
  })

  for (const integration of integrations) {
    try {
      const credentials = JSON.parse(
        decrypt(integration.credentialsEncrypted, integration.iv)
      ) as Record<string, string>

      if (credentials.phone_number_id === phoneNumberId) {
        return integration.tenantId
      }
    } catch {
      continue
    }
  }

  return null
}

// ---- Webhook signature validation ----

export function validateWebhookSignature(
  body: string,
  signature: string,
  appSecret: string
): boolean {
  const expectedSignature =
    "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex")
  return signature === expectedSignature
}
```

---

### Task 12: Add Meta webhook routes

**Files:**
- Modify: `apps/api/src/routes/webhook.ts`

- [ ] **Step 1: Add Meta webhook verification and callback routes**

Add to `webhook.ts` after the existing POST route:

```typescript
import {
  parseWebhookPayload,
  findTenantByPhoneNumberId,
  validateWebhookSignature,
} from "../modules/whatsapp"
import { validateCredentials } from "../utils/encryption"

// GET /webhook/meta — Meta webhook verification
webhookRouter.get("/meta", (c) => {
  const mode = c.req.query("hub.mode")
  const token = c.req.query("hub.verify_token")
  const challenge = c.req.query("hub.challenge")

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    console.log("[webhook] Meta webhook verified")
    return c.text(challenge || "")
  }

  return c.json({ error: "Verification failed" }, 403)
})

// POST /webhook/meta — Meta webhook callback (button interactions)
webhookRouter.post("/meta", async (c) => {
  const rawBody = await c.req.text()
  const body = JSON.parse(rawBody)

  const parsed = parseWebhookPayload(body)

  if (!parsed) {
    // Meta sends status updates too, just acknowledge
    return c.json({ ok: true })
  }

  // Identify tenant
  const tenantId = await findTenantByPhoneNumberId(parsed.phoneNumberId)

  if (!tenantId) {
    console.error(`[webhook] No tenant found for phone_number_id: ${parsed.phoneNumberId}`)
    return c.json({ ok: true })
  }

  // Validate signature (mandatory — Meta always sends X-Hub-Signature-256)
  const signature = c.req.header("X-Hub-Signature-256")
  if (!signature) {
    console.error(`[webhook] Missing X-Hub-Signature-256 for tenant ${tenantId}`)
    return c.json({ error: "Signature required" }, 403)
  }

  try {
    const credentials = await validateCredentials(tenantId, "whatsapp", ["app_secret"])
    if (!validateWebhookSignature(rawBody, signature, credentials.app_secret)) {
      console.error(`[webhook] Invalid Meta signature for tenant ${tenantId}`)
      return c.json({ error: "Invalid signature" }, 403)
    }
  } catch (error) {
    console.error(`[webhook] Cannot validate signature for tenant ${tenantId}:`, error)
    return c.json({ error: "Signature validation failed" }, 500)
  }

  // Process button responses
  if (parsed.type === "button_reply" && parsed.buttonId) {
    setImmediate(async () => {
      try {
        // Find lead by phone number (normalize: Meta sends without +, DB may have +)
        const phoneVariants = [parsed.from, `+${parsed.from}`]
        const lead = await prisma.leadTracking.findFirst({
          where: {
            tenantId,
            telefono: { in: phoneVariants },
          },
        })

        if (!lead) {
          console.error(`[webhook] No lead found for phone ${parsed.from} in tenant ${tenantId}`)
          return
        }

        // TODO Fase 5: handleButtonResponse(tenantId, lead.leadId, parsed.buttonId)
        console.log(`[webhook] Button "${parsed.buttonId}" from lead ${lead.leadId}`)
      } catch (error) {
        console.error("[webhook] Error processing Meta callback:", error)
      }
    })
  }

  return c.json({ ok: true })
})
```

---

### Task 13: Implement `handleTimeout` for first timeout (WhatsApp)

**Files:**
- Modify: `apps/api/src/services/lead-flow.ts`
- Modify: `apps/api/src/routes/internal.ts`

- [ ] **Step 1: Add `handleTimeout` to `lead-flow.ts`**

```typescript
// Add imports at top of lead-flow.ts
import { queryContactStatus } from "../modules/clientify"
import { sendTemplate } from "../modules/whatsapp"
import { sendEmailToOwner } from "../modules/email"
import { validateCredentials } from "../utils/encryption"

export async function handleTimeout(leadId: string, tenantId: string): Promise<void> {
  const lastEvent = await getLastEvent(leadId, tenantId)

  if (!lastEvent) {
    console.error(`[lead-flow] No events found for lead ${leadId}`)
    return
  }

  const lead = await prisma.leadTracking.findUnique({
    where: { leadId },
    select: { nombreLead: true, telefono: true, externalId: true, email: true },
  })

  if (!lead) return

  if (lastEvent.tipoEvento.nombre === "Lead ingreso") {
    // Primer timeout: consultar CRM + enviar WhatsApp
    await handleFirstTimeout(leadId, tenantId, lead)
  } else if (lastEvent.tipoEvento.nombre === "WhatsApp") {
    // Segundo timeout: llamar VAPI
    // TODO Fase 4: llamar VAPI
    console.log(`[lead-flow] Second timeout for lead ${leadId} — VAPI not yet implemented`)
  }
}

async function handleFirstTimeout(
  leadId: string,
  tenantId: string,
  lead: { nombreLead: string; telefono: string | null; externalId: string | null; email: string | null }
): Promise<void> {
  // 1. Consultar estado en Clientify
  if (lead.externalId) {
    try {
      const crmStatus = await queryContactStatus(tenantId, lead.externalId)
      if (crmStatus) {
        const estado = await prisma.catEstadoGestion.findFirst({
          where: { nombre: crmStatus },
        })
        if (estado) {
          await prisma.leadTracking.update({
            where: { leadId },
            data: { idEstado: estado.id },
          })
        }
      }
    } catch (error) {
      console.error(`[lead-flow] Error consulting Clientify for lead ${leadId}:`, error)
    }
  }

  // 2. Validar credenciales de WhatsApp
  try {
    await validateCredentials(tenantId, "whatsapp", ["phone_number_id", "access_token"])
  } catch (error) {
    console.error(`[lead-flow] WhatsApp credentials error for tenant ${tenantId}:`, error)
    await handleCredentialError(leadId, tenantId, lead.nombreLead, "whatsapp")
    return
  }

  // 3. Enviar template WhatsApp
  try {
    await sendTemplate(tenantId, lead.telefono!, "rol_primer_contacto", "es", {
      nombre: lead.nombreLead,
    })
  } catch (error: unknown) {
    const err = error as Error & { code?: string }
    if (err.code === "INVALID_NUMBER") {
      console.error(`[lead-flow] Invalid WhatsApp number for lead ${leadId}`)

      const tipoTimeout = await prisma.catTipoEvento.findFirst({ where: { nombre: "Timeout" } })
      if (tipoTimeout) {
        await prisma.leadEventHistory.create({
          data: {
            tenantId,
            leadId,
            idTipoEvento: tipoTimeout.id,
            actorIntervencion: "IA",
            descripcion: "Error: número de WhatsApp inválido",
          },
        })
      }

      await sendEmailToOwner(
        tenantId,
        "Número de WhatsApp inválido",
        `<p>El lead <strong>${lead.nombreLead}</strong> tiene un número de WhatsApp inválido: ${lead.telefono}</p>`
      )

      await endFlow(tenantId, leadId)
      return
    }
    throw error
  }

  // 4. Actualizar estado a "Contactado"
  const estadoContactado = await prisma.catEstadoGestion.findFirst({
    where: { nombre: "Contactado" },
  })
  if (estadoContactado) {
    await prisma.leadTracking.update({
      where: { leadId },
      data: { idEstado: estadoContactado.id },
    })
  }

  // 5. Registrar evento "WhatsApp"
  const tipoWhatsApp = await prisma.catTipoEvento.findFirst({ where: { nombre: "WhatsApp" } })
  if (tipoWhatsApp) {
    await prisma.leadEventHistory.create({
      data: {
        tenantId,
        leadId,
        idTipoEvento: tipoWhatsApp.id,
        actorIntervencion: "IA",
        descripcion: `Template rol_primer_contacto enviado a ${lead.telefono}`,
      },
    })
  }

  // 6. Crear segundo Cloud Task
  const tiempoRespuesta = await getTiempoRespuesta(tenantId)
  const taskId = `lead-${leadId}-timer2`
  const taskName = await createTask(
    taskId,
    `/internal/lead-timeout/${leadId}`,
    tiempoRespuesta
  )

  await prisma.leadTracking.update({
    where: { leadId },
    data: { flowJobId: taskName },
  })

  console.log(`[lead-flow] WhatsApp sent, second timer created for lead ${leadId}`)
}

async function handleCredentialError(
  leadId: string,
  tenantId: string,
  nombreLead: string,
  platform: string
): Promise<void> {
  const tipoTimeout = await prisma.catTipoEvento.findFirst({ where: { nombre: "Timeout" } })
  if (tipoTimeout) {
    await prisma.leadEventHistory.create({
      data: {
        tenantId,
        leadId,
        idTipoEvento: tipoTimeout.id,
        actorIntervencion: "IA",
        descripcion: `Error de credenciales: ${platform}`,
      },
    })
  }

  await sendEmailToOwner(
    tenantId,
    `Error de credenciales de ${platform}`,
    `<p>Error de credenciales de <strong>${platform}</strong> al intentar contactar al lead <strong>${nombreLead}</strong>.</p><p>Verifique la configuración en la bóveda de seguridad.</p>`
  )

  await endFlow(tenantId, leadId)
}
```

- [ ] **Step 2: Connect `handleTimeout` in `internal.ts`**

In `internal.ts`, replace the TODO in the lead-timeout handler:

```typescript
import { getLastEvent, endFlow, handleTimeout } from "../services/lead-flow"  // ADD handleTimeout

// Replace the TODO comment in the lead-timeout handler:
  // Execute next step
  await handleTimeout(leadId, lead.tenantId)

  return c.json({ ok: true })
```

- [ ] **Step 3: Add pending documentation to CLAUDE.md**

Add to the "Implementaciones futuras (pendientes)" section of `CLAUDE.md`:

```markdown
### Validación pre-WhatsApp contra CRM en producción
- Antes de enviar el mensaje WhatsApp automático, consultar el estado del lead en la API del CRM origen (Clientify u otro)
- Si el lead ya fue atendido por un asesor humano (estado actualizado en el CRM), NO enviar el WhatsApp y terminar el flujo
- En MVP se omite esta validación y se envía WhatsApp directamente
```

(Note: this section already exists in CLAUDE.md, verify it's still there.)

- [ ] **Step 4: Validate Fase 3**

Deploy y probar:

1. Enviar lead via webhook → timer 1 se crea
2. Timer vence → endpoint timeout recibe llamada → consulta Clientify → envía WhatsApp
3. Lead recibe template con botones en su WhatsApp
4. Lead presiona botón → webhook de Meta llega y se logea
5. Test con número inválido → flujo se cierra + email al owner

---

## Chunk 4: Fase 4 — Módulo VAPI + Segundo timeout completo

### Task 14: Create VAPI module

**Files:**
- Create: `apps/api/src/modules/vapi.ts`

- [ ] **Step 1: Create `vapi.ts`**

```typescript
// apps/api/src/modules/vapi.ts
import { validateCredentials } from "../utils/encryption"

export async function makeOutboundCall(
  tenantId: string,
  phoneNumber: string
): Promise<void> {
  const credentials = await validateCredentials(tenantId, "vapi", [
    "assistant_id",
    "auth_token",
  ])

  const response = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.auth_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assistantId: credentials.assistant_id,
      customer: { number: phoneNumber },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Error VAPI call: ${response.status} - ${error}`)
  }

  console.log(`[vapi] Outbound call initiated to ${phoneNumber} for tenant ${tenantId}`)
}
```

---

### Task 15: Implement second timeout (VAPI)

**Files:**
- Modify: `apps/api/src/services/lead-flow.ts`

- [ ] **Step 1: Add VAPI to handleTimeout**

Add import at top:

```typescript
import { makeOutboundCall } from "../modules/vapi"
```

Replace the TODO in `handleTimeout` for the "WhatsApp" case:

```typescript
  } else if (lastEvent.tipoEvento.nombre === "WhatsApp") {
    // Segundo timeout: llamar VAPI
    try {
      await validateCredentials(tenantId, "vapi", ["assistant_id", "auth_token"])
    } catch (error) {
      console.error(`[lead-flow] VAPI credentials error for tenant ${tenantId}:`, error)
      await handleCredentialError(leadId, tenantId, lead.nombreLead, "vapi")
      return
    }

    try {
      await makeOutboundCall(tenantId, lead.telefono!)
    } catch (error) {
      console.error(`[lead-flow] VAPI call error for lead ${leadId}:`, error)
    }

    // Registrar evento "Llamada"
    const tipoLlamada = await prisma.catTipoEvento.findFirst({ where: { nombre: "Llamada" } })
    if (tipoLlamada) {
      await prisma.leadEventHistory.create({
        data: {
          tenantId,
          leadId,
          idTipoEvento: tipoLlamada.id,
          actorIntervencion: "IA",
          descripcion: `Llamada VAPI a ${lead.telefono}`,
        },
      })
    }

    await endFlow(tenantId, leadId)
  }
```

- [ ] **Step 2: Validate Fase 4**

Deploy y probar:

1. Lead pasa timer 1 → WhatsApp enviado
2. Sin respuesta al WhatsApp → timer 2 vence
3. Llamada VAPI se ejecuta → evento "Llamada" registrado → `flow_job_id` limpiado

---

## Chunk 5: Fase 5 — Acciones de botones + Validación completa

### Task 16: Implement `handleButtonResponse`

**Files:**
- Modify: `apps/api/src/services/lead-flow.ts`

- [ ] **Step 1: Add `handleButtonResponse` to `lead-flow.ts`**

```typescript
import { sendTextMessage } from "../modules/whatsapp"

export async function handleButtonResponse(
  tenantId: string,
  leadId: string,
  buttonId: string
): Promise<void> {
  const lead = await prisma.leadTracking.findUnique({
    where: { leadId },
    select: { nombreLead: true, telefono: true },
  })

  if (!lead) return

  // Verify flow is still active (last event = "WhatsApp")
  const lastEvent = await getLastEvent(leadId, tenantId)
  if (!lastEvent || lastEvent.tipoEvento.nombre !== "WhatsApp") {
    console.log(`[lead-flow] Lead ${leadId} not waiting for button response, skipping`)
    return
  }

  switch (buttonId) {
    case "llamar_ahora":
      await handleLlamarAhora(leadId, tenantId, lead)
      break
    case "agendar_cita":
      await handleAgendarCita(leadId, tenantId, lead)
      break
    case "no_contactar":
      await handleNoContactar(leadId, tenantId, lead)
      break
    default:
      console.error(`[lead-flow] Unknown button: ${buttonId}`)
  }
}

async function handleLlamarAhora(
  leadId: string,
  tenantId: string,
  lead: { nombreLead: string; telefono: string | null }
): Promise<void> {
  try {
    await validateCredentials(tenantId, "vapi", ["assistant_id", "auth_token"])
    await makeOutboundCall(tenantId, lead.telefono!)
  } catch (error) {
    console.error(`[lead-flow] VAPI error for lead ${leadId}:`, error)
    await handleCredentialError(leadId, tenantId, lead.nombreLead, "vapi")
    return
  }

  const tipoLlamada = await prisma.catTipoEvento.findFirst({ where: { nombre: "Llamada" } })
  if (tipoLlamada) {
    await prisma.leadEventHistory.create({
      data: {
        tenantId,
        leadId,
        idTipoEvento: tipoLlamada.id,
        actorIntervencion: "IA",
        descripcion: "Llamada VAPI solicitada por lead",
      },
    })
  }

  await endFlow(tenantId, leadId)
}

async function handleAgendarCita(
  leadId: string,
  tenantId: string,
  lead: { nombreLead: string; telefono: string | null }
): Promise<void> {
  let calendarUrl: string

  try {
    const credentials = await validateCredentials(tenantId, "google_calendar", ["calendar_url"])
    calendarUrl = credentials.calendar_url
  } catch (error) {
    console.error(`[lead-flow] Calendar credentials error for tenant ${tenantId}:`, error)
    await handleCredentialError(leadId, tenantId, lead.nombreLead, "google_calendar")
    return
  }

  try {
    await validateCredentials(tenantId, "whatsapp", ["phone_number_id", "access_token"])
    await sendTextMessage(
      tenantId,
      lead.telefono!,
      `¡Hola ${lead.nombreLead}! Agenda tu cita aquí: ${calendarUrl}`
    )
  } catch (error) {
    console.error(`[lead-flow] WhatsApp text error for lead ${leadId}:`, error)
    await handleCredentialError(leadId, tenantId, lead.nombreLead, "whatsapp")
    return
  }

  const tipoCita = await prisma.catTipoEvento.findFirst({ where: { nombre: "Cita" } })
  if (tipoCita) {
    await prisma.leadEventHistory.create({
      data: {
        tenantId,
        leadId,
        idTipoEvento: tipoCita.id,
        actorIntervencion: "IA",
        descripcion: `Enlace de calendario enviado a ${lead.telefono}`,
      },
    })
  }

  await endFlow(tenantId, leadId)
}

async function handleNoContactar(
  leadId: string,
  tenantId: string,
  lead: { nombreLead: string; telefono: string | null }
): Promise<void> {
  await sendEmailToOwner(
    tenantId,
    "Lead rechazó contacto",
    `<p>El lead <strong>${lead.nombreLead}</strong> (${lead.telefono}) seleccionó "No Contactar".</p>`
  )

  // Registrar evento con descripcion "No contactar"
  const tipoWhatsApp = await prisma.catTipoEvento.findFirst({ where: { nombre: "WhatsApp" } })
  if (tipoWhatsApp) {
    await prisma.leadEventHistory.create({
      data: {
        tenantId,
        leadId,
        idTipoEvento: tipoWhatsApp.id,
        actorIntervencion: "IA",
        descripcion: "No contactar",
      },
    })
  }

  // Actualizar estado a "Nuevo"
  const estadoNuevo = await prisma.catEstadoGestion.findFirst({ where: { nombre: "Nuevo" } })
  if (estadoNuevo) {
    await prisma.leadTracking.update({
      where: { leadId },
      data: { idEstado: estadoNuevo.id },
    })
  }

  await endFlow(tenantId, leadId)
}
```

---

### Task 17: Connect button responses in Meta webhook

**Files:**
- Modify: `apps/api/src/routes/webhook.ts`

- [ ] **Step 1: Replace TODO in Meta callback**

In `webhook.ts`, replace the TODO in the Meta POST handler:

```typescript
import { handleButtonResponse } from "../services/lead-flow"  // ADD at top

// Replace the TODO in the button_reply processing:
        // Verify lead has active flow
        const lastEvent = await prisma.leadEventHistory.findFirst({
          where: { leadId: lead.leadId, tenantId },
          orderBy: { timestamp: "desc" },
          include: { tipoEvento: true },
        })

        if (lastEvent?.tipoEvento.nombre !== "WhatsApp") {
          console.log(`[webhook] Lead ${lead.leadId} not waiting for response, skipping`)
          return
        }

        await handleButtonResponse(tenantId, lead.leadId, parsed.buttonId!)
```

- [ ] **Step 2: Validate Fase 5 — Flujo completo end-to-end**

Deploy y probar el flujo completo:

1. `POST /webhook/clientify/:idEmpresa` → lead creado + timer 1
2. Timer 1 vence → consulta Clientify → WhatsApp template enviado + timer 2
3. **Test botón "Llamar Ahora"** → VAPI call → evento "Llamada" → flujo cerrado
4. **Test botón "Agendar Cita"** → Calendar link por WhatsApp → evento "Cita" → flujo cerrado
5. **Test botón "No Contactar"** → email al owner → evento "No contactar" → estado "Nuevo" → flujo cerrado
6. **Test sin respuesta** → timer 2 vence → VAPI call → evento "Llamada" → flujo cerrado
7. **Test credenciales inválidas** → email al owner → evento Timeout → flujo cerrado
8. **Test cleanup** → lead con > 12h → evento Timeout → flujo cerrado
9. **Test lead sin teléfono** → lead creado, sin flujo, email al owner
10. **Test idempotencia** → mismo lead → no duplica

---

## Post-implementation

- [ ] Verify CLAUDE.md has all pending items documented (pre-WhatsApp CRM validation, retry/backoff, observability)
- [ ] Deploy final version to Cloud Run
- [ ] Create Cloud Scheduler job for cleanup: `gcloud scheduler jobs create http lead-cleanup --schedule="0 * * * *" --uri="https://{API_BASE_URL}/internal/lead-cleanup" --http-method=POST`
- [ ] Configure Meta webhook URL in each tenant's Meta App
