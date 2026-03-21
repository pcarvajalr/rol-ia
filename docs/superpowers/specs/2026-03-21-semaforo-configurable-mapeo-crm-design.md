# Semaforo Configurable + Mapeo de Estados CRM

**Fecha:** 2026-03-21
**Estado:** Aprobado

## Resumen

Dos funcionalidades para el sistema de leads:
1. **Semaforo configurable**: permitir a cada tenant configurar los tiempos de los estados verde y amarillo del semaforo de abandono, persistir el tiempo y color al terminar el flujo
2. **Mapeo de estados CRM**: cuando llega un webhook con un lead existente cuyo status cambio, ejecutar acciones (detener flujo, cambiar estado, registrar tiempo). Configuracion de mapeo por plataforma. Log de auditoria de todas las solicitudes entrantes

---

## Feature 1: Semaforo Configurable

### Logica de colores

| Estado | Rango | Configurable |
|--------|-------|-------------|
| Verde (OK) | 0 a `tiempoVerdeMins` | Si (default: 5 min) |
| Amarillo (En riesgo) | `tiempoVerdeMins` a `tiempoVerdeMins + tiempoAmarilloMins` | Si (default: 5 min) |
| Rojo (Critico) | > `tiempoVerdeMins + tiempoAmarilloMins` | No — calculado automaticamente |

- El rojo no tiene tope: el timer sigue contando hasta que el flujo termine (boton WhatsApp, VAPI, cleanup 12h, cambio de status CRM, eliminacion)
- En la pantalla de configuracion, el rojo se muestra como dato informativo: "> X min" donde X = verde + amarillo
- Nota: con ambos campos al maximo (30+30=60 min), un lead podria estar en rojo hasta 11 horas antes del cleanup de 12h. Esto es esperado y no es un bug.

### Formato del timer en pantalla

| Rango | Formato | Ejemplo |
|-------|---------|---------|
| < 60 min | `MM:SS` | `12:34` |
| >= 60 min | `Xh Ym` | `1h 23m` |
| >= 24h | `Xd Yh` | `1d 2h` |

### Barra de progreso

La barra de progreso actual usa `maxMs` hardcoded (15 min). Con la nueva logica sin tope:
- La barra representa el progreso relativo al umbral rojo (`tiempoVerdeMins + tiempoAmarilloMins`)
- Al llegar a rojo (100%), la barra se queda llena y cambia a color rojo
- El timer sigue contando pero la barra ya no crece

### Persistencia al terminar flujo

Al terminar el flujo por cualquier razon, se calcula y persiste en `LeadTracking`:
- `semaphoreTimeMs` (BigInt): milisegundos totales desde `fechaCreacion` hasta el momento de cierre. Se usa BigInt para soportar sin overflow duraciones mayores a 24 dias (techo de Int32), aunque el cleanup actual es de 12h.
- `semaphoreColor`: "verde", "amarillo" o "rojo" segun los umbrales del tenant

Calculo:
```
timeMs = now - lead.fechaCreacion
verdeMs = tiempoVerdeMins * 60000
amarilloMs = tiempoAmarilloMins * 60000

if (timeMs <= verdeMs) -> "verde"
else if (timeMs <= verdeMs + amarilloMs) -> "amarillo"
else -> "rojo"
```

Esta logica se ejecuta en TODOS los puntos de terminacion:
- Cambio de status desde webhook (nuevo)
- Eliminacion desde webhook (nuevo)
- Respuesta de boton WhatsApp (existente — handleButtonResponse)
- Segundo timeout -> llamada VAPI (existente — handleTimeout)
- Cleanup 12h (existente — lead-cleanup)

### Configuracion en tenant.settings.guardian

Campos nuevos en el JSON existente:
```json
{
  "guardian": {
    "tiempoRespuestaLeadSeg": 15,
    "slaMinutes": 7,
    "criticalState": "cold-lead",
    "doubleTouchMinutes": 2,
    "tiempoVerdeMins": 5,
    "tiempoAmarilloMins": 5
  }
}
```

Validaciones: ambos campos enteros, rango 1-30.

**IMPORTANTE**: agregar `tiempoVerdeMins: 5` y `tiempoAmarilloMins: 5` a la constante `GUARDIAN_DEFAULTS` en `routes/settings.ts`. Tambien en `services/lead-flow.ts` donde se leen los settings del tenant para `stopFlowWithSemaphore`, resolver defaults con el mismo patron que usa `getTiempoRespuesta()`. Si los campos no estan en defaults, el calculo del color produce `NaN` y todos los leads caen en "rojo".

---

## Feature 2: Mapeo de Estados CRM + Log de Webhooks

### Flujo del webhook modificado para leads existentes

Actualmente: si el lead ya existe y esta activo -> se ignora.

