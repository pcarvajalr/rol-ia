# Separar temporizadores y flujo de llamadas con Vapi

**Fecha:** 2026-04-06
**Estado:** Aprobado

## Contexto

Actualmente existe un temporizador de respuesta unico (`tiempoRespuestaLeadSeg`) que controla tanto el delay antes de enviar WhatsApp como el delay antes de hacer la llamada VAPI. La llamada VAPI se hace una sola vez y no hay forma de saber si el lead contesto o no. Se necesita:

1. Separar en dos temporizadores independientes (WhatsApp y llamada)
2. Agregar sistema de reintentos de llamada configurable
3. Crear webhook de Vapi para capturar resultado de llamadas
4. Eliminar el cleanup de 12h (ya no aplica con reintentos de dias)

## Enfoque elegido

**Enfoque A: Reusar `flowJobId` para todo el ciclo.** Un solo Cloud Task activo por lead a la vez. Se agrega `callRetriesRemaining` al modelo. Minimo cambio al schema, reutiliza toda la infraestructura existente de Cloud Tasks.

## Modelo de datos

### Prisma — campo nuevo en `LeadTracking`

```prisma
callRetriesRemaining  Int?     @map("call_retries_remaining")
```

- Se inicializa con `callRetryMax` de la config al crear el lead
- Se resta 1 despues de cada llamada VAPI que no contesta
- Se pone a 0 si contesta o si CRM cambia estado
- Llega a 0 = fin del flujo

### Configuracion Guardian — `Tenant.settings.guardian`

| Campo | Tipo | Rango | Default | Descripcion |
|---|---|---|---|---|
| `tiempoRespuestaLeadSeg` | int | 60-1800 | 420 (7min) | Timer WhatsApp. Slider 1-30 min, guarda en seg. **Rango modificado** (antes 15-300s) |
| `tiempoLlamadaSeg` | int | 60-1800 | 120 (2min) | **Nuevo.** Timer antes de llamada VAPI. Slider 1-30 min, guarda en seg |
| `callRetryDays` | int | 1-7 | 2 | **Nuevo.** Dias entre reintentos de llamada |
| `callRetryMax` | int | 1-5 | 3 | **Nuevo.** Cantidad maxima de reintentos |

### Boveda — campo existente en slug `vapi`

El campo `secret_server_url` ya existe en la boveda. Se usa para autenticar el webhook — el tenant configura el mismo valor como header `vapi-rolia-key` en el Server URL de Vapi.

### Eventos nuevos en `CatTipoEvento`

| Evento | Cuando se registra |
|---|---|
| `Llamada contestada` | Webhook Vapi reporta que contesto |
| `Llamada no contestada` | Webhook Vapi reporta que no contesto |
| `Reintento programado` | Se programa Cloud Task para reintento en N dias |
| `Reintentos agotados` | `callRetriesRemaining` llega a 0 |

Los eventos existentes (`Lead ingreso`, `WhatsApp`, `Llamada`, `Cita`, `Timeout`) se mantienen sin cambios. `Llamada` se registra al **iniciar** la llamada, los nuevos registran el **resultado**.

## Flujo completo

```
1. Webhook Clientify -> crear lead (callRetriesRemaining = callRetryMax)
   -> evento "Lead ingreso"
   -> Cloud Task timer1: lead-{id}-timer1, delay = tiempoRespuestaLeadSeg

2. Timer 1 vence -> consulta CRM -> envia WhatsApp
   -> evento "WhatsApp"
   -> Cloud Task timer2: lead-{id}-timer2, delay = tiempoLlamadaSeg

3. Timer 2 vence -> VAPI call #1
   -> evento "Llamada"
   -> (espera webhook Vapi con resultado)

4. Webhook Vapi recibe end-of-call-report:
   -> contesto:
     -> evento "Llamada contestada"
     -> callRetriesRemaining = 0
     -> stopFlowWithSemaphore() -> fin
   -> no contesto:
     -> evento "Llamada no contestada"
     -> callRetriesRemaining-- (ej: 3->2)
     -> si reintentos > 0:
       -> evento "Reintento programado"
       -> Cloud Task: lead-{id}-retry-{n}, delay = callRetryDays en segundos
     -> si reintentos = 0:
       -> evento "Reintentos agotados"
       -> stopFlowWithSemaphore() -> fin

5. Reintento vence -> VAPI call directa (sin WhatsApp)
   -> evento "Llamada"
   -> (espera webhook Vapi, repite paso 4)
```

### Puntos de corte (detienen todo en cualquier momento)

- **CRM cambia estado** (webhook Clientify detecta cambio) -> `callRetriesRemaining = 0` -> `stopFlowWithSemaphore()` -> fin
- **Lead responde boton WhatsApp** (llamar, agendar, chat, no contactar) -> cancela Cloud Task activo -> flujo existente de botones -> fin

### Identificacion de tasks en Cloud Tasks

- `lead-{id}-timer1` — timer WhatsApp
- `lead-{id}-timer2` — timer llamada
- `lead-{id}-retry-{n}` — reintento N

Todos se guardan en `flowJobId` secuencialmente. Solo hay un task activo por lead a la vez.

### Semaforo

Se registra al **final del flujo** — cuando conteste, se agoten reintentos, o cambie desde CRM. Puede ser semaforo rojo de varios dias si el lead nunca contesto y se agotaron reintentos.

### Estado del lead

**No cambia durante las llamadas.** Solo cambia si el CRM lo actualiza. Los reintentos no modifican `idEstado`.

## Webhook de Vapi

### Endpoint

`POST /webhook/vapi/:tenantId`

Se monta antes de CORS en `index.ts` (junto a `/webhook` y `/internal`).

### Autenticacion

