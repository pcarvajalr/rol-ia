# Semaforo Configurable + Mapeo de Estados CRM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow tenants to configure semaphore thresholds (green/yellow timers), persist semaphore time+color when flows end, and react to CRM status changes on existing leads via webhook (state mapping, flow termination, audit log).

**Architecture:** Two features sharing a common base (schema changes + lead-flow modifications). Feature 1 adds configurable thresholds to the existing Guardian settings and modifies the abandonment endpoint/component. Feature 2 adds CRM state mapping tables, modifies the webhook handler to process existing leads, and adds a webhook audit log. Both features converge in `stopFlowWithSemaphore` which replaces direct `endFlow` calls.

**Tech Stack:** Prisma ORM + PostgreSQL, Hono API (TypeScript), React 19 + Vite + shadcn/ui + Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-03-21-semaforo-configurable-mapeo-crm-design.md`

**Nota sobre commits:** Seguir la regla del proyecto: NO hacer commits intermedios durante la implementacion. Un solo commit al finalizar cuando el usuario confirme que todo funciona.

---

## File Structure

### Files to modify

| File | Responsibility |
|------|---------------|
| `apps/api/prisma/schema.prisma` | Add 3 fields to LeadTracking, 2 new models, relations |
| `apps/api/prisma/seed.ts` | Add "Eliminado" + "En proceso" validation, cleanup order, demo mappings |
| `apps/api/src/modules/clientify.ts` | Add `status` to NormalizedLead interface and parser |
| `apps/api/src/services/lead-flow.ts` | Add `stopFlowWithSemaphore`, integrate into all termination points |
| `apps/api/src/routes/settings.ts` | Add defaults, new CRUD endpoints for crm-mapping, estados-gestion, webhook-log |
| `apps/api/src/routes/webhook.ts` | New logic for existing leads: status comparison, endFlow, WebhookRequestLog. Uses `prisma` (not `db`) |
| `apps/api/src/routes/intel.ts` | Add thresholds to response, isFlowActive flag, mixed query |
| `apps/api/src/routes/internal.ts` | Replace `endFlow` with `stopFlowWithSemaphore` in cleanup handler |
| `apps/web/src/components/intel-abandonment.tsx` | Dynamic thresholds, uncapped timer, friendly format, progress bar |
| `apps/web/src/components/guardian-config.tsx` | Add verde/amarillo inputs with dynamic rojo calculation |
| `apps/web/src/pages/DashboardPage.tsx` | Pass thresholds, add CRM mapping section |

### Files to create

| File | Responsibility |
|------|---------------|
| `apps/web/src/components/crm-state-mapping.tsx` | CRM mapping config UI: form + table + delete |
| `apps/web/src/components/webhook-log.tsx` | Collapsible webhook audit log with pagination |

**Note on `packages/shared`:** The spec mentions shared types, but currently `packages/shared` only has auth/user/tenant types — no lead-related types exist there. All lead/flow types are defined locally in each app. This plan follows the same pattern: types are defined inline where they are used. If the project moves to shared lead types in the future, these can be extracted then.

---

## Task 1: Prisma Schema Changes

**Files:**
- Modify: `apps/api/prisma/schema.prisma:97-118` (LeadTracking model)
- Modify: `apps/api/prisma/schema.prisma:85-93` (CatEstadoGestion — add relations)
- Modify: `apps/api/prisma/schema.prisma:13-39` (Tenant — add relations)

- [ ] **Step 1: Add 3 new fields to LeadTracking model**

In `apps/api/prisma/schema.prisma`, inside the `LeadTracking` model (after line 107, the `flowJobId` field), add:

```prisma
  crmStatusInicial String?  @map("crm_status_inicial")
  semaphoreTimeMs  BigInt?  @map("semaphore_time_ms")
  semaphoreColor   String?  @map("semaphore_color")
```

Also add the new relation at the end of the relations block (after `citas`):

```prisma
  webhookLogs WebhookRequestLog[]
```

- [ ] **Step 2: Add CrmStateMapping model**

After the `LeadEventHistory` model (after line 136), add:

```prisma
model CrmStateMapping {
  id                 Int              @id @default(autoincrement())
  tenantId           String           @map("tenant_id") @db.Uuid
  platformSlug       String           @map("platform_slug")
  crmStatus          String           @map("crm_status")
  catEstadoGestionId Int              @map("cat_estado_gestion_id")

  tenant        Tenant            @relation(fields: [tenantId], references: [id])
  estadoGestion CatEstadoGestion  @relation(fields: [catEstadoGestionId], references: [id])

  @@unique([tenantId, platformSlug, crmStatus])
  @@index([tenantId])
  @@map("crm_state_mapping")
}
```

- [ ] **Step 3: Add WebhookRequestLog model**

After the `CrmStateMapping` model, add:

```prisma
model WebhookRequestLog {
  id         String   @id @default(uuid())
  tenantId   String   @map("tenant_id") @db.Uuid
  source     String
  externalId String?  @map("external_id")
  crmStatus  String?  @map("crm_status")
  leadId     String?  @map("lead_id")
  action     String
  payload    Json?
  timestamp  DateTime @default(now())

  tenant Tenant        @relation(fields: [tenantId], references: [id])
  lead   LeadTracking? @relation(fields: [leadId], references: [leadId], onDelete: SetNull)

  @@index([tenantId, timestamp])
  @@index([tenantId, externalId])
  @@map("webhook_request_log")
}
```

- [ ] **Step 4: Add relations to Tenant model**

In the `Tenant` model (lines 13-39), add in the relations section:

```prisma
  crmStateMappings  CrmStateMapping[]
  webhookRequestLogs WebhookRequestLog[]
```

- [ ] **Step 5: Add relation to CatEstadoGestion model**

In the `CatEstadoGestion` model (lines 85-93), add:

```prisma
  crmStateMappings CrmStateMapping[]