Nuevo comportamiento:

```
Webhook llega con lead existente
  |
  +-- Lead ya completo (flowJobId === null)?
  |   -> Solo registrar WebhookRequestLog, action="ignored_completed"
  |   -> NO ejecutar logica de status (el flujo ya termino)
  |
  +-- Es evento de eliminacion? (ver seccion "Deteccion de eliminacion")
  |   -> Estado -> "Eliminado"
  |   -> calcular semaphoreTimeMs + semaphoreColor, endFlow()
  |   -> Log: action="deleted"
  |
  +-- Status CRM === lead.crmStatusInicial? (comparacion case-insensitive)
  |   -> Ignorar, semaforo sigue contando
  |   -> Log: action="ignored"
  |
  +-- Status CRM !== lead.crmStatusInicial?
      -> calcular semaphoreTimeMs + semaphoreColor, endFlow()
      -> Buscar en CrmStateMapping(tenantId, platformSlug, status.toLowerCase())
      |   +-- Match encontrado -> actualizar idEstado al mapeado
      |   +-- Sin match -> actualizar idEstado a "En proceso" (fallback)
      -> Log: action="status_changed"
```

**Gate critico**: toda la logica de comparacion de status y endFlow SOLO se ejecuta cuando `flowJobId !== null` (flujo activo). Si el lead ya completo su flujo, se registra el log y se sale. Esto previene doble terminacion de leads ya completados.

### Campo crmStatusInicial en LeadTracking

Almacena el status que trajo el lead desde el CRM al momento de ingresar por primera vez. Se usa para comparar contra futuros webhooks del mismo lead. Si el status cambia, el flujo se detiene.

**Poblado obligatorio al crear el lead**: en `handleClientifyWebhook()`, al crear el lead en `leads_tracking`, asignar `crmStatusInicial = normalizedLead.status?.toLowerCase() || null`. Si el payload de Clientify no trae `status` (null), `crmStatusInicial` queda null y cualquier webhook futuro con status no-null se tratara como cambio de status (null !== "algo" -> endFlow). Esto es el comportamiento correcto: si no se conoce el status original, cualquier status entrante se interpreta como cambio.

### Inclusion de status en NormalizedLead

`parseClientifyPayload()` en `clientify.ts` actualmente no retorna `payload.status`. Agregar `status: payload.status || null` al objeto `NormalizedLead`. El campo `status` ya existe en la interfaz `ClientifyContact` pero no se mapea al resultado.

### Tabla CrmStateMapping

Mapeo configurable por tenant de estados del CRM externo a estados internos de la app.

```
id                  Int       PK autoincrement
tenantId            String    FK -> Tenant
platformSlug        String    "clientify", futuras plataformas
crmStatus           String    texto del estado en el CRM (almacenado en lowercase)
catEstadoGestionId  Int       FK -> CatEstadoGestion

UNIQUE(tenantId, platformSlug, crmStatus)
@@map("crm_state_mapping")
```

Reglas:
- `crmStatus` se almacena en lowercase para comparacion case-insensitive
- Un mismo estado CRM no puede apuntar a dos estados de la app (unique constraint)
- Un mismo estado de la app puede tener multiples estados CRM apuntando a el (N:1)
- Se agrega fila a fila con validacion inline

### Tabla WebhookRequestLog

Auditoria de todas las solicitudes que llegan via webhook, independientemente de si generan accion.

```
id          String    PK uuid
tenantId    String    FK -> Tenant
source      String    "clientify", "meta", etc.
externalId  String?   ID del contacto en el CRM
crmStatus   String?   status que traia el contacto
leadId      String?   FK -> LeadTracking (nullable, onDelete: SetNull)
action      String    "created", "status_changed", "ignored", "ignored_completed", "deleted", "error"
payload     Json?     payload completo para debugging
timestamp   DateTime  default now()

INDEX(tenantId, timestamp)
INDEX(tenantId, externalId)
@@map("webhook_request_log")
```

**Escritura unica**: el log se inserta UNA sola vez al final del procesamiento, con el `action` definitivo. NO se hace insert previo + update posterior. Esto evita rows huerfanas con action null si el proceso crashea entre ambos pasos. Si el procesamiento falla antes de poder insertar el log, se captura en un catch y se inserta con `action="error"`.

**onDelete: SetNull**: la relacion con `LeadTracking` usa `onDelete: SetNull` explicito para que al eliminar un lead, los logs no bloqueen el delete. Tambien actualizar el orden de limpieza en `seed.ts` para borrar `webhook_request_log` antes de `leads_tracking`.

### Estado "Eliminado"

Nuevo registro en `CatEstadoGestion`. Estado terminal cuando el CRM notifica eliminacion del contacto. Detiene el flujo activo si lo hay.

