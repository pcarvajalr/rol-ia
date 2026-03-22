# G1 Cleanup + G7 Citas Agendadas - Plan de Implementacion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limpiar campos sin uso en G1, reutilizar `criticalState` como gate CRM pre-WhatsApp, activar cleanup 12h, y conectar G7 para que "Agendar Cita" cree un registro real en `citas_agendadas`.

**Architecture:** Cambios quirurgicos en 4 areas: (1) frontend guardian-config para comentar campos sin uso y renombrar criticalState, (2) backend lead-flow para usar criticalState como gate CRM, (3) activar Cloud Scheduler para cleanup, (4) backend lead-flow + frontend intel-scheduling para que handleAgendarCita cree CitaAgendada y se elimine la simulacion.

**Tech Stack:** React + TypeScript (frontend), Hono + Prisma (backend), Google Cloud Scheduler (infra)

---

## File Structure

### Files to Modify

| File | Responsabilidad del cambio |
|------|---------------------------|
| `apps/web/src/components/guardian-config.tsx` | Comentar HTML de slaMinutes y doubleTouchMinutes, renombrar criticalState |
| `apps/web/src/pages/DashboardPage.tsx` | Limpiar props/state de campos comentados en SLATracker y ActivityFeed |
| `apps/web/src/components/sla-tracker.tsx` | Eliminar props slaMinutes y doubleTouchMinutes |
| `apps/web/src/components/activity-feed.tsx` | Eliminar prop slaMinutes |
| `apps/api/src/services/lead-flow.ts` | Leer criticalState y usarlo como gate CRM en handleFirstTimeout, crear CitaAgendada en handleAgendarCita |
| `apps/api/prisma/schema.prisma` | Agregar campos `estado` y `creadoEn` a CitaAgendada, hacer `horaAgenda` nullable |
| `apps/api/src/routes/intel.ts` | Usar campo `estado` del modelo en vez de calcular por tiempo |
| `apps/web/src/components/intel-scheduling.tsx` | Eliminar simulacion de confirmacion aleatoria |

### Files NOT Modified (solo referencia)

| File | Razon |
|------|-------|
| `apps/api/src/routes/settings.ts` | slaMinutes, doubleTouchMinutes y criticalState se siguen guardando/leyendo del JSON — no se tocan para no romper datos existentes |
| `apps/api/src/routes/intel.ts` | Se modifica para usar campo `estado` en vez de calcular por tiempo |

---

## Task 1: Comentar campos sin uso en GuardianConfig (frontend)

**Files:**
- Modify: `apps/web/src/components/guardian-config.tsx:82-150`

Comentar los bloques HTML de `slaMinutes` y `doubleTouchMinutes`. Los props y la interface se mantienen para no romper el contrato — solo se oculta el render. Agregar comentario explicativo.

- [ ] **Step 1: Comentar bloque SLA de Respuesta Humana**

En `guardian-config.tsx`, envolver las lineas 83-107 (bloque "SLA de Respuesta Humana") en un comentario JSX:

```tsx
{/* --- CAMPO DISPONIBLE PARA USO FUTURO ---
 * slaMinutes: Tiempo SLA de respuesta humana (1-30 min).
 * Puede usarse para: escalamiento automatico, notificaciones al supervisor,
 * metricas de cumplimiento SLA por asesor.
 * El valor se persiste en tenant.settings.guardian.slaMinutes
 */}
{/*
        <div className="flex flex-col gap-3">
          ... todo el bloque de SLA de Respuesta Humana ...
        </div>
*/}
```

- [ ] **Step 2: Comentar bloque Ventana de Doble Toque**

En `guardian-config.tsx`, envolver las lineas 125-150 (bloque "Ventana de Doble Toque") en un comentario JSX:

```tsx
{/* --- CAMPO DISPONIBLE PARA USO FUTURO ---
 * doubleTouchMinutes: Ventana entre mensaje de texto y llamada de voz (1-10 min).
 * Puede usarse para: separar el timing del WhatsApp y la llamada VAPI
 * en vez de usar el mismo tiempoRespuestaLeadSeg para ambos timers.
 * El valor se persiste en tenant.settings.guardian.doubleTouchMinutes
 */}
{/*
        <div className="flex flex-col gap-3">
          ... todo el bloque de Ventana de Doble Toque ...
        </div>
*/}
```

- [ ] **Step 3: Verificar que compila**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores (los props siguen existiendo, solo se oculto el HTML)

---

## Task 2: Renombrar criticalState como Gate CRM (frontend)

