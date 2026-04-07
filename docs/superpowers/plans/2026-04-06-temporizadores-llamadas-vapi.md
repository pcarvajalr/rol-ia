# Temporizadores Independientes + Flujo de Llamadas con Vapi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate WhatsApp/call timers into independently configurable values, add a call retry system with per-lead counters, create a Vapi webhook to capture call outcomes, and remove the 12h cleanup.

**Architecture:** Extend the existing Cloud Tasks flow with a new `tiempoLlamadaSeg` for timer2, a `callRetriesRemaining` field on leads, and a new `/webhook/vapi/:tenantId` endpoint authenticated via `vapi-rolia-key` header. Retries are scheduled as Cloud Tasks with day-level delays. The cleanup endpoint is removed entirely.

**Tech Stack:** Hono (API routes), Prisma (schema + migration), React + shadcn/ui (frontend config), Google Cloud Tasks (scheduling)

---

## Task 1: Prisma Migration — Add `call_retries_remaining` + New Event Types

**Files:**
- Modify: `apps/api/prisma/schema.prisma:100-125`
- Create: `apps/api/prisma/migrations/<timestamp>_add_call_retries_and_vapi_events/migration.sql`

- [ ] **Step 1: Add field to Prisma schema**

In `apps/api/prisma/schema.prisma`, add `callRetriesRemaining` to the `LeadTracking` model, after the `semaphoreColor` field (line 113):

```prisma
  callRetriesRemaining Int?     @map("call_retries_remaining")
```

- [ ] **Step 2: Create migration with --create-only**

```bash
cd "/Volumes/SSD 990 PRO/Documents/GitHub/rol_ia/apps/api" && npx prisma migrate dev --create-only --name add_call_retries_and_vapi_events
```

Expected: Creates a new migration folder with a `.sql` file.

- [ ] **Step 3: Edit the generated SQL to include event types**

Append these INSERTs to the end of the generated `.sql` file (after the ALTER TABLE):

```sql
-- New event types for Vapi call results and retry tracking
INSERT INTO cat_tipos_evento (nombre) VALUES ('Llamada contestada');
INSERT INTO cat_tipos_evento (nombre) VALUES ('Llamada no contestada');
INSERT INTO cat_tipos_evento (nombre) VALUES ('Reintento programado');
INSERT INTO cat_tipos_evento (nombre) VALUES ('Reintentos agotados');
```

- [ ] **Step 4: Apply the migration**

```bash
cd "/Volumes/SSD 990 PRO/Documents/GitHub/rol_ia/apps/api" && npx prisma migrate dev
```

Expected: Migration applied successfully, Prisma Client regenerated.

- [ ] **Step 5: Verify**

```bash
cd "/Volumes/SSD 990 PRO/Documents/GitHub/rol_ia/apps/api" && npx prisma db execute --schema prisma/schema.prisma --stdin <<'SQL'
SELECT nombre FROM cat_tipos_evento ORDER BY id;
SQL
```

Expected: Output includes `Llamada contestada`, `Llamada no contestada`, `Reintento programado`, `Reintentos agotados`.

---

## Task 2: Backend — Update Settings (Defaults, Validation, API)

**Files:**
- Modify: `apps/api/src/routes/settings.ts:1-128`
- Modify: `apps/api/src/services/lead-flow.ts:1-14` (GUARDIAN_DEFAULTS only)

- [ ] **Step 1: Update GUARDIAN_DEFAULTS in `settings.ts`**

In `apps/api/src/routes/settings.ts`, replace lines 14-21:

```typescript
const GUARDIAN_DEFAULTS = {
  slaMinutes: 7,
  criticalState: "cold-lead",
  doubleTouchMinutes: 2,
  tiempoRespuestaLeadSeg: 420,
  tiempoLlamadaSeg: 120,
  callRetryDays: 2,
  callRetryMax: 3,
  tiempoVerdeMins: 5,
  tiempoAmarilloMins: 5,
}
```

- [ ] **Step 2: Update validation in PUT handler**

In `apps/api/src/routes/settings.ts`, replace the `tiempoRespuestaLeadSeg` validation block (lines 53-59):

```typescript
    // Validate tiempoRespuestaLeadSeg (1-30 min stored as 60-1800 seconds)
    if (body.tiempoRespuestaLeadSeg !== undefined) {
      const val = Number(body.tiempoRespuestaLeadSeg)
      if (isNaN(val) || val < 60 || val > 1800) {
        return c.json({ error: "tiempoRespuestaLeadSeg debe estar entre 60 y 1800 segundos" }, 400)
      }
    }
```