```

- [ ] **Step 6: Run migration**

```bash
cd apps/api && pnpm prisma migrate dev --name add-semaphore-crm-mapping
```

Expected: Migration creates new columns on `leads_tracking`, new tables `crm_state_mapping` and `webhook_request_log`.

- [ ] **Step 7: Generate Prisma client**

```bash
cd apps/api && pnpm prisma generate
```

---

## Task 2: Seed Updates

**Files:**
- Modify: `apps/api/prisma/seed.ts:68-88` (cleanup order)
- Modify: `apps/api/prisma/seed.ts:122-137` (CatEstadoGestion entries)

- [ ] **Step 1: Update cleanup order**

In `seed.ts`, add cleanup for new tables BEFORE `leadTracking` delete (before line 76). Insert after `citaAgendada.deleteMany` (line 75):

```typescript
    await prisma.webhookRequestLog.deleteMany({ where: { tenantId: ADMIN_TENANT_ID } })
```

Also add after line 78 (`configGuardian.deleteMany`):

```typescript
    await prisma.crmStateMapping.deleteMany({ where: { tenantId: ADMIN_TENANT_ID } })
```

- [ ] **Step 2: Add "Eliminado" to CatEstadoGestion**

In the CatEstadoGestion creation block (lines 122-137), add a 6th entry:

```typescript
    { nombre: "Eliminado", color: "#6b7280" },
```

- [ ] **Step 3: Add demo CRM state mappings**

After the CatEstadoGestion creation block, add demo mappings. First, look up the estado IDs:

```typescript
    // Demo CRM state mappings
    const estadoEnProceso = await prisma.catEstadoGestion.findFirst({ where: { nombre: "En proceso" } })
    const estadoCerrado = await prisma.catEstadoGestion.findFirst({ where: { nombre: "Cerrado" } })
    const estadoPerdido = await prisma.catEstadoGestion.findFirst({ where: { nombre: "Perdido" } })

    if (estadoEnProceso && estadoCerrado && estadoPerdido) {
      await prisma.crmStateMapping.createMany({
        data: [
          { tenantId: ADMIN_TENANT_ID, platformSlug: "clientify", crmStatus: "contactado", catEstadoGestionId: estadoEnProceso.id },
          { tenantId: ADMIN_TENANT_ID, platformSlug: "clientify", crmStatus: "en gestion", catEstadoGestionId: estadoEnProceso.id },
          { tenantId: ADMIN_TENANT_ID, platformSlug: "clientify", crmStatus: "ganado", catEstadoGestionId: estadoCerrado.id },
          { tenantId: ADMIN_TENANT_ID, platformSlug: "clientify", crmStatus: "perdido", catEstadoGestionId: estadoPerdido.id },
        ],
      })
      console.log("  CRM state mappings created")
    }
```

- [ ] **Step 4: Run seed to verify**

```bash
cd apps/api && pnpm db:seed
```

Expected: Seed completes without errors, "Eliminado" state created, demo mappings created.

---

## Task 3: Add `status` to NormalizedLead (clientify.ts)

**Files:**
- Modify: `apps/api/src/modules/clientify.ts:20-26` (NormalizedLead interface)
- Modify: `apps/api/src/modules/clientify.ts:28-45` (parseClientifyPayload return)

- [ ] **Step 1: Add `status` to NormalizedLead interface**

In `clientify.ts` lines 20-26, add `status` field:

```typescript
interface NormalizedLead {
  externalId: string
  nombreLead: string
  fuente: string
  telefono: string | null
  email: string | null
  status: string | null
}
```

- [ ] **Step 2: Add `status` to parseClientifyPayload return**

In the return object of `parseClientifyPayload` (around line 38-44), add:

```typescript
    status: payload.status || null,
```

---

## Task 4: `stopFlowWithSemaphore` in lead-flow.ts

**Depends on:** Task 1 (prisma generate must have run)

**Files:**
- Modify: `apps/api/src/services/lead-flow.ts:9-22` (add defaults and helper)
- Modify: `apps/api/src/services/lead-flow.ts:421-437` (endFlow — integrate semaphore)
- Modify: `apps/api/src/services/lead-flow.ts:245-281` (handleButtonResponse — use stopFlowWithSemaphore)
- Modify: `apps/api/src/services/lead-flow.ts:50-98` (handleTimeout — use stopFlowWithSemaphore for VAPI branch)
- Modify: `apps/api/src/services/lead-flow.ts:100-243` (handleFirstTimeout — replace endFlow calls at lines ~168, ~192)
- Modify: `apps/api/src/services/lead-flow.ts:~418` (handleCredentialError — replace endFlow call)
- Modify: `apps/api/src/routes/internal.ts` (lead-cleanup — replace endFlow)

- [ ] **Step 1: Add semaphore defaults and helper function**

In `lead-flow.ts`, update the `GUARDIAN_DEFAULTS` constant (lines 9-11) to include semaphore thresholds:

```typescript
const GUARDIAN_DEFAULTS = {
  tiempoRespuestaLeadSeg: 15,
  tiempoVerdeMins: 5,
  tiempoAmarilloMins: 5,
}
```

After `getTiempoRespuesta` function (after line 22), add `getGuardianSettings`:

```typescript
async function getGuardianSettings(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  })
  const settings = tenant?.settings as Record<string, unknown> | null
  const guardian = settings?.guardian as Record<string, unknown> | null
  return {
    tiempoVerdeMins: (guardian?.tiempoVerdeMins as number) || GUARDIAN_DEFAULTS.tiempoVerdeMins,
    tiempoAmarilloMins: (guardian?.tiempoAmarilloMins as number) || GUARDIAN_DEFAULTS.tiempoAmarilloMins,
  }
}