### Deteccion de eliminacion de Clientify

El formato exacto de eliminacion de Clientify esta pendiente de validar con pruebas. Implementar un guard defensivo en el webhook handler:

```typescript
// TODO: Validar formato de eliminacion de Clientify
// Candidatos: hook.event === "contact.deleted" o similar
// Por ahora, loguear y saltar el branch de eliminacion
const isDeleteEvent = false // Activar cuando se confirme el formato
if (isDeleteEvent) {
  // ... logica de eliminacion
}
```

El guard se activa cuando se confirme el formato via captura de payload en pruebas. Hasta entonces, los eventos de eliminacion se procesan como cualquier otro cambio de status (lo cual es correcto: si el status cambio, el flujo se detiene de todas formas).

### Estado "En proceso" como fallback

Cuando llega un status CRM que no esta mapeado, se actualiza el lead a "En proceso". Este estado DEBE existir en `CatEstadoGestion`. Validar en el seed que existe, y si no, crearlo. En runtime, si `findFirst({ where: { nombre: "En proceso" } })` retorna null, loguear error y no actualizar el estado (pero si detener el flujo).

---

## Modelo de datos — Resumen de cambios

### Campos nuevos en LeadTracking

```prisma
crmStatusInicial   String?   @map("crm_status_inicial")
semaphoreTimeMs    BigInt?   @map("semaphore_time_ms")
semaphoreColor     String?   @map("semaphore_color")
```

### Tablas nuevas

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

### Seed

- Agregar estado "Eliminado" a `CatEstadoGestion`
- Validar que "En proceso" existe en `CatEstadoGestion` (fallback para status no mapeados)
- Agregar mapeos de ejemplo para el tenant demo
- Actualizar orden de limpieza: borrar `webhook_request_log` antes de `leads_tracking`

---

## API Endpoints

### Endpoints modificados

**`GET /api/settings/guardian`** — incluye `tiempoVerdeMins` y `tiempoAmarilloMins` (con defaults 5/5 si no estan configurados)

**`PUT /api/settings/guardian`** — validacion adicional: `tiempoVerdeMins` 1-30, `tiempoAmarilloMins` 1-30

**`GET /api/intel/abandonment`** — respuesta modificada:
```json
{
  "thresholds": {
    "tiempoVerdeMins": 5,
    "tiempoAmarilloMins": 5
  },
  "leads": [
    {
      "id": "...",
      "name": "...",
      "source": "...",
      "waitMs": 374000,
      "isFlowActive": true,
      "semaphoreTimeMs": null,
      "semaphoreColor": null,
      "crmStatusInicial": "Frio"
    }
  ]
}
```

Cambios:
- Se elimina `maxMs` hardcoded del backend
- Se agrega `thresholds` con los umbrales del tenant
- Se agrega `isFlowActive` (boolean): `true` si `flowJobId !== null`. El frontend usa este flag para decidir si el timer esta vivo (incremento local) o congelado (muestra `semaphoreTimeMs` fijo)
- Leads con flujo activo: `semaphoreTimeMs` y `semaphoreColor` son null, `waitMs` sigue calculandose server-side
- Leads con flujo terminado: `semaphoreTimeMs` y `semaphoreColor` tienen los valores persistidos, `waitMs` no se calcula
- El query retorna leads activos (flowJobId IS NOT NULL) mas leads terminados recientes (ultimas 24h con semaphoreTimeMs IS NOT NULL) para dar visibilidad historica

### Endpoints nuevos

**`GET /api/settings/crm-mapping`** — lista mapeos del tenant
```json
{
  "mappings": [
    {
      "id": 1,
      "platformSlug": "clientify",
      "crmStatus": "contactado",
      "estadoGestion": { "id": 3, "nombre": "En proceso" }
    }
  ]
}
```

**`POST /api/settings/crm-mapping`** — crear mapeo
```json
{
  "platformSlug": "clientify",
  "crmStatus": "Contactado",
  "catEstadoGestionId": 3
}
```
Validaciones: crmStatus se guarda en lowercase, unique constraint (409 si duplicado), catEstadoGestionId debe existir.

**`DELETE /api/settings/crm-mapping/:id`** — eliminar mapeo (verificando pertenencia al tenant)

**`GET /api/settings/estados-gestion`** — lista CatEstadoGestion para selectores del frontend. Se monta en `routes/settings.ts` ya que alimenta la UI de configuracion del mapeo CRM.

**`GET /api/settings/webhook-log`** — historial paginado con filtro por source
Query params:
- `page` (int, default 1): numero de pagina
- `pageSize` (int, default 20, max 100): registros por pagina
- `source` (string, opcional): filtrar por fuente ("clientify", "meta", etc.)