- [ ] **Step 3: Add validation for new fields**

After the `tiempoAmarilloMins` validation block (after line 89), add:

```typescript
    // Validate tiempoLlamadaSeg (1-30 min stored as 60-1800 seconds)
    if (body.tiempoLlamadaSeg !== undefined) {
      const val = Number(body.tiempoLlamadaSeg)
      if (isNaN(val) || val < 60 || val > 1800) {
        return c.json({ error: "tiempoLlamadaSeg debe estar entre 60 y 1800 segundos" }, 400)
      }
    }

    // Validate callRetryDays
    if (body.callRetryDays !== undefined) {
      const val = Number(body.callRetryDays)
      if (!Number.isInteger(val) || val < 1 || val > 7) {
        return c.json({ error: "callRetryDays debe ser entero entre 1 y 7" }, 400)
      }
    }

    // Validate callRetryMax
    if (body.callRetryMax !== undefined) {
      const val = Number(body.callRetryMax)
      if (!Number.isInteger(val) || val < 1 || val > 5) {
        return c.json({ error: "callRetryMax debe ser entero entre 1 y 5" }, 400)
      }
    }
```

- [ ] **Step 4: Add new fields to the guardianUpdate merge**

After line 107 (`tiempoAmarilloMins`), add:

```typescript
    if (body.tiempoLlamadaSeg !== undefined) guardianUpdate.tiempoLlamadaSeg = Number(body.tiempoLlamadaSeg)
    if (body.callRetryDays !== undefined) guardianUpdate.callRetryDays = Number(body.callRetryDays)
    if (body.callRetryMax !== undefined) guardianUpdate.callRetryMax = Number(body.callRetryMax)
```

- [ ] **Step 5: Update GUARDIAN_DEFAULTS in `lead-flow.ts`**

In `apps/api/src/services/lead-flow.ts`, replace lines 9-14:

```typescript
const GUARDIAN_DEFAULTS = {
  tiempoRespuestaLeadSeg: 420,
  tiempoLlamadaSeg: 120,
  callRetryDays: 2,
  callRetryMax: 3,
  tiempoVerdeMins: 5,
  tiempoAmarilloMins: 5,
  criticalState: "",
}
```

- [ ] **Step 6: Verify build**

```bash
cd "/Volumes/SSD 990 PRO/Documents/GitHub/rol_ia" && pnpm build
```

Expected: Build succeeds.

---

## Task 3: Backend — Update Lead Flow (Separate Timers + Retry Logic)

**Files:**
- Modify: `apps/api/src/services/lead-flow.ts`

- [ ] **Step 1: Add `getCallSettings` helper**

After the existing `getGuardianSettings` function (after line 39), add:

```typescript
async function getCallSettings(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  })
  const settings = tenant?.settings as Record<string, unknown> | null
  const guardian = settings?.guardian as Record<string, unknown> | null
  return {
    tiempoLlamadaSeg: (guardian?.tiempoLlamadaSeg as number) || GUARDIAN_DEFAULTS.tiempoLlamadaSeg,
    callRetryDays: (guardian?.callRetryDays as number) || GUARDIAN_DEFAULTS.callRetryDays,
    callRetryMax: (guardian?.callRetryMax as number) || GUARDIAN_DEFAULTS.callRetryMax,
  }
}
```

- [ ] **Step 2: Update `handleFirstTimeout` — use `tiempoLlamadaSeg` for timer2**

In `handleFirstTimeout`, replace lines 265-272 (the section that creates the second Cloud Task):

```typescript
  // 6. Crear segundo Cloud Task con tiempoLlamadaSeg
  const { tiempoLlamadaSeg } = await getCallSettings(tenantId)
  const taskId = `lead-${leadId}-timer2`
  const taskName = await createTask(
    taskId,
    `/internal/lead-timeout/${leadId}`,
    tiempoLlamadaSeg
  )
```

- [ ] **Step 3: Add `handleCallResult` function**

Add this new exported function after `endFlow` (end of file):