function calculateSemaphoreColor(
  timeMs: number,
  tiempoVerdeMins: number,
  tiempoAmarilloMins: number
): string {
  const verdeMs = tiempoVerdeMins * 60000
  const amarilloMs = tiempoAmarilloMins * 60000
  if (timeMs <= verdeMs) return "verde"
  if (timeMs <= verdeMs + amarilloMs) return "amarillo"
  return "rojo"
}
```

- [ ] **Step 2: Create `stopFlowWithSemaphore` function**

Before the existing `endFlow` function (before line 421), add:

```typescript
export async function stopFlowWithSemaphore(tenantId: string, leadId: string): Promise<void> {
  const lead = await prisma.leadTracking.findUnique({
    where: { leadId },
    select: { fechaCreacion: true, flowJobId: true },
  })

  if (!lead) return

  const timeMs = Date.now() - lead.fechaCreacion.getTime()
  const { tiempoVerdeMins, tiempoAmarilloMins } = await getGuardianSettings(tenantId)
  const color = calculateSemaphoreColor(timeMs, tiempoVerdeMins, tiempoAmarilloMins)

  await prisma.leadTracking.update({
    where: { leadId },
    data: {
      semaphoreTimeMs: BigInt(timeMs),
      semaphoreColor: color,
    },
  })

  await endFlow(tenantId, leadId)
}
```

- [ ] **Step 3: Replace `endFlow` calls in `handleButtonResponse`**

In `handleButtonResponse` (lines 245-281), find every call to `endFlow(tenantId, leadId)` and replace with `stopFlowWithSemaphore(tenantId, leadId)`. There should be calls in the `llamar_ahora`, `agendar_cita`, and `no_contactar` branches.

- [ ] **Step 4: Replace `endFlow` call in `handleTimeout` (VAPI branch)**

In `handleTimeout` (lines 50-98), the second timeout branch (when last event is "WhatsApp") calls VAPI and then `endFlow`. Replace that `endFlow` call with `stopFlowWithSemaphore(tenantId, leadId)`.

- [ ] **Step 5: Replace `endFlow` calls in `handleFirstTimeout` error paths**

In `handleFirstTimeout` (lines 100-243), there are `endFlow` calls at ~line 168 (invalid phone number error) and ~line 192 (other error paths). Replace ALL `endFlow(tenantId, leadId)` calls in this function with `stopFlowWithSemaphore(tenantId, leadId)`.

- [ ] **Step 6: Replace `endFlow` call in `handleCredentialError`**

In `handleCredentialError` (~line 418), replace the `endFlow(tenantId, leadId)` call with `stopFlowWithSemaphore(tenantId, leadId)`. This covers credential-error terminations (missing WhatsApp/VAPI creds).

- [ ] **Step 7: Update the cleanup handler reference**

In `apps/api/src/routes/internal.ts`, the `lead-cleanup` endpoint calls `endFlow` for timed-out leads. Replace with `stopFlowWithSemaphore`. Add the import:

```typescript
import { stopFlowWithSemaphore } from "../services/lead-flow"
```

Replace the `endFlow` call in the cleanup loop with `stopFlowWithSemaphore(lead.tenantId, lead.leadId)`.

**IMPORTANT:** After all replacements, do a global search for `endFlow(` in `lead-flow.ts` and `internal.ts`. The ONLY remaining call to `endFlow` should be inside `stopFlowWithSemaphore` itself. Every other termination path must go through `stopFlowWithSemaphore`.

- [ ] **Step 8: Verify build**

```bash
cd apps/api && pnpm build
```

Expected: No TypeScript errors.

---

## Task 5: Backend — Settings Endpoints

**Files:**
- Modify: `apps/api/src/routes/settings.ts:14-19` (GUARDIAN_DEFAULTS)
- Modify: `apps/api/src/routes/settings.ts:45-110` (PUT validation)
- Modify: `apps/api/src/routes/settings.ts` (add new endpoints at end)

- [ ] **Step 1: Update GUARDIAN_DEFAULTS**

In `settings.ts` lines 14-19, add the semaphore defaults:

```typescript
const GUARDIAN_DEFAULTS = {
  slaMinutes: 7,
  criticalState: "cold-lead",
  doubleTouchMinutes: 2,
  tiempoRespuestaLeadSeg: 15,
  tiempoVerdeMins: 5,
  tiempoAmarilloMins: 5,
}
```

- [ ] **Step 2: Add validation for new fields in PUT handler**

In the PUT `/settings/guardian` handler (around lines 45-110), add validation blocks for the new fields. After the `doubleTouchMinutes` validation (around line 70), add:

```typescript
  if (body.tiempoVerdeMins !== undefined) {
    const val = Number(body.tiempoVerdeMins)
    if (!Number.isInteger(val) || val < 1 || val > 30) {
      return c.json({ error: "tiempoVerdeMins debe ser entero entre 1 y 30" }, 400)
    }
  }

  if (body.tiempoAmarilloMins !== undefined) {
    const val = Number(body.tiempoAmarilloMins)
    if (!Number.isInteger(val) || val < 1 || val > 30) {
      return c.json({ error: "tiempoAmarilloMins debe ser entero entre 1 y 30" }, 400)
    }
  }
```

Also, in the merge block of the PUT handler (around lines 86-89), the existing code assigns accepted fields to `guardianUpdate` with explicit `if (body.X !== undefined) guardianUpdate.X = body.X` blocks. Add two new assignment blocks following the same pattern:

```typescript
  if (body.tiempoVerdeMins !== undefined) guardianUpdate.tiempoVerdeMins = Number(body.tiempoVerdeMins)
  if (body.tiempoAmarilloMins !== undefined) guardianUpdate.tiempoAmarilloMins = Number(body.tiempoAmarilloMins)
```

Without these assignments, validation will pass but the values will never be saved to the DB.

- [ ] **Step 3: Add GET /settings/estados-gestion endpoint**

Before the router export (line 112), add:

```typescript
settings.get("/estados-gestion", async (c) => {
  const estados = await prisma.catEstadoGestion.findMany({
    orderBy: { id: "asc" },
  })
  return c.json({ estados })
})
```

- [ ] **Step 4: Add GET /settings/crm-mapping endpoint**

```typescript
settings.get("/crm-mapping", async (c) => {
  const tenantId = c.get("tenantId")
  const mappings = await prisma.crmStateMapping.findMany({
    where: { tenantId },
    include: { estadoGestion: { select: { id: true, nombre: true } } },
    orderBy: { id: "asc" },
  })
  return c.json({ mappings })
})
```

- [ ] **Step 5: Add POST /settings/crm-mapping endpoint**

```typescript
settings.post("/crm-mapping", async (c) => {
  const tenantId = c.get("tenantId")
  const body = await c.req.json()

  const { platformSlug, crmStatus, catEstadoGestionId } = body
  if (!platformSlug || !crmStatus || !catEstadoGestionId) {
    return c.json({ error: "platformSlug, crmStatus y catEstadoGestionId son requeridos" }, 400)
  }

  const normalizedStatus = String(crmStatus).toLowerCase().trim()
  if (!normalizedStatus) {
    return c.json({ error: "crmStatus no puede estar vacio" }, 400)
  }

  // Verify catEstadoGestionId exists
  const estado = await prisma.catEstadoGestion.findUnique({
    where: { id: Number(catEstadoGestionId) },
  })
  if (!estado) {
    return c.json({ error: "Estado de gestion no encontrado" }, 404)
  }

  // Check unique constraint
  const existing = await prisma.crmStateMapping.findFirst({
    where: { tenantId, platformSlug, crmStatus: normalizedStatus },
  })
  if (existing) {
    return c.json({ error: `El estado CRM "${crmStatus}" ya esta mapeado para ${platformSlug}` }, 409)
  }

  const mapping = await prisma.crmStateMapping.create({
    data: {
      tenantId,
      platformSlug,
      crmStatus: normalizedStatus,
      catEstadoGestionId: Number(catEstadoGestionId),
    },
    include: { estadoGestion: { select: { id: true, nombre: true } } },
  })

  return c.json({ mapping }, 201)
})
```

- [ ] **Step 6: Add DELETE /settings/crm-mapping/:id endpoint**

```typescript
settings.delete("/crm-mapping/:id", async (c) => {
  const tenantId = c.get("tenantId")
  const id = Number(c.req.param("id"))

  const mapping = await prisma.crmStateMapping.findFirst({
    where: { id, tenantId },
  })
  if (!mapping) {
    return c.json({ error: "Mapeo no encontrado" }, 404)
  }

  await prisma.crmStateMapping.delete({ where: { id } })
  return c.json({ ok: true })
})
```

- [ ] **Step 7: Add GET /settings/webhook-log endpoint**

```typescript
settings.get("/webhook-log", async (c) => {
  const tenantId = c.get("tenantId")
  const page = Math.max(1, Number(c.req.query("page")) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize")) || 20))
  const source = c.req.query("source")

  const where: { tenantId: string; source?: string } = { tenantId }
  if (source) where.source = source

  const [logs, total] = await Promise.all([
    prisma.webhookRequestLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        source: true,
        externalId: true,
        crmStatus: true,
        leadId: true,
        action: true,
        timestamp: true,
      },
    }),
    prisma.webhookRequestLog.count({ where }),
  ])

  return c.json({
    logs,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  })
})
```

- [ ] **Step 8: Verify build**

```bash
cd apps/api && pnpm build
```

---

## Task 6: Backend — Webhook Handler for Existing Leads

**Depends on:** Task 1 (schema), Task 3 (NormalizedLead.status), Task 4 (stopFlowWithSemaphore), Task 5 (CrmStateMapping table)

**IMPORTANT:** The existing `handleClientifyWebhook` uses `prisma` directly (NOT `db` from `createTenantClient`). All new code in this function must use `prisma`, not `db`.

**Files:**
- Modify: `apps/api/src/routes/webhook.ts:81-172` (handleClientifyWebhook)
- Modify: `apps/api/src/routes/webhook.ts:35-79` (processWebhookInBackground — add log)

- [ ] **Step 1: Add imports**

At the top of `webhook.ts`, add imports:

```typescript
import { stopFlowWithSemaphore } from "../services/lead-flow"
```

Ensure `prisma` is available (should already be imported).

- [ ] **Step 2: Add `logWebhookRequest` helper**

Before `handleClientifyWebhook`, add:

```typescript
async function logWebhookRequest(data: {
  tenantId: string
  source: string
  externalId: string | null
  crmStatus: string | null
  leadId: string | null
  action: string
  payload: unknown
}) {
  try {
    await prisma.webhookRequestLog.create({
      data: {
        tenantId: data.tenantId,
        source: data.source,
        externalId: data.externalId,
        crmStatus: data.crmStatus,
        leadId: data.leadId,
        action: data.action,
        payload: data.payload as any,
      },
    })
  } catch (err) {
    console.error("[webhook-log] Error saving webhook log:", err)
  }
}
```

- [ ] **Step 3: Modify handleClientifyWebhook — save crmStatusInicial on lead creation**

In `handleClientifyWebhook`, at the lead creation block (around line 135-145), add `crmStatusInicial` to the create data:

```typescript
    crmStatusInicial: lead.status?.toLowerCase() || null,