Respuesta:
```json
{
  "logs": [ ... ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

## Frontend

### Semaforo de Abandono (intel-abandonment.tsx)

- Reemplazar umbrales hardcoded (5 min / 10 min) por `thresholds` del endpoint
- Timer sin tope, formato amigable (MM:SS / Xh Ym / Xd Yh)
- Barra de progreso: relativa al umbral rojo (verde+amarillo). Al 100% se queda llena en rojo, timer sigue contando
- Leads con `isFlowActive: false` muestran `semaphoreTimeMs` como tiempo final congelado (sin incremento local)
- Leads con `isFlowActive: true` muestran timer en vivo con incremento local de 1s

### Configuracion del Guardian (guardian-config.tsx)

Nuevos campos en el panel existente:

```
Semaforo de Abandono

Verde (OK)           [  5  ] min
Amarillo (En riesgo) [  5  ] min  (10 min max)
Rojo (Critico)       > 10 min (informativo)
```

- Al cambiar verde: se recalcula inicio y maximo del amarillo
- Al cambiar amarillo: se recalcula texto informativo del rojo
- Rojo siempre muestra "> {verde + amarillo} min" como texto no editable

### Mapeo de estados CRM (nueva seccion)

Ubicacion: entre la estrategia del Guardian y la Boveda de seguridad.

Formulario arriba: selector plataforma + input texto estado CRM + selector CatEstadoGestion + boton agregar.
Tabla abajo: lista de mapeos existentes con boton eliminar por fila.
Validacion inline: si el estado CRM ya existe para esa plataforma, mostrar error antes de enviar.

### Log de webhooks

Apartado colapsable o tab dentro del mapeo de estados. Tabla con columnas: Fecha/Hora, Fuente, Estado CRM, Accion. Paginacion (page/pageSize) y filtro por fuente.

---

## Cambios por archivo

### Backend (apps/api)

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | 3 campos en LeadTracking (crmStatusInicial, semaphoreTimeMs BigInt, semaphoreColor), 2 tablas nuevas (CrmStateMapping, WebhookRequestLog con onDelete:SetNull), relaciones en Tenant y CatEstadoGestion |
| `prisma/seed.ts` | Estado "Eliminado" y validar "En proceso" en CatEstadoGestion, mapeos de ejemplo, actualizar orden limpieza (webhook_request_log antes de leads_tracking) |
| `routes/settings.ts` | Agregar tiempoVerdeMins/tiempoAmarilloMins a GUARDIAN_DEFAULTS. Validacion en PUT guardian. Endpoints CRUD /settings/crm-mapping, GET /settings/estados-gestion, GET /settings/webhook-log con paginacion |
| `routes/intel.ts` | Agregar thresholds y isFlowActive a respuesta abandonment, eliminar maxMs hardcoded, query mixto (activos + terminados recientes) |
| `routes/webhook.ts` | Gate flowJobId !== null. Logica para leads existentes: comparar status, endFlow si cambio, mapear estado. Registrar WebhookRequestLog (insert unico con action final). Guard defensivo para eliminacion (TODO) |
| `services/lead-flow.ts` | Nueva funcion stopFlowWithSemaphore(tenantId, leadId) que lee settings con defaults, calcula tiempo+color, persiste y llama endFlow. Integrar en todos los puntos de terminacion (handleButtonResponse, handleTimeout, lead-cleanup) |
| `modules/clientify.ts` | Agregar status a NormalizedLead (ya existe en ClientifyContact pero no se mapea) |

### Frontend (apps/web)

| Archivo | Cambio |
|---------|--------|
| `components/intel-abandonment.tsx` | Umbrales dinamicos desde thresholds, timer sin tope (eliminar Math.min con maxMs), formato amigable, barra de progreso relativa a umbral rojo (100% = rojo), flag isFlowActive para timer vivo vs congelado |
| `components/guardian-config.tsx` | Inputs verde/amarillo con calculo dinamico del rojo informativo |
| Nueva seccion mapeo CRM | Formulario (selector plataforma + input CRM status + selector estado app) + tabla mapeos con delete + log webhooks colapsable con paginacion |
| `pages/DashboardPage.tsx` | Pasar thresholds al componente semaforo |

### Shared (packages/shared)

| Archivo | Cambio |
|---------|--------|
| Types | Tipos para CrmStateMapping, WebhookRequestLog, thresholds del semaforo, NormalizedLead con status |

---

## Pendientes / Puntos a validar

1. **Formato de eliminacion de Clientify**: capturar payload con pruebas para identificar como senaliza `hook.event` en eliminaciones. Hasta entonces, guard defensivo desactivado (`isDeleteEvent = false`)
2. **Estado "En proceso" como fallback**: validar en seed que existe en CatEstadoGestion. En runtime, si no existe, loguear error y no actualizar estado (pero si detener flujo)