```typescript
export async function handleCallResult(
  tenantId: string,
  leadId: string,
  answered: boolean,
  endedReason: string
): Promise<void> {
  if (answered) {
    const tipoContestada = await prisma.catTipoEvento.findFirst({ where: { nombre: "Llamada contestada" } })
    if (tipoContestada) {
      await prisma.leadEventHistory.create({
        data: {
          tenantId,
          leadId,
          idTipoEvento: tipoContestada.id,
          actorIntervencion: "IA",
          descripcion: `Llamada contestada (${endedReason})`,
        },
      })
    }

    await prisma.leadTracking.update({
      where: { leadId },
      data: { callRetriesRemaining: 0 },
    })

    await stopFlowWithSemaphore(tenantId, leadId)
    return
  }

  // No contesto
  const tipoNoContestada = await prisma.catTipoEvento.findFirst({ where: { nombre: "Llamada no contestada" } })
  if (tipoNoContestada) {
    await prisma.leadEventHistory.create({
      data: {
        tenantId,
        leadId,
        idTipoEvento: tipoNoContestada.id,
        actorIntervencion: "IA",
        descripcion: `Llamada no contestada (${endedReason})`,
      },
    })
  }

  // Decrementar reintentos
  const lead = await prisma.leadTracking.findUnique({
    where: { leadId },
    select: { callRetriesRemaining: true },
  })

  const remaining = (lead?.callRetriesRemaining ?? 1) - 1

  await prisma.leadTracking.update({
    where: { leadId },
    data: { callRetriesRemaining: remaining },
  })

  if (remaining <= 0) {
    // Reintentos agotados
    const tipoAgotados = await prisma.catTipoEvento.findFirst({ where: { nombre: "Reintentos agotados" } })
    if (tipoAgotados) {
      await prisma.leadEventHistory.create({
        data: {
          tenantId,
          leadId,
          idTipoEvento: tipoAgotados.id,
          actorIntervencion: "IA",
          descripcion: `Reintentos de llamada agotados`,
        },
      })
    }

    await stopFlowWithSemaphore(tenantId, leadId)
    return
  }

  // Programar reintento
  const { callRetryDays } = await getCallSettings(tenantId)
  const delaySec = callRetryDays * 24 * 60 * 60
  const retryNumber = (lead?.callRetriesRemaining ?? 1) - remaining
  const taskId = `lead-${leadId}-retry-${retryNumber}`
  const taskName = await createTask(
    taskId,
    `/internal/lead-call-retry/${leadId}`,
    delaySec
  )

  await prisma.leadTracking.update({
    where: { leadId },
    data: { flowJobId: taskName },
  })

  const tipoProgramado = await prisma.catTipoEvento.findFirst({ where: { nombre: "Reintento programado" } })
  if (tipoProgramado) {
    await prisma.leadEventHistory.create({
      data: {
        tenantId,
        leadId,
        idTipoEvento: tipoProgramado.id,
        actorIntervencion: "IA",
        descripcion: `Reintento ${retryNumber} programado en ${callRetryDays} dias`,
      },
    })
  }

  console.log(`[lead-flow] Retry ${retryNumber} scheduled for lead ${leadId} in ${callRetryDays} days`)
}
```

- [ ] **Step 4: Add `handleCallRetry` function**

Add after `handleCallResult`:

```typescript
export async function handleCallRetry(leadId: string, tenantId: string): Promise<void> {
  const lead = await prisma.leadTracking.findUnique({
    where: { leadId },
    select: { telefono: true, nombreLead: true },
  })

  if (!lead || !lead.telefono) {
    console.error(`[lead-flow] Cannot retry call for lead ${leadId}: no phone number`)
    return
  }

  // Validar credenciales VAPI
  try {
    await validateCredentials(tenantId, "vapi", ["assistant_id", "auth_token"])
  } catch (error) {
    console.error(`[lead-flow] VAPI credentials error for tenant ${tenantId}:`, error)
    await handleCredentialError(leadId, tenantId, lead.nombreLead, "vapi")
    return
  }

  // Hacer llamada directa (sin WhatsApp)
  try {
    await makeOutboundCall(tenantId, lead.telefono)
  } catch (error) {
    console.error(`[lead-flow] VAPI retry call error for lead ${leadId}:`, error)
  }

  const tipoLlamada = await prisma.catTipoEvento.findFirst({ where: { nombre: "Llamada" } })
  if (tipoLlamada) {
    await prisma.leadEventHistory.create({
      data: {
        tenantId,
        leadId,
        idTipoEvento: tipoLlamada.id,
        actorIntervencion: "IA",
        descripcion: `Reintento de llamada VAPI a ${lead.telefono}`,
      },
    })
  }

  console.log(`[lead-flow] Retry call made for lead ${leadId} to ${lead.telefono}`)
}
```