```

After the lead is created and `startFlow` is called, add the webhook log:

```typescript
    await logWebhookRequest({
      tenantId,
      source: "clientify",
      externalId: lead.externalId,
      crmStatus: lead.status || null,
      leadId: newLead.leadId,
      action: "created",
      payload: body,
    })
```

- [ ] **Step 4: Replace the existing lead skip logic**

Currently lines 96-122 check if the lead exists and returns early. Replace this block with the new logic:

```typescript
    // Check if lead already exists
    const existingLead = await prisma.leadTracking.findFirst({
      where: { tenantId, externalId: lead.externalId, fuente: lead.fuente },
    })

    if (existingLead) {
      const incomingStatus = lead.status?.toLowerCase() || null

      // Lead already completed (no active flow) — just log and skip
      if (!existingLead.flowJobId) {
        await logWebhookRequest({
          tenantId,
          source: "clientify",
          externalId: lead.externalId,
          crmStatus: incomingStatus,
          leadId: existingLead.leadId,
          action: "ignored_completed",
          payload: body,
        })
        return
      }

      // TODO: Detect Clientify delete event
      // Candidates: hook?.event === "contact.deleted" or similar
      // Enable when confirmed via payload capture
      // NOTE: When enabling, review if parseClientifyPayload can handle
      // delete-event payloads (may lack first_name/id fields)
      const isDeleteEvent = false
      if (isDeleteEvent) {
        const estadoEliminado = await prisma.catEstadoGestion.findFirst({
          where: { nombre: "Eliminado" },
        })
        if (estadoEliminado) {
          await prisma.leadTracking.update({
            where: { leadId: existingLead.leadId },
            data: { idEstado: estadoEliminado.id },
          })
        }
        await stopFlowWithSemaphore(tenantId, existingLead.leadId)
        await logWebhookRequest({
          tenantId,
          source: "clientify",
          externalId: lead.externalId,
          crmStatus: incomingStatus,
          leadId: existingLead.leadId,
          action: "deleted",
          payload: body,
        })
        return
      }

      // Same status as initial — ignore, semaphore keeps counting
      // Handles null-null case: if both are null, treat as same (ignored)
      const isSameStatus =
        (incomingStatus === null && existingLead.crmStatusInicial === null) ||
        (incomingStatus !== null &&
          existingLead.crmStatusInicial !== null &&
          incomingStatus === existingLead.crmStatusInicial.toLowerCase())

      if (isSameStatus) {
        await logWebhookRequest({
          tenantId,
          source: "clientify",
          externalId: lead.externalId,
          crmStatus: incomingStatus,
          leadId: existingLead.leadId,
          action: "ignored",
          payload: body,
        })
        return
      }

      // Status changed — stop flow, map state
      await stopFlowWithSemaphore(tenantId, existingLead.leadId)

      // Look up CRM state mapping
      let newEstadoId: number | null = null
      if (incomingStatus) {
        const mapping = await prisma.crmStateMapping.findFirst({
          where: { tenantId, platformSlug: "clientify", crmStatus: incomingStatus },
        })
        if (mapping) {
          newEstadoId = mapping.catEstadoGestionId
        } else {
          // Fallback to "En proceso"
          const enProceso = await prisma.catEstadoGestion.findFirst({
            where: { nombre: "En proceso" },
          })
          if (enProceso) {
            newEstadoId = enProceso.id
          } else {
            console.error("[webhook] Fallback state 'En proceso' not found in CatEstadoGestion")
          }
        }
      }

      if (newEstadoId) {
        await prisma.leadTracking.update({
          where: { leadId: existingLead.leadId },
          data: { idEstado: newEstadoId },
        })
      }

      await logWebhookRequest({
        tenantId,
        source: "clientify",
        externalId: lead.externalId,
        crmStatus: incomingStatus,
        leadId: existingLead.leadId,
        action: "status_changed",
        payload: body,
      })
      return
    }