**Files:**
- Modify: `apps/web/src/components/guardian-config.tsx:109-123`

Cambiar label, placeholder y descripcion del campo `criticalState` para reflejar su nuevo proposito: si al consultar el CRM el estado del lead es diferente al configurado aqui, se detiene el flujo.

- [ ] **Step 1: Actualizar label, placeholder y descripcion**

Reemplazar el bloque de "Identificador de Estado Critico" (lineas 109-123) con:

```tsx
        {/* Estado CRM que indica "no atendido" — Gate pre-WhatsApp */}
        <div className="flex flex-col gap-2">
          <Label className="text-foreground text-sm font-medium">
            Estado CRM No Atendido
          </Label>
          <Input
            value={criticalState}
            onChange={(e) => onCriticalStateChange(e.target.value)}
            placeholder="Ej: new, cold-lead, sin-gestionar"
            className="border-border/50 bg-secondary/50 text-foreground font-mono text-sm focus-visible:border-aura focus-visible:ring-aura/30"
          />
          <p className="text-muted-foreground text-xs">
            Estado del CRM que significa que el lead NO ha sido atendido.
            Antes de enviar el WhatsApp automatico, G1 consulta el CRM:
            si el estado cambio a uno diferente a este valor, significa que
            un asesor ya lo atendio y el flujo se detiene automaticamente.
          </p>
        </div>
```

- [ ] **Step 2: Verificar que compila**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores

---

## Task 3: Limpiar props de slaMinutes y doubleTouchMinutes en SLATracker y ActivityFeed

**Files:**
- Modify: `apps/web/src/components/sla-tracker.tsx:34-52,66-67,69,85`
- Modify: `apps/web/src/components/activity-feed.tsx:25-27,63`
- Modify: `apps/web/src/pages/DashboardPage.tsx:149,151,167,169,194,196,396-397,406`

Estos componentes reciben `slaMinutes` y `doubleTouchMinutes` como props pero son valores visuales de la simulacion del SLA tracker. Como el SLA tracker es un componente demo/visual (no alimenta datos reales), estos campos se pueden reemplazar por constantes internas para mantener la simulacion funcionando sin depender de la config.

- [ ] **Step 1: SLATracker — reemplazar props por constantes internas**

En `sla-tracker.tsx`:

1. Cambiar la interface (linea 34-38):
```tsx
interface SLATrackerProps {
  demoMode: boolean
}
```

2. Cambiar la firma del componente (linea 48-52):
```tsx
export function SLATracker({
  demoMode,
}: SLATrackerProps) {
```

3. Agregar constantes internas despues de los useState (despues de linea 64):
```tsx
  // Valores fijos para la simulacion visual del timeline
  // Para funcionalidad real, usar los campos slaMinutes y doubleTouchMinutes
  // disponibles en tenant.settings.guardian (ver guardian-config.tsx)
  const slaMinutes = 7
  const doubleTouchMinutes = 2
```

4. Las lineas 66-67 (`slaTriggerMs`, `doubleTouchMs`) y todo lo demas no cambia — ya usan las variables locales.

- [ ] **Step 2: ActivityFeed — eliminar prop slaMinutes**

En `activity-feed.tsx`:

1. Eliminar la interface (lineas 25-27):
```tsx
// slaMinutes disponible en tenant.settings.guardian si se necesita en el futuro
```

2. Cambiar la firma (linea 63):
```tsx
export function ActivityFeed() {
```

- [ ] **Step 3: DashboardPage — limpiar state y props**

En `DashboardPage.tsx`:

1. Eliminar los useState de slaMinutes y doubleTouchMinutes (lineas 149, 151):
```tsx
  // slaMinutes y doubleTouchMinutes se persisten en settings pero no se usan como props
  // Sus controles estan comentados en GuardianConfig (disponibles para uso futuro)
```

2. En el fetch de settings (lineas 167, 169): eliminar `setSlaMinutes(...)` y `setDoubleTouchMinutes(...)`.

3. En el render de SLATracker (lineas 396-397): eliminar `slaMinutes={slaMinutes}` y `doubleTouchMinutes={doubleTouchMinutes}`.

4. En el render de ActivityFeed (linea 406): eliminar `slaMinutes={slaMinutes}`.

**Que se mantiene sin cambios (importante):**
- Los `useState` de `slaMinutes` y `doubleTouchMinutes` se conservan en DashboardPage
- El fetch que los carga (`setSlaMinutes`, `setDoubleTouchMinutes`) se conserva
- El envio en el PUT body (`slaMinutes`, `doubleTouchMinutes`) se conserva
- Razon: preservar datos existentes del tenant. Los controles estan ocultos en GuardianConfig pero los valores siguen viajando al backend para no perderlos