- [ ] **Step 5: Verify build**

```bash
cd "/Volumes/SSD 990 PRO/Documents/GitHub/rol_ia" && pnpm build
```

Expected: Build succeeds.

---

## Task 4: Backend — Vapi Webhook Endpoint

**Files:**
- Modify: `apps/api/src/routes/webhook.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add imports in `webhook.ts`**

At the top of `apps/api/src/routes/webhook.ts`, add to the existing `lead-flow` import:

```typescript
import { startFlow, handleButtonResponse, stopFlowWithSemaphore, handleCallResult } from "../services/lead-flow"
```

- [ ] **Step 2: Add Vapi webhook route**

Before the `export { webhookRouter }` line (line 630), add:

```typescript
// =============================================
// VAPI WEBHOOK — Recibe resultado de llamadas
// Solo procesa el evento "end-of-call-report", el resto se ignora con 200
// =============================================

const UNANSWERED_REASONS = [
  "customer-did-not-answer",
  "customer-busy",
  "voicemail",
  "twilio-failed-to-connect-call",
  "twilio-reported-customer-misdialed",
  "vonage-rejected",
]

webhookRouter.post("/vapi/:tenantId", async (c) => {
  const { tenantId } = c.req.param()
  const body = await c.req.json()

  console.log(`[webhook] Vapi recibido para tenant ${tenantId}:`, JSON.stringify(body))

  // Responder 200 inmediato
  processVapiInBackground(tenantId, body, c.req.raw.headers)

  return c.json({ ok: true })
})