```

- [ ] **Step 5: Verify build**

```bash
cd apps/api && pnpm build
```

---

## Task 7: Backend — Intel Abandonment Endpoint

**Files:**
- Modify: `apps/api/src/routes/intel.ts:103-127` (GET /intel/abandonment)

- [ ] **Step 1: Rewrite the abandonment endpoint**

Replace the current handler at lines 103-127 with:

```typescript
intel.get("/abandonment", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ leads: [], thresholds: { tiempoVerdeMins: 5, tiempoAmarilloMins: 5 } })

  const db = createTenantClient(tenantId)
  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  // Load tenant guardian settings for thresholds
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  })
  const settings = tenant?.settings as Record<string, unknown> | null
  const guardian = settings?.guardian as Record<string, unknown> | null
  const tiempoVerdeMins = (guardian?.tiempoVerdeMins as number) || 5
  const tiempoAmarilloMins = (guardian?.tiempoAmarilloMins as number) || 5

  // Active leads (flow in progress)
  const activeLeads = await db.leadTracking.findMany({
    where: { tenantId, flowJobId: { not: null } },
    orderBy: { fechaCreacion: "desc" },
    take: 10,
  })

  // Recently completed leads with semaphore data (last 24h)
  const completedLeads = await db.leadTracking.findMany({
    where: {
      tenantId,
      flowJobId: null,
      semaphoreTimeMs: { not: null },
      fechaCreacion: { gte: twentyFourHoursAgo },
    },
    orderBy: { fechaCreacion: "desc" },
    take: 6,
  })

  const mapLead = (l: typeof activeLeads[0], isActive: boolean) => ({
    id: l.leadId,
    name: l.nombreLead,
    source: l.fuente,
    waitMs: isActive ? now.getTime() - l.fechaCreacion.getTime() : 0,
    isFlowActive: isActive,
    semaphoreTimeMs: l.semaphoreTimeMs ? Number(l.semaphoreTimeMs) : null,
    semaphoreColor: l.semaphoreColor,
    crmStatusInicial: l.crmStatusInicial,
  })

  const leads = [
    ...activeLeads.map((l) => mapLead(l, true)),
    ...completedLeads.map((l) => mapLead(l, false)),
  ]

  return c.json({
    thresholds: { tiempoVerdeMins, tiempoAmarilloMins },
    leads,
  })
})
```

- [ ] **Step 2: Verify build**

```bash
cd apps/api && pnpm build
```

---

## Task 8: Frontend — Semaforo de Abandono

**Depends on:** Task 7 (new endpoint response format)

**Files:**
- Modify: `apps/web/src/components/intel-abandonment.tsx:13-19` (Lead interface + AbandonmentData)
- Modify: `apps/web/src/components/intel-abandonment.tsx:25-30` (getStatus)
- Modify: `apps/web/src/components/intel-abandonment.tsx:32-37` (formatAgony)
- Modify: `apps/web/src/components/intel-abandonment.tsx:70-81` (timer interval)
- Modify: `apps/web/src/components/intel-abandonment.tsx:~87-88` (badge counts — hardcoded 5/10)
- Modify: `apps/web/src/components/intel-abandonment.tsx:~129-142` (legend text — hardcoded thresholds)
- Modify: `apps/web/src/components/intel-abandonment.tsx:156` (progress bar)

- [ ] **Step 1: Update Lead interface**

Replace the `Lead` interface (lines 13-19) with:

```typescript
interface Lead {
  id: string
  name: string
  source: string
  waitMs: number
  isFlowActive: boolean
  semaphoreTimeMs: number | null
  semaphoreColor: string | null
  crmStatusInicial: string | null
}