1. Leer header `vapi-rolia-key` del request
2. Obtener credencial `secret_server_url` de la boveda (slug `vapi`) del tenant
3. Comparar — si no coincide, responder 401

### Procesamiento

1. Responder 200 inmediato (patron fire-and-forget como Clientify)
2. En background:
   - Filtrar solo eventos con `message.type === "end-of-call-report"` (unico evento procesado, el resto se ignora con 200)
   - Extraer `endedReason` de `message.endedReason`
   - Extraer telefono de `message.call.customer.number`
   - Buscar lead por telefono + tenantId donde `flowJobId IS NOT NULL`
   - Determinar si contesto:

```typescript
const UNANSWERED_REASONS = [
  "customer-did-not-answer",
  "customer-busy",
  "voicemail",
  "twilio-failed-to-connect-call",
  "twilio-reported-customer-misdialed",
  "vonage-rejected"
]

const answered = !UNANSWERED_REASONS.includes(endedReason)
```

3. Si contesto -> evento "Llamada contestada" (descripcion: endedReason) -> `callRetriesRemaining = 0` -> `stopFlowWithSemaphore()`
4. Si no contesto -> evento "Llamada no contestada" (descripcion: endedReason) -> decrementar `callRetriesRemaining` -> programar reintento o finalizar

### Logging

Registrar en `WebhookRequestLog` con `source: "vapi"`, incluyendo payload completo.

## Cambios en archivos existentes

### `apps/api/src/services/lead-flow.ts`
- **`startFlow()`**: sin cambios, sigue usando `tiempoRespuestaLeadSeg` para timer1
- **`handleFirstTimeout()`**: usa `tiempoLlamadaSeg` (nuevo) para el delay del timer2 en vez de `tiempoRespuestaLeadSeg`
- **`handleSecondTimeout()`**: sigue haciendo la llamada VAPI, pero ya no es terminal — el flujo queda abierto esperando webhook de Vapi
- **`stopFlowWithSemaphore()`**: sin cambios
- **`endFlow()`**: sin cambios
- **Nueva funcion `handleCallResult(tenantId, leadId, answered, endedReason)`**: logica de contestado/no contestado
- **Nueva funcion `handleCallRetry(leadId, tenantId)`**: llamada VAPI directa sin WhatsApp

### `apps/api/src/routes/webhook.ts`
- Agregar ruta `POST /webhook/vapi/:tenantId`
- Auth via header `vapi-rolia-key` vs boveda

### `apps/api/src/routes/internal.ts`
- Agregar `POST /internal/lead-call-retry/:leadId`
- Eliminar `POST /internal/lead-cleanup`

### `apps/api/src/routes/settings.ts`
- Agregar validacion: `tiempoLlamadaSeg` (60-1800), `callRetryDays` (1-7), `callRetryMax` (1-5)
- Modificar validacion de `tiempoRespuestaLeadSeg` a rango 60-1800
- Actualizar `GUARDIAN_DEFAULTS` con nuevos valores

### `apps/api/src/index.ts`
- Montar ruta `/webhook/vapi` antes de CORS

### `apps/api/src/routes/webhook.ts` (Clientify)
- Al crear lead: inicializar `callRetriesRemaining` con `callRetryMax` de la config
- Al detectar cambio de estado CRM: `callRetriesRemaining = 0`

### `apps/web/src/components/guardian-config.tsx`
- Modificar slider existente: rango a 1-30 minutos, label "Tiempo de espera WhatsApp"
- Agregar slider "Tiempo de espera Llamada" (1-30 min)
- Agregar seccion "Reintentos de Llamada": intervalo en dias (1-7) y maximo de intentos (1-5)
- Agregar seccion informativa "Webhook Vapi": URL read-only con boton copiar + instrucciones de configuracion del header `vapi-rolia-key`

### Migracion Prisma
- Agregar campo `call_retries_remaining` a `leads_tracking`
- Insertar nuevos tipos de evento en `cat_tipo_evento`: `Llamada contestada`, `Llamada no contestada`, `Reintento programado`, `Reintentos agotados`

### Eliminaciones
- Eliminar endpoint `POST /internal/lead-cleanup`
- Eliminar cualquier referencia a Cloud Scheduler para cleanup

## Archivos que NO se tocan

- `modules/vapi.ts` — `makeOutboundCall()` no cambia
- `modules/whatsapp.ts` — sin cambios
- `modules/clientify.ts` — sin cambios
- `routes/auth.ts`, `routes/admin.ts`, `routes/intel.ts` — sin cambios

## UI — Panel Guardian

### Slider "Tiempo de espera WhatsApp" (modificado)
- Rango: 1-30 minutos (guarda en segundos)
- Help: "Tiempo antes de que Rol.IA envie WhatsApp automatico si el asesor no responde"

### Slider "Tiempo de espera Llamada" (nuevo)
- Rango: 1-30 minutos (guarda en segundos)
- Help: "Tiempo de espera antes de realizar llamada automatica si el lead no responde al WhatsApp"

### Seccion "Reintentos de Llamada" (nueva)
- "Repetir cada": 1-7 dias, default 2
- "Maximo de intentos": 1-5, default 3
- Help: "Si el lead no contesta, se reintentara la llamada cada N dias hasta un maximo de N veces"

### Seccion "Webhook Vapi" (nueva, solo lectura)
- URL read-only: `https://rolia-api-377846873300.southamerica-east1.run.app/webhook/vapi/{tenantId}`
- Boton copiar al portapapeles
- Instrucciones: "Configura este Server URL en tu asistente de Vapi. Agrega un HTTP header `vapi-rolia-key` con el mismo valor que configuraste en la boveda de seguridad (slug: vapi, campo: secret_server_url)"