async function processVapiInBackground(
  tenantId: string,
  body: unknown,
  headers: Headers
): Promise<void> {
  try {
    // 1. Verificar tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, active: true },
    })
    if (!tenant || !tenant.active) {
      console.error(`[webhook] Vapi: tenant ${tenantId} no encontrado o inactivo`)
      return
    }

    // 2. Autenticar via header vapi-rolia-key vs boveda
    const headerKey = headers.get("vapi-rolia-key")
    if (!headerKey) {
      console.error(`[webhook] Vapi: header vapi-rolia-key ausente para tenant ${tenantId}`)
      return
    }

    try {
      const credentials = await validateCredentials(tenantId, "vapi", ["secret_server_url"])
      if (credentials.secret_server_url !== headerKey) {
        console.error(`[webhook] Vapi: key invalida para tenant ${tenantId}`)
        return
      }
    } catch {
      console.error(`[webhook] Vapi: credenciales no configuradas para tenant ${tenantId}`)
      return
    }

    // 3. Filtrar solo end-of-call-report
    const message = (body as Record<string, unknown>)?.message as Record<string, unknown> | undefined
    if (!message || message.type !== "end-of-call-report") {
      console.log(`[webhook] Vapi: evento ${message?.type ?? "unknown"} ignorado para tenant ${tenantId}`)
      return
    }

    const endedReason = (message.endedReason as string) || "unknown"
    const call = message.call as Record<string, unknown> | undefined
    const customer = call?.customer as Record<string, unknown> | undefined
    const phoneNumber = (customer?.number as string) || ""

    console.log(`[webhook] Vapi end-of-call-report: endedReason=${endedReason}, phone=${phoneNumber}, tenant=${tenantId}`)

    // 4. Buscar lead por telefono
    const cleanPhone = phoneNumber.replace(/^\+/, "")
    const phoneVariants = [phoneNumber, cleanPhone, `+${cleanPhone}`]

    const lead = await prisma.leadTracking.findFirst({
      where: {
        tenantId,
        telefono: { in: phoneVariants },
        flowJobId: { not: null },
      },
      orderBy: { fechaCreacion: "desc" },
    })

    if (!lead) {
      console.error(`[webhook] Vapi: no lead encontrado para telefono ${phoneNumber} en tenant ${tenantId}`)
      await logWebhookRequest({
        tenantId,
        source: "vapi",
        externalId: null,
        crmStatus: null,
        leadId: null,
        action: "ignored",
        payload: body,
      })
      return
    }

    // 5. Log webhook
    const answered = !UNANSWERED_REASONS.includes(endedReason)
    await logWebhookRequest({
      tenantId,
      source: "vapi",
      externalId: null,
      crmStatus: endedReason,
      leadId: lead.leadId,
      action: answered ? "call_answered" : "call_unanswered",
      payload: body,
    })

    // 6. Procesar resultado
    await handleCallResult(tenantId, lead.leadId, answered, endedReason)

  } catch (error) {
    console.error(`[webhook] Error procesando Vapi para tenant ${tenantId}:`, error)
  }
}
```

- [ ] **Step 3: Verify build**

```bash
cd "/Volumes/SSD 990 PRO/Documents/GitHub/rol_ia" && pnpm build
```

Expected: Build succeeds. No changes needed in `index.ts` because the Vapi route is under `/webhook/vapi/:tenantId` which is already mounted via `app.route("/webhook", webhookRouter)`.

---

## Task 5: Backend — Call Retry Internal Endpoint + Remove Cleanup

**Files:**
- Modify: `apps/api/src/routes/internal.ts`

- [ ] **Step 1: Add import for `handleCallRetry`**

Update the import at line 3:

```typescript
import { getLastEvent, handleTimeout, endFlow, handleCallRetry } from "../services/lead-flow"
```

- [ ] **Step 2: Add call retry endpoint**

After the `lead-timeout` handler (after line 47), add:

```typescript
// POST /internal/lead-call-retry/:leadId
internalRouter.post("/lead-call-retry/:leadId", async (c) => {
  const { leadId } = c.req.param()

  const taskHeader = c.req.header("X-CloudTasks-TaskName")
  if (process.env.NODE_ENV === "production" && !taskHeader) {
    return c.json({ error: "Unauthorized" }, 403)
  }

  const lead = await prisma.leadTracking.findUnique({
    where: { leadId },
    select: { leadId: true, tenantId: true, flowJobId: true, callRetriesRemaining: true },
  })

  if (!lead) {
    return c.json({ error: "Lead no encontrado" }, 404)
  }

  // Si ya no tiene reintentos o el flujo fue cerrado, saltar
  if (!lead.flowJobId || (lead.callRetriesRemaining !== null && lead.callRetriesRemaining <= 0)) {
    console.log(`[internal] Lead ${leadId} no tiene reintentos pendientes, skipping`)
    return c.json({ ok: true, skipped: true })
  }

  await handleCallRetry(leadId, lead.tenantId)

  return c.json({ ok: true })
})
```

- [ ] **Step 3: Remove lead-cleanup endpoint**

Delete lines 49-93 (the entire `POST /internal/lead-cleanup` handler).

- [ ] **Step 4: Verify build**

```bash
cd "/Volumes/SSD 990 PRO/Documents/GitHub/rol_ia" && pnpm build
```

Expected: Build succeeds.

---

## Task 6: Backend — Initialize `callRetriesRemaining` on Lead Creation

**Files:**
- Modify: `apps/api/src/routes/webhook.ts` (Clientify handler)

- [ ] **Step 1: Load callRetryMax when creating lead**

In `handleClientifyWebhook`, before the `prisma.leadTracking.create` call (around line 281), add the settings lookup:

```typescript
  // Obtener callRetryMax de la config para inicializar reintentos
  const tenantSettings = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  })
  const settingsJson = (tenantSettings?.settings as Record<string, unknown>) ?? {}
  const guardianJson = (settingsJson.guardian as Record<string, unknown>) ?? {}
  const callRetryMax = (guardianJson.callRetryMax as number) || 3
```

- [ ] **Step 2: Add `callRetriesRemaining` to the create call**

In the `prisma.leadTracking.create` data object (around line 282-290), add the field:

```typescript
      callRetriesRemaining: callRetryMax,
```

So the create becomes:

```typescript
  const newLead = await prisma.leadTracking.create({
    data: {
      tenantId,
      externalId: lead.externalId,
      nombreLead: lead.nombreLead,
      fuente: lead.fuente,
      telefono: lead.telefono,
      email: lead.email,
      idEstado: estadoFrio.id,
      crmStatusInicial: lead.status?.toLowerCase() || null,
      callRetriesRemaining: callRetryMax,
    },
  })
```

- [ ] **Step 3: Reset `callRetriesRemaining` on CRM status change**

In the existing "Status changed" block of `handleClientifyWebhook` (around line 228), after `stopFlowWithSemaphore` is called, the lead's `callRetriesRemaining` gets reset because `stopFlowWithSemaphore` → `endFlow` sets `flowJobId = null`. But we should also explicitly set `callRetriesRemaining = 0`. Add to the update that sets `newEstadoId` (around line 253):

```typescript
    if (newEstadoId) {
      await prisma.leadTracking.update({
        where: { leadId: existingLead.leadId },
        data: { idEstado: newEstadoId, callRetriesRemaining: 0 },
      })
    }