interface Thresholds {
  tiempoVerdeMins: number
  tiempoAmarilloMins: number
}
```

- [ ] **Step 2: Update getStatus to accept thresholds**

Replace `getStatus` (lines 25-30) with:

```typescript
function getStatus(
  ms: number,
  thresholds: Thresholds
): { label: string; color: string; bg: string; border: string } {
  const verdeMs = thresholds.tiempoVerdeMins * 60000
  const amarilloMs = thresholds.tiempoAmarilloMins * 60000
  if (ms > verdeMs + amarilloMs)
    return { label: "Critico", color: "text-alert", bg: "bg-alert/10", border: "border-alert/30" }
  if (ms > verdeMs)
    return { label: "En riesgo", color: "text-warning", bg: "bg-warning/10", border: "border-warning/30" }
  return { label: "OK", color: "text-rescue", bg: "bg-rescue/10", border: "border-rescue/30" }
}
```

- [ ] **Step 3: Replace formatAgony with friendly time format**

Replace `formatAgony` (lines 32-37) with:

```typescript
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const totalMinutes = Math.floor(totalSeconds / 60)
  const totalHours = Math.floor(totalMinutes / 60)
  const totalDays = Math.floor(totalHours / 24)

  if (totalDays >= 1) {
    const remainingHours = totalHours - totalDays * 24
    return `${totalDays}d ${remainingHours}h`
  }
  if (totalHours >= 1) {
    const remainingMinutes = totalMinutes - totalHours * 60
    return `${totalHours}h ${remainingMinutes}m`
  }
  const minutes = totalMinutes
  const seconds = totalSeconds - minutes * 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}
```

Update all references from `formatAgony` to `formatTime` in the component.

- [ ] **Step 4: Update AbandonmentData interface and add thresholds state**

The existing `AbandonmentData` interface (if present) needs to include `thresholds`. Also add state:

```typescript
interface AbandonmentData {
  leads: Lead[]
  thresholds: Thresholds
}

// In the component:
const [thresholds, setThresholds] = useState<Thresholds>({ tiempoVerdeMins: 5, tiempoAmarilloMins: 5 })
```

Update the fetch response parsing to extract thresholds:

```typescript
const data = await res.json()
setLeads(data.leads || [])
if (data.thresholds) setThresholds(data.thresholds)
```

- [ ] **Step 5: Update timer interval — remove maxMs cap, only increment active leads**

Replace the timer interval (lines 70-81) with:

```typescript
const timerId = setInterval(() => {
  setLeads((prev) =>
    prev.map((l) =>
      l.isFlowActive
        ? { ...l, waitMs: l.waitMs + 1000 }
        : l
    )
  )
}, 1000)
```

No `Math.min` cap. Only increments leads where `isFlowActive === true`.

- [ ] **Step 6: Update progress bar calculation**

Replace the progress bar percentage calculation (line 156, `const pct = Math.min((lead.waitMs / lead.maxMs) * 100, 100)`) with:

```typescript
const redThresholdMs = (thresholds.tiempoVerdeMins + thresholds.tiempoAmarilloMins) * 60000
const displayMs = lead.isFlowActive ? lead.waitMs : (lead.semaphoreTimeMs || 0)
const pct = Math.min((displayMs / redThresholdMs) * 100, 100)
```

- [ ] **Step 7: Update time display for completed leads**

Where the timer text is rendered, use the persisted time for completed leads:

```typescript
const displayMs = lead.isFlowActive ? lead.waitMs : (lead.semaphoreTimeMs || 0)
const timeText = formatTime(displayMs)
```

- [ ] **Step 8: Pass thresholds to getStatus calls**

Update all `getStatus(lead.waitMs)` calls to `getStatus(displayMs, thresholds)`.

- [ ] **Step 9: Update badge counts to use dynamic thresholds**

Find the badge count calculations (~lines 87-88) that use hardcoded `10` and `5`:

```typescript
// OLD:
const critical = sorted.filter((l) => l.waitMs / 60000 > 10).length
const atRisk = sorted.filter((l) => { const m = l.waitMs / 60000; return m > 5 && m <= 10 }).length
```

Replace with:

```typescript
const verdeMs = thresholds.tiempoVerdeMins * 60000
const rojoMs = (thresholds.tiempoVerdeMins + thresholds.tiempoAmarilloMins) * 60000
const critical = sorted.filter((l) => {
  const ms = l.isFlowActive ? l.waitMs : (l.semaphoreTimeMs || 0)
  return ms > rojoMs
}).length
const atRisk = sorted.filter((l) => {
  const ms = l.isFlowActive ? l.waitMs : (l.semaphoreTimeMs || 0)
  return ms > verdeMs && ms <= rojoMs
}).length
```

- [ ] **Step 10: Update legend text to use dynamic thresholds**

Find the legend section (~lines 129-142) with hardcoded "> 10 min" / "> 5 min" text. Replace with dynamic values:

```tsx
// Replace hardcoded "5 min" with:
{thresholds.tiempoVerdeMins} min