- [ ] **Step 4: Verificar que compila**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores

---

## Task 4: Implementar Gate CRM con criticalState en lead-flow (backend)

**Files:**
- Modify: `apps/api/src/services/lead-flow.ts:9-13,15-24,128-151`

Cuando `handleFirstTimeout` consulta el CRM y obtiene el estado actual del lead, compararlo contra `criticalState` del tenant. Si el estado CRM es diferente a criticalState, significa que el asesor ya atendio al lead — detener el flujo y registrar el semaforo.

- [ ] **Step 1: Agregar criticalState a getGuardianSettings**

En `lead-flow.ts`, modificar `GUARDIAN_DEFAULTS` (linea 9) y `getGuardianSettings` (linea 26) para incluir `criticalState`:

```typescript
const GUARDIAN_DEFAULTS = {
  tiempoRespuestaLeadSeg: 15,
  tiempoVerdeMins: 5,
  tiempoAmarilloMins: 5,
  criticalState: "", // vacio = gate desactivado
}
```

Modificar `getGuardianSettings` para devolver tambien `criticalState`:

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
    criticalState: (guardian?.criticalState as string) || GUARDIAN_DEFAULTS.criticalState,
  }
}
```

- [ ] **Step 2: Agregar logica de gate CRM en handleFirstTimeout**

En `handleFirstTimeout` (linea 128), despues de obtener `crmStatus` del CRM (linea 136-150), agregar la comparacion:

```typescript
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

        // Gate CRM: si el estado cambio (es diferente al criticalState configurado),
        // el asesor ya atendio — detener flujo y registrar semaforo
        const { criticalState } = await getGuardianSettings(tenantId)
        if (criticalState && crmStatus.toLowerCase() !== criticalState.toLowerCase()) {
          console.log(`[lead-flow] Gate CRM: lead ${leadId} estado="${crmStatus}" != criticalState="${criticalState}", deteniendo flujo`)
          await stopFlowWithSemaphore(tenantId, leadId)
          return
        }
      }
    } catch (error) {
      console.error(`[lead-flow] Error consulting Clientify for lead ${leadId}:`, error)
      // Si falla la consulta CRM, continuar con el flujo (no bloquear por error de red)
    }
  }

  // 2. Validar credenciales de WhatsApp (continua igual)
  // ... resto sin cambios