```

- [ ] **Step 4: Verify build**

```bash
cd "/Volumes/SSD 990 PRO/Documents/GitHub/rol_ia" && pnpm build
```

Expected: Build succeeds.

---

## Task 7: Frontend — Update GuardianConfig Component

**Files:**
- Modify: `apps/web/src/components/guardian-config.tsx`

- [ ] **Step 1: Update props interface**

Replace the `GuardianConfigProps` interface (lines 11-26):

```typescript
interface GuardianConfigProps {
  slaMinutes: number
  onSlaChange: (value: number) => void
  criticalState: string
  onCriticalStateChange: (value: string) => void
  doubleTouchMinutes: number
  onDoubleTouchChange: (value: number) => void
  tiempoRespuestaLeadSeg: number
  onTiempoRespuestaChange: (value: number) => void
  tiempoLlamadaSeg: number
  onTiempoLlamadaChange: (value: number) => void
  callRetryDays: number
  onCallRetryDaysChange: (value: number) => void
  callRetryMax: number
  onCallRetryMaxChange: (value: number) => void
  tiempoVerdeMins: number
  onTiempoVerdeChange: (v: number) => void
  tiempoAmarilloMins: number
  onTiempoAmarilloChange: (v: number) => void
  tenantId: string | null
  onSave: () => void
  isSaving: boolean
}
```

- [ ] **Step 2: Update function signature**

Update the destructured props in the function signature to include the new ones:

```typescript
export function GuardianConfig({
  slaMinutes,
  onSlaChange,
  criticalState,
  onCriticalStateChange,
  doubleTouchMinutes,
  onDoubleTouchChange,
  tiempoRespuestaLeadSeg,
  onTiempoRespuestaChange,
  tiempoLlamadaSeg,
  onTiempoLlamadaChange,
  callRetryDays,
  onCallRetryDaysChange,
  callRetryMax,
  onCallRetryMaxChange,
  tiempoVerdeMins,
  onTiempoVerdeChange,
  tiempoAmarilloMins,
  onTiempoAmarilloChange,
  tenantId,
  onSave,
  isSaving,
}: GuardianConfigProps) {
```

- [ ] **Step 3: Add imports**

Add `Copy, PhoneCall, RefreshCw, Link2` to the lucide-react import:

```typescript
import { Settings2, User, Phone, CheckCircle2, Loader2, Copy, PhoneCall, RefreshCw, Link2 } from "lucide-react"
```

- [ ] **Step 4: Modify WhatsApp timer slider**

Replace the existing "Tiempo de Respuesta del Lead" section (lines 56-81) with:

```tsx
        {/* Tiempo de espera WhatsApp */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label className="text-foreground text-sm font-medium">
              Tiempo de espera WhatsApp
            </Label>
            <Badge
              variant="outline"
              className="border-aura/30 text-aura font-mono text-xs"
            >
              {Math.round(tiempoRespuestaLeadSeg / 60)} min
            </Badge>
          </div>
          <Slider
            value={[tiempoRespuestaLeadSeg]}
            onValueChange={(v) => onTiempoRespuestaChange(v[0])}
            min={60}
            max={1800}
            step={60}
            className="[&_[data-slot=slider-range]]:bg-aura [&_[data-slot=slider-thumb]]:border-aura"
          />
          <p className="text-muted-foreground text-xs">
            Tiempo antes de que Rol.IA envie WhatsApp automatico si el asesor no responde.
          </p>
        </div>
```

- [ ] **Step 5: Add call timer slider**

After the WhatsApp timer section and before the commented-out SLA block, add:

```tsx
        {/* Tiempo de espera Llamada */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label className="text-foreground text-sm font-medium">
              Tiempo de espera Llamada
            </Label>
            <Badge
              variant="outline"
              className="border-aura/30 text-aura font-mono text-xs"
            >
              {Math.round(tiempoLlamadaSeg / 60)} min
            </Badge>
          </div>
          <Slider
            value={[tiempoLlamadaSeg]}
            onValueChange={(v) => onTiempoLlamadaChange(v[0])}
            min={60}
            max={1800}
            step={60}
            className="[&_[data-slot=slider-range]]:bg-aura [&_[data-slot=slider-thumb]]:border-aura"
          />
          <p className="text-muted-foreground text-xs">
            Tiempo de espera antes de realizar llamada automatica si el lead no responde al WhatsApp.
          </p>
        </div>
```

- [ ] **Step 6: Add call retry config section**

After the "Estado CRM No Atendido" section (after line 133) and before the commented-out doubleTouchMinutes block, add:

```tsx
        {/* Reintentos de Llamada */}
        <div className="border-border/50 rounded-lg border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="text-aura h-3.5 w-3.5" />
            <h3 className="text-sm font-semibold text-foreground">Reintentos de Llamada</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Repetir cada</Label>
              <Badge variant="outline" className="border-aura/30 text-aura font-mono text-xs">
                {callRetryDays} {callRetryDays === 1 ? "dia" : "dias"}
              </Badge>
            </div>
            <Slider
              value={[callRetryDays]}
              onValueChange={([v]) => onCallRetryDaysChange(v)}
              min={1}
              max={7}
              step={1}
              className="[&_[data-slot=slider-range]]:bg-aura [&_[data-slot=slider-thumb]]:border-aura"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Maximo de intentos</Label>
              <Badge variant="outline" className="border-aura/30 text-aura font-mono text-xs">
                {callRetryMax} {callRetryMax === 1 ? "vez" : "veces"}
              </Badge>
            </div>
            <Slider
              value={[callRetryMax]}
              onValueChange={([v]) => onCallRetryMaxChange(v)}
              min={1}
              max={5}
              step={1}
              className="[&_[data-slot=slider-range]]:bg-aura [&_[data-slot=slider-thumb]]:border-aura"
            />
          </div>

          <p className="text-muted-foreground text-xs">
            Si el lead no contesta, se reintentara la llamada cada {callRetryDays} {callRetryDays === 1 ? "dia" : "dias"} hasta un maximo de {callRetryMax} {callRetryMax === 1 ? "vez" : "veces"}.
          </p>
        </div>
```

- [ ] **Step 7: Add Vapi webhook info section**

After the "Mapeo de Datos" section (after line 276) and before the save button, add:

```tsx
        {/* Webhook Vapi */}
        {tenantId && (
          <div className="border-border/50 rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Link2 className="text-aura h-3.5 w-3.5" />
              <h3 className="text-sm font-semibold text-foreground">Webhook Vapi</h3>
            </div>

            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={`https://rolia-api-377846873300.southamerica-east1.run.app/webhook/vapi/${tenantId}`}
                className="border-border/50 bg-secondary/50 text-foreground font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `https://rolia-api-377846873300.southamerica-east1.run.app/webhook/vapi/${tenantId}`
                  )
                  toast.success("URL copiada al portapapeles")
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-muted-foreground text-xs">
              Configura este Server URL en tu asistente de Vapi. Agrega un HTTP header{" "}
              <code className="text-foreground bg-secondary px-1 rounded">vapi-rolia-key</code> con el mismo
              valor que configuraste en la boveda de seguridad (slug: vapi, campo: secret_server_url).
            </p>
          </div>
        )}
```

- [ ] **Step 8: Add toast import**

Add to the imports at the top of the file:

```typescript
import { toast } from "sonner"
```

- [ ] **Step 9: Verify build**

```bash
cd "/Volumes/SSD 990 PRO/Documents/GitHub/rol_ia" && pnpm build
```

Expected: Build succeeds.

---

## Task 8: Frontend — Update DashboardPage State + Props

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Add new state variables**

After line 154 (`tiempoAmarilloMins` state), add:

```typescript
  const [tiempoLlamadaSeg, setTiempoLlamadaSeg] = useState(120)
  const [callRetryDays, setCallRetryDays] = useState(2)
  const [callRetryMax, setCallRetryMax] = useState(3)
```

- [ ] **Step 2: Load new fields from API**

In the `loadGuardianSettings` callback (around line 172), after `setTiempoAmarilloMins`, add:

```typescript
          if (data.tiempoLlamadaSeg) setTiempoLlamadaSeg(data.tiempoLlamadaSeg)
          if (data.callRetryDays) setCallRetryDays(data.callRetryDays)
          if (data.callRetryMax) setCallRetryMax(data.callRetryMax)
```

- [ ] **Step 3: Send new fields on save**

In the `handleSaveGuardian` body JSON (around line 193-200), add the new fields:

```typescript
        body: JSON.stringify({
          slaMinutes,
          criticalState,
          doubleTouchMinutes,
          tiempoRespuestaLeadSeg,
          tiempoLlamadaSeg,
          callRetryDays,
          callRetryMax,
          tiempoVerdeMins,
          tiempoAmarilloMins,
        }),
```

- [ ] **Step 4: Pass new props to GuardianConfig**

Update the `<GuardianConfig>` JSX (around line 472-487) to include the new props:

```tsx
              <GuardianConfig
                slaMinutes={slaMinutes}
                onSlaChange={setSlaMinutes}
                criticalState={criticalState}
                onCriticalStateChange={setCriticalState}
                doubleTouchMinutes={doubleTouchMinutes}
                onDoubleTouchChange={setDoubleTouchMinutes}
                tiempoRespuestaLeadSeg={tiempoRespuestaLeadSeg}
                onTiempoRespuestaChange={setTiempoRespuestaLeadSeg}
                tiempoLlamadaSeg={tiempoLlamadaSeg}
                onTiempoLlamadaChange={setTiempoLlamadaSeg}
                callRetryDays={callRetryDays}
                onCallRetryDaysChange={setCallRetryDays}
                callRetryMax={callRetryMax}
                onCallRetryMaxChange={setCallRetryMax}
                tiempoVerdeMins={tiempoVerdeMins}
                onTiempoVerdeChange={setTiempoVerdeMins}
                tiempoAmarilloMins={tiempoAmarilloMins}
                onTiempoAmarilloChange={setTiempoAmarilloMins}
                tenantId={user?.tenantId ?? null}
                onSave={handleSaveGuardian}
                isSaving={isSavingGuardian}
              />
```

- [ ] **Step 5: Get user from auth store**

Verify that `user` is available. Check if there's already a `const user = useAuthStore(...)` line. If not, add near the existing store selectors (around line 145):

```typescript
  const user = useAuthStore((s) => s.user)
```

- [ ] **Step 6: Verify build**

```bash
cd "/Volumes/SSD 990 PRO/Documents/GitHub/rol_ia" && pnpm build
```

Expected: Build succeeds with no TypeScript errors.

---

## Task 9: Deploy + Smoke Test

**Files:** None (deployment commands only)

- [ ] **Step 1: Deploy API to Cloud Run**

```bash
cd "/Volumes/SSD 990 PRO/Documents/GitHub/rol_ia" && gcloud run deploy rolia-api --source . --region southamerica-east1
```

Expected: Build and deploy succeeds (~3-5 min).

- [ ] **Step 2: Apply migration to production DB**

```bash
cd "/Volumes/SSD 990 PRO/Documents/GitHub/rol_ia/apps/api" && DATABASE_URL=$DATABASE_URL_UNPOOLED npx prisma migrate deploy
```

Expected: Migration applied.

- [ ] **Step 3: Deploy web to Firebase**

```bash
cd "/Volumes/SSD 990 PRO/Documents/GitHub/rol_ia" && pnpm deploy:web
```

Expected: Deploy succeeds.

- [ ] **Step 4: Smoke test — verify settings API**

```bash
# GET guardian settings (should include new defaults)
curl -s "https://rolia-api-377846873300.southamerica-east1.run.app/api/settings/guardian" \
  -H "Authorization: Bearer <TOKEN>" | jq '.tiempoLlamadaSeg, .callRetryDays, .callRetryMax'
```

Expected: `120`, `2`, `3`

- [ ] **Step 5: Smoke test — verify Vapi webhook responds**

```bash
curl -s -X POST "https://rolia-api-377846873300.southamerica-east1.run.app/webhook/vapi/75c003f2-d881-4343-8637-0477db03fbc1" \
  -H "Content-Type: application/json" \
  -H "vapi-rolia-key: test" \
  -d '{"message":{"type":"status-update"}}' | jq .
```

Expected: `{"ok": true}` (non end-of-call-report events are ignored with 200).

- [ ] **Step 6: Verify UI shows new config fields**

Open https://rolia-92d5d.web.app, navigate to Config tab > Guardian Config. Verify:
- "Tiempo de espera WhatsApp" slider shows minutes (1-30)
- "Tiempo de espera Llamada" slider exists
- "Reintentos de Llamada" section exists with days and max sliders
- "Webhook Vapi" section shows URL with copy button