// Replace hardcoded "10 min" with:
{thresholds.tiempoVerdeMins + thresholds.tiempoAmarilloMins} min
```

- [ ] **Step 11: Fix timer useEffect dependency**

The existing timer `useEffect` uses `[leads.length > 0]` as dependency (boolean expression). Fix to `[leads.length]`:

```typescript
// OLD: }, [leads.length > 0])
// NEW:
}, [leads.length])
```

- [ ] **Step 12: Verify frontend build**

```bash
cd apps/web && pnpm build
```

---

## Task 9: Frontend — Guardian Config (Semaphore Fields)

**Files:**
- Modify: `apps/web/src/components/guardian-config.tsx:11-22` (props interface)
- Modify: `apps/web/src/components/guardian-config.tsx:36-209` (form layout)
- Modify: `apps/web/src/pages/DashboardPage.tsx:148-153` (state)
- Modify: `apps/web/src/pages/DashboardPage.tsx:155-176` (loadGuardianSettings)
- Modify: `apps/web/src/pages/DashboardPage.tsx:178-203` (handleSaveGuardian)
- Modify: `apps/web/src/pages/DashboardPage.tsx:467-479` (GuardianConfig rendering)

- [ ] **Step 1: Add semaphore props to GuardianConfigProps**

In `guardian-config.tsx` lines 11-22, add:

```typescript
  tiempoVerdeMins: number
  onTiempoVerdeChange: (v: number) => void
  tiempoAmarilloMins: number
  onTiempoAmarilloChange: (v: number) => void