```

La logica es:
- Si `criticalState` esta vacio/no configurado: gate desactivado, siempre continua (comportamiento actual)
- Si `criticalState = "new"` y CRM devuelve `"new"`: el lead sigue sin atender, continua el flujo
- Si `criticalState = "new"` y CRM devuelve `"contacted"`: el asesor ya lo atendio, detener flujo
- Si la consulta CRM falla: continuar el flujo (fallback seguro, el WhatsApp se envia igual)

- [ ] **Step 3: Verificar que compila**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores

---

## Task 5: Migracion Prisma — agregar estado y creadoEn a CitaAgendada

**Files:**
- Modify: `apps/api/prisma/schema.prisma:179-192`

Agregar campo `estado` (default "pendiente"), `creadoEn` (default now), y hacer `horaAgenda` nullable (no se conoce hasta que el lead confirme en el calendario).

- [ ] **Step 1: Modificar modelo CitaAgendada en schema.prisma**

Reemplazar el modelo actual (lineas 179-192) con:

```prisma
model CitaAgendada {
  idCita           String   @id @default(uuid()) @map("id_cita")
  tenantId         String   @map("tenant_id") @db.Uuid
  leadId           String   @map("lead_id")
  horaAgenda       DateTime? @map("hora_agenda")
  canal            String
  estado           String   @default("pendiente")
  idGoogleCalendar String?  @map("id_google_calendar")
  creadoEn         DateTime @default(now()) @map("creado_en")

  tenant Tenant       @relation(fields: [tenantId], references: [id])
  lead   LeadTracking @relation(fields: [leadId], references: [leadId])

  @@index([tenantId])
  @@map("citas_agendadas")
}
```

Cambios:
- `horaAgenda`: `DateTime` -> `DateTime?` (nullable, no se conoce hasta confirmacion)
- `estado`: nuevo campo, default `"pendiente"`. Valores posibles: `pendiente`, `confirmada`, `cancelada`
- `creadoEn`: nuevo campo con `@default(now())` para saber cuando se creo el registro

- [ ] **Step 2: Crear migracion**

```bash
cd apps/api && npx prisma migrate dev --name add-estado-creadoen-cita-agendada
```

Expected: migracion creada y aplicada. Como la tabla `citas_agendadas` esta vacia en produccion, no hay conflictos de datos.

- [ ] **Step 3: Regenerar Prisma client**

```bash
cd apps/api && npx prisma generate
```

- [ ] **Step 4: Verificar que compila**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores

---

## Task 6: Actualizar endpoint GET /intel/scheduling para usar campo estado

**Files:**
- Modify: `apps/api/src/routes/intel.ts:200-239`

El endpoint actualmente calcula el estado por diferencia de tiempo contra `horaAgenda`. Ahora que tenemos un campo `estado` real y `horaAgenda` es nullable, usar el campo directamente.

- [ ] **Step 1: Reemplazar logica de status por campo estado**

Reemplazar el handler de `GET /intel/scheduling` (lineas 201-239) con:

```typescript
intel.get("/scheduling", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ appointments: [] })

  const db = createTenantClient(tenantId)
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const citas = await db.citaAgendada.findMany({
    where: { creadoEn: { gte: startOfDay } },
    include: { lead: true },
    orderBy: { creadoEn: "asc" },
  })

  const appointments = citas.map((cita) => {
    let time = "--:--"
    if (cita.horaAgenda) {
      const h = cita.horaAgenda.getHours()
      const m = cita.horaAgenda.getMinutes()
      time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    }

    return {
      id: cita.idCita,
      lead: cita.lead.nombreLead,
      time,
      channel: cita.canal.toLowerCase().includes("whatsapp") ? "whatsapp" : "voz",
      status: cita.estado,
      agent: "Rol G7",
    }
  })

  return c.json({ appointments })
})
```

Cambios clave:
- Filtra por `creadoEn >= startOfDay` en vez de `horaAgenda` (ya que `horaAgenda` ahora es nullable)
- Ordena por `creadoEn` en vez de `horaAgenda`
- Usa `cita.estado` directamente en vez de calcular por tiempo
- Si `horaAgenda` es null muestra `"--:--"`

- [ ] **Step 2: Verificar que compila**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores

---

## Task 7: Crear CitaAgendada en handleAgendarCita (backend G7)

**Files:**
- Modify: `apps/api/src/services/lead-flow.ts:341-384`

Cuando el lead presiona "Agendar Cita", ademas de enviar el link de calendario y registrar el evento, crear un registro en `citas_agendadas` para que aparezca en "Agenda en Vivo".

- [ ] **Step 1: Agregar creacion de CitaAgendada en handleAgendarCita**

En `handleAgendarCita` (linea 341), despues de registrar el evento "Cita" (linea 370-381) y antes de `endFlow` (linea 383), agregar:

```typescript
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
      `Hola ${lead.nombreLead}! Agenda tu cita aqui: ${calendarUrl}`
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

  // G7: Crear registro de cita agendada
  // horaAgenda queda null — se actualizara cuando el lead confirme en el calendario
  // estado = "pendiente" por default (campo en schema)
  await prisma.citaAgendada.create({
    data: {
      tenantId,
      leadId,
      canal: "WhatsApp",
    },
  })

  console.log(`[lead-flow] CitaAgendada created for lead ${leadId}`)

  await endFlow(tenantId, leadId)
}
```

Notas:
- `horaAgenda` queda `null` — no se conoce hasta que el lead use el link de calendario. Se actualizara en el futuro con integracion Google Calendar API.
- `estado` es `"pendiente"` por default (definido en el schema).
- `canal` = `"WhatsApp"` porque el contacto fue por ese medio.
- `creadoEn` se genera automaticamente con `@default(now())`.

- [ ] **Step 2: Verificar que compila**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores

---

## Task 8: Eliminar simulacion fake en IntelScheduling (frontend G7)

**Files:**
- Modify: `apps/web/src/components/intel-scheduling.tsx:39-52`

Eliminar el `useEffect` que simula confirmaciones aleatorias cada 5 segundos.

- [ ] **Step 1: Eliminar useEffect de simulacion**

En `intel-scheduling.tsx`, eliminar el bloque completo de lineas 39-52:

```tsx
// ELIMINAR este useEffect completo:
  useEffect(() => {
    if (appointments.length === 0) return
    const id = setInterval(() => {
      setAppointments((prev) =>
        prev.map((a) => {
          if (a.status === "pendiente" && Math.random() > 0.85) {
            return { ...a, status: "confirmada" as const }
          }
          return a
        })
      )
    }, 5000)
    return () => clearInterval(id)
  }, [appointments.length > 0])