```

- [ ] **Step 2: Add semaphore section to the form**

After the "Ventana de Doble Toque" slider section (around line 142), add a new section before the "Mapeo de Datos" section:

```tsx
      {/* Semaforo de Abandono */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Semaforo de Abandono</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Verde (OK)</Label>
            <span className="text-sm font-mono text-muted-foreground">{tiempoVerdeMins} min</span>
          </div>
          <Slider
            value={[tiempoVerdeMins]}
            onValueChange={([v]) => onTiempoVerdeChange(v)}
            min={1}
            max={30}
            step={1}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Amarillo (En riesgo)</Label>
            <span className="text-sm font-mono text-muted-foreground">
              {tiempoAmarilloMins} min ({tiempoVerdeMins + tiempoAmarilloMins} min max)
            </span>
          </div>
          <Slider
            value={[tiempoAmarilloMins]}
            onValueChange={([v]) => onTiempoAmarilloChange(v)}
            min={1}
            max={30}
            step={1}
          />
        </div>

        <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
          <span className="text-sm text-muted-foreground">Rojo (Critico)</span>
          <span className="text-sm font-mono text-alert">
            &gt; {tiempoVerdeMins + tiempoAmarilloMins} min
          </span>
        </div>
      </div>
```

- [ ] **Step 3: Add state in DashboardPage**

In `DashboardPage.tsx` lines 148-153, add:

```typescript
const [tiempoVerdeMins, setTiempoVerdeMins] = useState(5)
const [tiempoAmarilloMins, setTiempoAmarilloMins] = useState(5)
```

- [ ] **Step 4: Load semaphore settings in loadGuardianSettings**

In the `loadGuardianSettings` effect (lines 155-176), after setting the existing fields, add:

```typescript
if (data.tiempoVerdeMins) setTiempoVerdeMins(data.tiempoVerdeMins)
if (data.tiempoAmarilloMins) setTiempoAmarilloMins(data.tiempoAmarilloMins)
```

- [ ] **Step 5: Include semaphore settings in handleSaveGuardian**

In `handleSaveGuardian` (lines 178-203), add to the request body:

```typescript
tiempoVerdeMins,
tiempoAmarilloMins,
```

- [ ] **Step 6: Pass new props to GuardianConfig**

In the GuardianConfig rendering (lines 467-479), add:

```tsx
  tiempoVerdeMins={tiempoVerdeMins}
  onTiempoVerdeChange={setTiempoVerdeMins}
  tiempoAmarilloMins={tiempoAmarilloMins}
  onTiempoAmarilloChange={setTiempoAmarilloMins}
```

- [ ] **Step 7: Verify frontend build**

```bash
cd apps/web && pnpm build
```

---

## Task 10: Frontend — CRM State Mapping Component

**Files:**
- Create: `apps/web/src/components/crm-state-mapping.tsx`
- Modify: `apps/web/src/pages/DashboardPage.tsx` (add section between Guardian and Vault)

- [ ] **Step 1: Create crm-state-mapping.tsx**

Create `apps/web/src/components/crm-state-mapping.tsx`:

```tsx
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

interface EstadoGestion {
  id: number
  nombre: string
}

interface CrmMapping {
  id: number
  platformSlug: string
  crmStatus: string
  estadoGestion: { id: number; nombre: string }
}

const PLATFORMS = [{ value: "clientify", label: "Clientify" }]

export function CrmStateMapping({ token }: { token: string }) {
  const [estados, setEstados] = useState<EstadoGestion[]>([])
  const [mappings, setMappings] = useState<CrmMapping[]>([])
  const [platform, setPlatform] = useState("clientify")
  const [crmStatus, setCrmStatus] = useState("")
  const [estadoId, setEstadoId] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  const apiUrl = import.meta.env.VITE_API_URL

  const fetchData = async () => {
    try {
      const [estadosRes, mappingsRes] = await Promise.all([
        fetch(`${apiUrl}/api/settings/estados-gestion`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/api/settings/crm-mapping`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      if (estadosRes.ok) {
        const data = await estadosRes.json()
        setEstados(data.estados || [])
      }
      if (mappingsRes.ok) {
        const data = await mappingsRes.json()
        setMappings(data.mappings || [])
      }
    } catch (err) {
      console.error("Error loading CRM mapping data:", err)
    }
  }

  useEffect(() => {
    if (token) fetchData()
  }, [token])

  const handleAdd = async () => {
    if (!crmStatus.trim() || !estadoId) {
      toast.error("Completa todos los campos")
      return
    }

    setIsAdding(true)
    try {
      const res = await fetch(`${apiUrl}/api/settings/crm-mapping`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          platformSlug: platform,
          crmStatus: crmStatus.trim(),
          catEstadoGestionId: Number(estadoId),
        }),
      })

      if (res.status === 409) {
        toast.error(`El estado "${crmStatus}" ya esta mapeado para ${platform}`)
        return
      }

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || "Error al crear mapeo")
        return
      }

      toast.success("Mapeo creado")
      setCrmStatus("")
      setEstadoId("")
      await fetchData()
    } catch {
      toast.error("Error de conexion")
    } finally {
      setIsAdding(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${apiUrl}/api/settings/crm-mapping/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        toast.success("Mapeo eliminado")
        await fetchData()
      }
    } catch {
      toast.error("Error al eliminar")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Mapeo de Estados CRM</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add form */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5 sm:w-40">
            <label className="text-xs text-muted-foreground">Plataforma</label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 flex-1">
            <label className="text-xs text-muted-foreground">Estado en CRM</label>
            <Input
              placeholder="Ej: Contactado"
              value={crmStatus}
              onChange={(e) => setCrmStatus(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:w-48">
            <label className="text-xs text-muted-foreground">Estado en App</label>
            <Select value={estadoId} onValueChange={setEstadoId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {estados.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleAdd} disabled={isAdding} className="sm:w-auto">
            {isAdding ? "Agregando..." : "Agregar"}
          </Button>
        </div>

        {/* Mappings table */}
        {mappings.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plataforma</TableHead>
                <TableHead>Estado CRM</TableHead>
                <TableHead>Estado App</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="capitalize">{m.platformSlug}</TableCell>
                  <TableCell>{m.crmStatus}</TableCell>
                  <TableCell>{m.estadoGestion.nombre}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(m.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-alert"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay mapeos configurados. Agrega uno para empezar.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Add CrmStateMapping to DashboardPage**

Import the component in `DashboardPage.tsx`:

```typescript
import { CrmStateMapping } from "@/components/crm-state-mapping"
```

Render it between the GuardianConfig and the Vault section. Find the GuardianConfig closing tag (around line 479) and after it, add:

```tsx
<CrmStateMapping token={token} />
```

- [ ] **Step 3: Verify frontend build**

```bash
cd apps/web && pnpm build
```

---

## Task 11: Frontend — Webhook Log Component

**Files:**
- Create: `apps/web/src/components/webhook-log.tsx`
- Modify: `apps/web/src/components/crm-state-mapping.tsx` (embed webhook log)

- [ ] **Step 1: Create webhook-log.tsx**

Create `apps/web/src/components/webhook-log.tsx`:

```tsx
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronDown, ChevronRight } from "lucide-react"

interface LogEntry {
  id: string
  source: string
  externalId: string | null
  crmStatus: string | null
  action: string
  timestamp: string
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const ACTION_LABELS: Record<string, string> = {
  created: "Creado",
  status_changed: "Cambio de estado",
  ignored: "Ignorado",
  ignored_completed: "Ignorado (completado)",
  deleted: "Eliminado",
  error: "Error",
}

export function WebhookLog({ token }: { token: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 })
  const [sourceFilter, setSourceFilter] = useState("all")

  const apiUrl = import.meta.env.VITE_API_URL

  const fetchLogs = async (page = 1) => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" })
      if (sourceFilter !== "all") params.set("source", sourceFilter)

      const res = await fetch(`${apiUrl}/api/settings/webhook-log?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
        setPagination(data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 })
      }
    } catch (err) {
      console.error("Error loading webhook logs:", err)
    }
  }

  useEffect(() => {
    if (isOpen && token) fetchLogs(1)
  }, [isOpen, token, sourceFilter])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Historial de Webhooks
        {pagination.total > 0 && (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{pagination.total}</span>
        )}
      </button>

      {isOpen && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filtrar fuente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="clientify">Clientify</SelectItem>
                <SelectItem value="meta">Meta</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {logs.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha/Hora</TableHead>
                    <TableHead>Fuente</TableHead>
                    <TableHead>Estado CRM</TableHead>
                    <TableHead>Accion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs font-mono">{formatDate(log.timestamp)}</TableCell>
                      <TableCell className="capitalize">{log.source}</TableCell>
                      <TableCell>{log.crmStatus || "—"}</TableCell>
                      <TableCell>{ACTION_LABELS[log.action] || log.action}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Pagina {pagination.page} de {pagination.totalPages} ({pagination.total} registros)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => fetchLogs(pagination.page - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => fetchLogs(pagination.page + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay registros de webhooks.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Embed WebhookLog inside CrmStateMapping**

In `crm-state-mapping.tsx`, import and add at the end of the CardContent (after the mappings table):

```tsx
import { WebhookLog } from "./webhook-log"

// Inside CardContent, at the end:
<div className="border-t pt-4">
  <WebhookLog token={token} />
</div>
```

- [ ] **Step 3: Verify frontend build**

```bash
cd apps/web && pnpm build
```

---

## Task 12: Integration Verification

- [ ] **Step 1: Run full build**

```bash
pnpm build
```

Expected: Both `apps/api` and `apps/web` build without errors.

- [ ] **Step 2: Run seed**

```bash
cd apps/api && pnpm db:seed
```

Expected: Seed completes, "Eliminado" state created, demo mappings created.

- [ ] **Step 3: Start dev and manual verification**

```bash
pnpm dev
```

Verify:
1. Dashboard loads — semaphore shows with default 5/5 thresholds
2. Guardian config shows verde/amarillo sliders + rojo informativo
3. CRM mapping section shows between Guardian and Vault
4. Can add/delete CRM state mappings
5. Webhook log section is collapsible and loads data

- [ ] **Step 4: Test webhook flow with existing lead**

Using a REST client, send a POST to the Clientify webhook endpoint with a lead that already exists but with a different status. Verify:
1. WebhookRequestLog entry created with action="status_changed"
2. Lead estado updated according to mapping (or "En proceso" if unmapped)
3. `semaphoreTimeMs` and `semaphoreColor` populated on the lead
4. Flow terminated (flowJobId = null)