```

El estado de las citas ahora viene del backend (`GET /intel/scheduling`) que calcula el estado basado en la hora real vs `horaAgenda`. El componente ya hace fetch via `useIntelFetch` que tiene polling cada 15 segundos.

- [ ] **Step 2: Simplificar state de appointments**

Dado que ya no se muta `appointments` localmente, simplificar eliminando el useState separado y usando directamente `fetched.appointments`:

```tsx
export function IntelScheduling() {
  const { data: fetched, loading } = useIntelFetch<SchedulingData>("/api/intel/scheduling", { appointments: [] })
  const [guardianActive, setGuardianActive] = useState(true)

  if (loading) return <Skeleton className="h-[380px] rounded-xl" />
  if (fetched.appointments.length === 0) return <IntelEmptyState />

  const appointments = fetched.appointments
  const confirmed = appointments.filter((a) => a.status === "confirmada").length
  const total = appointments.length

  return (
    // ... resto del JSX sin cambios, usa `appointments` directamente
```

Eliminar:
- `const [appointments, setAppointments] = useState<Appointment[]>([])` (linea 33)
- El primer `useEffect` que sincroniza fetched -> state (lineas 35-37)
- El segundo `useEffect` de simulacion (lineas 39-52, ya eliminado en step 1)
- Cambiar el empty state check de `if (appointments.length === 0 && fetched.appointments.length === 0)` a `if (fetched.appointments.length === 0)`

- [ ] **Step 3: Verificar que compila**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores

---

## Task 9: Desplegar Cloud Scheduler para cleanup 12h

Este task es de infraestructura, no de codigo. El cleanup ya esta implementado en `routes/internal.ts` linea 48-92.

**Contexto:** El cleanup busca leads con `flowJobId != null` cuyo ultimo evento tiene mas de 12 horas. Los marca como Timeout y llama `endFlow` (cancela Cloud Task pendiente + pone `flowJobId = null`). Es un fallback de seguridad para leads huerfanos — si una Cloud Task fallo silenciosamente o `endFlow` no corrio por error, el lead queda con `flowJobId` apuntando a una tarea muerta y el semaforo lo muestra como "activo" indefinidamente. Cloud Tasks NO se ejecutan indefinidamente (max 30 min), pero el `flowJobId` no se limpia si algo falla.

- [ ] **Step 1: Crear Cloud Scheduler job**

```bash
gcloud scheduler jobs create http lead-cleanup \
  --schedule="0 * * * *" \
  --uri="https://rolia-api-377846873300.southamerica-east1.run.app/internal/lead-cleanup" \
  --http-method=POST \
  --location=us-central1
```

- [ ] **Step 2: Verificar que se ejecuta**

```bash
gcloud scheduler jobs run lead-cleanup --location=us-central1
```

Verificar en los logs de Cloud Run que el endpoint responde `{ ok: true, cleaned: 0 }`.

---

## Resumen de cambios

| Area | Que cambia | Riesgo |
|------|-----------|--------|
| GuardianConfig UI | Campos slaMinutes y doubleTouchMinutes comentados, criticalState renombrado | Bajo — solo visual |
| SLATracker / ActivityFeed | Props eliminados, valores internalizados | Bajo — componente demo |
| DashboardPage | Props limpiados | Bajo — sigue guardando valores al backend |
| lead-flow.ts (gate CRM) | criticalState comparado contra CRM antes de WhatsApp | Medio — afecta flujo real. Si criticalState vacio, gate desactivado (safe default) |
| schema.prisma (migracion) | CitaAgendada: +estado, +creadoEn, horaAgenda nullable | Bajo — tabla vacia en produccion |
| intel.ts (endpoint) | GET /intel/scheduling usa campo `estado` en vez de calcular por tiempo | Bajo — alineado con nuevo schema |
| lead-flow.ts (CitaAgendada) | handleAgendarCita crea registro en citas_agendadas con estado="pendiente" | Bajo — funcionalidad nueva aditiva |
| intel-scheduling.tsx | Simulacion eliminada, datos reales del backend | Bajo — ya consumia el endpoint |
| Cloud Scheduler | Job de cleanup cada hora | Bajo — fallback de seguridad |

### Que NO se toca

- `apps/api/src/routes/settings.ts` — slaMinutes, doubleTouchMinutes y criticalState se siguen persistiendo. No romper datos existentes.
