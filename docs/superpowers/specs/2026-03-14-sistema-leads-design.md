# Sistema de Captura y Gestión de Leads via Webhook — Diseño

## Resumen

Sistema de captura automática de leads desde CRMs/redes sociales (inicialmente Clientify) con flujo de seguimiento automatizado: ingreso → timer → WhatsApp → timer → llamada VAPI. Arquitectura de orquestador centralizado con módulos desacoplados, implementado en 5 fases incrementales con deploy y validación entre cada una.

## Decisiones de diseño

- **Orquestador centralizado** (`lead-flow.ts`): toda la lógica de la máquina de estados en un solo lugar. Los módulos (WhatsApp, VAPI, Clientify) son funciones puras que ejecutan una acción.
- **Estado derivado del último evento**: el estado del flujo NO se guarda en un campo. Se determina consultando el último registro en `leads_event_history`.
- **Solo Cloud Tasks**: sin adapter in-memory. Los timers solo funcionan en producción con Google Cloud Tasks.
- **Módulo WhatsApp genérico**: `sendTemplate` acepta cualquier plantilla con sus componentes, no está atado a `rol_primer_contacto`.
- **Helpers de encriptación compartidos**: extraer `encrypt`/`decrypt` de `vault.ts` y `email.ts` a `utils/encryption.ts`.

## Estructura de archivos

```
apps/api/src/
├── routes/
│   ├── webhook.ts          # POST /webhook/:plataforma/:idEmpresa
│   │                       # GET  /webhook/meta (verificación)
│   │                       # POST /webhook/meta (callback botones)
│   └── internal.ts         # POST /internal/lead-timeout/:leadId
│                           # POST /internal/lead-cleanup
├── modules/
│   ├── clientify.ts        # Parseo payload, consulta API Clientify
│   ├── whatsapp.ts         # Meta Cloud API: templates, texto, parseo webhook
│   └── vapi.ts             # Llamadas outbound VAPI
├── services/
│   ├── lead-flow.ts        # Orquestador: máquina de estados del lead
│   └── task-scheduler.ts   # Wrapper Google Cloud Tasks SDK
├── utils/
│   └── encryption.ts       # Helpers AES-256-GCM compartidos
```

### Montaje en `index.ts`

```typescript
// 1. Webhooks + internals — SIN CORS, SIN auth Firebase
app.route("/webhook", webhookRoutes)
app.route("/internal", internalRoutes)

// 2. CORS — solo para rutas del frontend
app.use("*", cors({ origin: [...] }))

// 3. Rutas autenticadas (existentes)
app.route("/auth", authRoutes)
app.route("/admin", adminRoutes)
app.route("/api", apiRoutes)
```

## Webhook y módulo Clientify

### Ruta `POST /webhook/:plataforma/:idEmpresa`

**Validación de seguridad (en `webhook.ts`, antes de delegar al módulo):**
1. Verificar que `idEmpresa` es un `tenantId` existente en BD
2. Verificar que el tenant tiene integración activa de la plataforma correspondiente
3. Autenticar según la plataforma — cada una usa su propio mecanismo:
   - **Clientify**: validar header `Authorization: Token {api_token}` contra el `api_token` de la bóveda (slug `clientify`)
   - **Meta/WhatsApp**: `verify_token` (GET) + firma `X-Hub-Signature-256` con `app_secret` del tenant (POST) — rutas separadas
   - **Plataformas futuras**: cada una define su mecanismo en `webhook.ts`
4. Si falla → `401` o `404`

**Flujo:**
1. Validar seguridad (en la ruta)
2. Responder `200 OK` inmediatamente
3. Delegar al módulo según `:plataforma` via `setImmediate()` — el módulo solo parsea y persiste, no maneja auth

### Módulo `clientify.ts`

**Funciones:**
- `parseClientifyPayload(body)` — Valida campos mínimos (`id`, `first_name`), retorna objeto normalizado
- `queryContactStatus(tenantId, externalId)` — `GET https://api.clientify.net/v1/contacts/:externalId/` con `api_token` de la bóveda

**Mapeo de campos:**

| Clientify | leads_tracking |
|-----------|---------------|
| `id` (→ string) | `externalId` |
| UUID auto | `leadId` |
| `first_name + " " + last_name` | `nombreLead` |
| `contact_source` | `fuente` |
| `phone` | `telefono` |
| `email` | `email` |

**Idempotencia:**
- Buscar por `externalId` + `tenantId` + `fuente` (constraint unique)
- Si ya existe y flujo completado (último evento = "Llamada"/"Cita"/"Timeout"/descripcion "No contactar") → ignorar, log "Lead ya completado" (200)
- Si ya existe y flujo activo (último evento != completado) → ignorar, log "Lead con flujo activo" (200)
- Si no existe → crear con `idEstado` = "Nuevo" (buscar por nombre en `cat_estados_gestion`)

**Lead sin teléfono:**
- Si `phone` es null o vacío: crear el lead normalmente, registrar evento "Lead ingreso", pero **NO iniciar flujo automático** (no crear Cloud Task).
- Enviar email al owner: `sendEmailToOwner(tenantId, "Lead sin teléfono", "El lead {nombreLead} ingresó sin número de teléfono. Requiere gestión manual.")`
- El lead queda registrado para gestión manual por un asesor.

## Task Scheduler (Google Cloud Tasks)

### Servicio `task-scheduler.ts`

> **Nota:** SDK `@google-cloud/tasks` ya instalado y queue `rol-ia-leads` ya creada en GCP. Ver sección "Setup de infraestructura GCP" para detalles completos.

```typescript
interface TaskScheduler {
  createTask(taskId: string, endpoint: string, delaySec: number, payload?: object): Promise<string>
  cancelTask(taskId: string): Promise<void>
}
```

- Usa `@google-cloud/tasks` SDK
- Queue configurada en GCP (env `GCP_QUEUE_NAME`)
- Tasks apuntan a `API_BASE_URL` + endpoint relativo
- `taskId` como nombre del task para cancelación

**Variables de entorno:** (ya configuradas en `.env`)
```
GCP_PROJECT_ID=           # ID del proyecto GCP
GCP_LOCATION=             # Región (ej: us-central1)
GCP_QUEUE_NAME=           # Nombre de la queue
API_BASE_URL=             # URL del API en Cloud Run
```

### Endpoints internos (`internal.ts`)

**`POST /internal/lead-timeout/:leadId`**
- Validar header `X-CloudTasks-TaskName` en producción
- Obtener último evento → si flujo activo → ejecutar siguiente paso via orquestador

**`POST /internal/lead-cleanup`**
- Cron cada hora (Cloud Scheduler)
- Busca leads con `flowJobId IS NOT NULL` + último evento > 12h
- Marca como timeout (evento tipo 6) y cancela Cloud Tasks

### Setup de infraestructura GCP

**Ya completado:**
- Cloud Tasks API habilitada
- Queue `rol-ia-leads` creada (us-central1, max 3 retries, 10s backoff)
- Permisos SA: `cloudtasks.enqueuer`, `cloudtasks.taskDeleter`, `run.invoker`, `iam.serviceAccountUser`
- `@google-cloud/tasks` instalado en `apps/api`
- Variables en `.env`: `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_QUEUE_NAME`, `API_BASE_URL`, `META_VERIFY_TOKEN`

**Pendiente (Fase 2):**
```bash
# Cloud Scheduler para cleanup (requiere URL de Cloud Run desplegada)
gcloud scheduler jobs create http lead-cleanup \
  --schedule="0 * * * *" \
  --uri="https://{API_BASE_URL}/internal/lead-cleanup" \
  --http-method=POST
```

## Módulo WhatsApp (Meta Cloud API)

### Módulo `whatsapp.ts`

**Funciones:**

- `getTemplateStructure(tenantId, templateName)` — Consulta la estructura de una plantilla en Meta para saber qué components necesita.
  ```
  GET https://graph.facebook.com/v21.0/{account_id}/message_templates?name={templateName}
  Authorization: Bearer {access_token}
  ```
  Retorna la estructura de components del template (HEADER, BODY, BUTTONS) con sus parámetros esperados. Usa `account_id` y `access_token` de la bóveda del tenant (slug `whatsapp`).

- `sendTemplate(tenantId, to, templateName, languageCode, params)` — Flujo completo de envío de cualquier plantilla:
  1. Llama a `getTemplateStructure` para obtener la estructura del template
  2. Construye el array `components` dinámicamente mapeando `params` (datos del lead) a los parámetros que el template requiere según su estructura
  3. Envía el mensaje con los components armados
  ```
  POST https://graph.facebook.com/v21.0/{phone_number_id}/messages
  Authorization: Bearer {access_token}
  Body: { messaging_product: "whatsapp", to, type: "template",
          template: { name, language: { code }, components } }
  ```
  `params` es un objeto genérico con datos del lead (nombre, empresa, etc.) que se mapean a los parámetros posicionales del template.

- `sendTextMessage(tenantId, to, text)` — Mensaje de texto libre.
  ```
  Body: { messaging_product: "whatsapp", to, type: "text", text: { body } }
  ```

- `parseWebhookPayload(body)` — Parsea payload de Meta, retorna `{ type, buttonId?, from, phoneNumberId }`

- `findTenantByPhoneNumberId(phoneNumberId)` — Busca tenant en `tenant_integrations` por campo `phone_number_id` de la bóveda (slug `whatsapp`, desencripta y compara con el `phone_number_id` recibido en el payload de Meta).

### Rutas Meta en `webhook.ts`

**`GET /webhook/meta`** — Verificación:
- Validar `hub.verify_token` contra env `META_VERIFY_TOKEN`
- Responder con `hub.challenge`

**`POST /webhook/meta`** — Callback:
1. Parsear payload (extraer `phone_number_id`)
2. Identificar tenant con `findTenantByPhoneNumberId`
3. Validar firma `X-Hub-Signature-256` con `app_secret` del tenant (de la bóveda) — si inválida → rechazar
4. Buscar lead por `telefono` + `tenantId`
5. Validar último evento = "WhatsApp"
6. Mapear `buttonId` → acción del orquestador
7. Responder `200` siempre

**Variable de entorno:**
```
META_VERIFY_TOKEN=        # Token de verificación compartido (única env var de Meta, el resto va en bóveda por tenant)
```

**Campos de bóveda por tenant (slug `whatsapp`):**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `phone_number` | text | Número real del tenant (ej: `+573001234567`) — display y referencia |
| `phone_number_id` | text | ID interno de Meta — API de envío y match de webhooks entrantes |
| `account_id` | text | WhatsApp Business Account ID — consulta de templates |
| `access_token` | secret | System User Token de la Meta App del tenant |
| `app_secret` | secret | App Secret de la Meta App del tenant — validación firma webhooks |

**Seed actualizado:** se eliminan `device_id` (no aplica para Cloud API). Se agregan `phone_number_id` y `app_secret`.

## Módulo VAPI

### Módulo `vapi.ts`

**Funciones:**

- `makeOutboundCall(tenantId, phoneNumber)` — Llamada outbound (fire-and-forget en MVP).
  ```
  POST https://api.vapi.ai/call
  Authorization: Bearer {auth_token}
  Body: { assistantId: assistant_id, customer: { number: phoneNumber } }
  ```
  Credenciales de la bóveda (slug `vapi`): `assistant_id`, `auth_token`.

**Uso:** segundo timeout o botón "Llamar Ahora" → `makeOutboundCall` → evento "Llamada" → `endFlow`.

## Orquestador — Máquina de estados (`lead-flow.ts`)

### Funciones principales

**`startFlow(tenantId, leadId)`**
1. Registrar evento "Lead ingreso" (`actor_intervencion = "IA"`)
2. Leer `tiempoRespuestaLeadSeg` del tenant
3. `createTask("lead-{leadId}-timer1", "/internal/lead-timeout/{leadId}", tiempoRespuestaLeadSeg)`
4. Guardar task name en `flow_job_id`

**`handleTimeout(leadId)`**
- Si último evento = "Lead ingreso" (primer timeout):
  1. Consultar estado en Clientify via `queryContactStatus`
  2. Actualizar `idEstado` según respuesta del CRM
  3. Enviar template WhatsApp `rol_primer_contacto`
     - **Si falla por número inválido** (Meta error `131026`/`131021`): registrar evento "Timeout" con descripcion "Error: número de WhatsApp inválido", notificar al owner por email, `endFlow` (cancela Cloud Task + limpia `flow_job_id`)
  4. Actualizar estado a "Contactado"
  5. Registrar evento "WhatsApp"
  6. Crear segundo Cloud Task → actualizar `flow_job_id`
- Si último evento = "WhatsApp" (segundo timeout):
  1. Llamar via VAPI
  2. Registrar evento "Llamada"
  3. `endFlow`

**`handleButtonResponse(tenantId, leadId, buttonId)`**
- `llamar_ahora` → `makeOutboundCall` → evento "Llamada" → `endFlow`
- `agendar_cita` → `sendTextMessage` con enlace Calendar (`calendar_url` de bóveda `google_calendar`) → evento "Cita" → `endFlow`
- `no_contactar` → `sendEmailToOwner` notificando rechazo → evento con descripcion "No contactar" → estado "Nuevo" → `endFlow`

**`endFlow(tenantId, leadId)`**
1. Cancelar Cloud Task via `flow_job_id`
2. Limpiar `flow_job_id` a null

**Nota:** Todos los eventos registrados por el flujo automático usan `actor_intervencion = "IA"`.

### Diagrama del flujo

```
Lead creado
  │
  ├── sin teléfono → evento "Lead ingreso" → email owner → gestión manual (sin flujo)
  │
  ▼ (con teléfono)
startFlow() → evento "Lead ingreso" → Cloud Task (timer 1)
  │
  ▼ (timer vence)
handleTimeout() → consulta Clientify → WhatsApp template
  │
  ├── número inválido (Meta error) → evento "Timeout" → email owner → endFlow()
  │
  ▼ (envío exitoso)
evento "WhatsApp" → Cloud Task (timer 2)
  │
  ├── botón "Llamar Ahora"  → VAPI call     → evento "Llamada"       → endFlow()
  ├── botón "Agendar Cita"  → Calendar link  → evento "Cita"          → endFlow()
  ├── botón "No Contactar"  → email owner    → evento "No contactar"  → endFlow()
  │
  ▼ (timer 2 vence)
handleTimeout() → VAPI call → evento "Llamada" → endFlow()

  ── (12h TTL) → lead-cleanup → evento "Timeout" → endFlow()
```

## Validación de credenciales

### Función `validateCredentials(tenantId, platform, requiredFields)`

1. Busca integración del tenant por slug de plataforma
2. Desencripta con helpers de `utils/encryption.ts`
3. Verifica que todos los campos requeridos existen y no están vacíos
4. Retorna credenciales o lanza error

**Validaciones por paso:**

| Paso | Plataforma | Campos requeridos |
|------|-----------|-------------------|
| Webhook ingreso | `clientify` | `api_token` |
| Envío WhatsApp | `whatsapp` | `phone_number_id`, `access_token` |
| Consulta template | `whatsapp` | `account_id`, `access_token` |
| Llamada VAPI | `vapi` | `assistant_id`, `auth_token` |
| Email notificación | `email` | `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `from_email` |
| Agendar Cita | `google_calendar` | `calendar_url` |

**Cuando falla:**
1. `sendEmailToOwner(tenantId, "Error de credenciales de {plataforma} al contactar lead {nombreLead}", html)`
2. Si email tampoco configurado → `console.error`
3. Registrar evento "Timeout" con descripcion "Error de credenciales: {plataforma}" → termina el flujo inmediatamente
4. Cancelar Cloud Task activo (`flow_job_id`)
5. Limpiar `flow_job_id` a null

### Helpers de encriptación compartidos (`utils/encryption.ts`)

Extraer de `vault.ts` y `email.ts`:
- `encrypt(data: Record<string, string>): { encrypted: string, iv: string }`
- `decrypt(encrypted: string, iv: string): Record<string, string>`

Ambos usan AES-256-GCM con `VAULT_ENCRYPTION_KEY`.

## Fases de implementación

### Fase 1: Webhook + Clientify + Persistencia de lead
**Archivos:** `routes/webhook.ts`, `modules/clientify.ts`, `utils/encryption.ts`, modificar `index.ts`
**Entregable:**
- Helpers de encriptación extraídos a `utils/encryption.ts` (refactor de `vault.ts` y `email.ts`)
- Endpoint `POST /webhook/clientify/:idEmpresa` funcional
- Autenticación en `webhook.ts`: valida `Authorization: Token {api_token}` contra bóveda
- Módulo `clientify.ts`: `parseClientifyPayload` + mapeo de campos
- Crea lead con estado "Nuevo" (buscar por nombre) + evento "Lead ingreso" (`actor_intervencion = "IA"`)
- Idempotencia: lead existente con flujo completado → log + 200; flujo activo → log + 200
- Lead sin teléfono: crea lead + evento "Lead ingreso" pero NO inicia flujo, notifica al owner por email
- Montar ruta webhook ANTES del CORS en `index.ts`
**Validación:** POST con payload Clientify → lead en BD con evento. Repetir → no duplica. POST sin phone → lead creado, sin timer, email al owner.

### Fase 2: Task Scheduler + Orquestador base + Endpoints internos
**Archivos:** `services/task-scheduler.ts`, `services/lead-flow.ts` (esqueleto), `routes/internal.ts`, modificar `index.ts`, modificar `routes/webhook.ts`
**Entregable:**
- `task-scheduler.ts`: implementación de `createTask` y `cancelTask` con Google Cloud Tasks SDK
- `lead-flow.ts` con `startFlow` y `endFlow`:
  - `startFlow`: registra evento "Lead ingreso", lee `tiempoRespuestaLeadSeg`, crea Cloud Task (timer 1), guarda `flow_job_id`
  - `endFlow`: cancela Cloud Task via `flow_job_id`, limpia a null
- Conectar webhook de Fase 1: después de persistir lead (con teléfono) → llamar `startFlow`
- `POST /internal/lead-timeout/:leadId`: valida header `X-CloudTasks-TaskName`, obtiene último evento, log del paso (sin ejecutar acciones aún)
- `POST /internal/lead-cleanup`: busca leads con `flowJobId IS NOT NULL` + último evento > 12h, registra evento "Timeout", ejecuta `endFlow`
- Montar rutas internas ANTES del CORS en `index.ts`
- Crear Cloud Scheduler job para cleanup
**Validación:** Deploy → POST webhook → lead creado → Cloud Task creado → timeout llega a endpoint interno (log). Cleanup marca leads viejos como Timeout.

### Fase 3: Módulo WhatsApp + Primer timeout completo
**Archivos:** `modules/whatsapp.ts`, modificar `routes/webhook.ts`, modificar `services/lead-flow.ts`, actualizar seed
**Entregable:**
- Actualizar seed de plataforma `whatsapp`: 5 campos (`phone_number`, `phone_number_id`, `account_id`, `access_token`, `app_secret`), eliminar `device_id`
- `whatsapp.ts`: `getTemplateStructure`, `sendTemplate`, `sendTextMessage`, `parseWebhookPayload`, `findTenantByPhoneNumberId`
- `GET /webhook/meta`: verificación con `META_VERIFY_TOKEN`
- `POST /webhook/meta`: parsear → identificar tenant → validar firma `X-Hub-Signature-256` con `app_secret` → responder 200
- `handleTimeout` en `lead-flow.ts` (primer timeout):
  - Consultar estado en Clientify via `queryContactStatus`
  - Consultar estructura del template con `getTemplateStructure`
  - Enviar template WhatsApp con `sendTemplate`
  - Si número inválido (Meta error `131026`/`131021`) → evento "Timeout" + email owner + `endFlow`
  - Si exitoso → actualizar estado a "Contactado" + evento "WhatsApp" + crear segundo Cloud Task
- Validación de credenciales de `whatsapp` antes de enviar (`phone_number_id`, `access_token`)
- Documentar en CLAUDE.md como pendiente: "Validación pre-WhatsApp contra CRM"
**Validación:** Timer 1 vence → WhatsApp llega al lead → botón presionado → webhook de Meta recibido e identificado. Número inválido → flujo cerrado + email al owner.

### Fase 4: Módulo VAPI + Segundo timeout completo
**Archivos:** `modules/vapi.ts`, modificar `services/lead-flow.ts`
**Entregable:**
- `vapi.ts`: `makeOutboundCall(tenantId, phoneNumber)` — fire-and-forget en MVP
- `handleTimeout` en `lead-flow.ts` (segundo timeout): último evento = "WhatsApp" → llamar VAPI → evento "Llamada" → `endFlow`
- Validación de credenciales de `vapi` antes de llamar (`assistant_id`, `auth_token`)
**Validación:** Timer 2 vence → llamada VAPI ejecutada → evento "Llamada" registrado → `flow_job_id` limpiado.

### Fase 5: Acciones de botones + Validación de credenciales completa
**Archivos:** modificar `services/lead-flow.ts`, modificar `routes/webhook.ts`
**Entregable:**
- `handleButtonResponse` en `lead-flow.ts`:
  - `llamar_ahora` → `makeOutboundCall` → evento "Llamada" → `endFlow`
  - `agendar_cita` → `sendTextMessage` con enlace Calendar (`calendar_url` de bóveda `google_calendar`) → evento "Cita" → `endFlow`
  - `no_contactar` → `sendEmailToOwner` notificando rechazo → evento "No contactar" → estado "Nuevo" → `endFlow`
- Conectar `POST /webhook/meta` callback → `handleButtonResponse`
- Validación de credenciales completa antes de cada acción (todas las plataformas)
- Notificación email al owner cuando fallan credenciales + evento "Timeout" con descripcion "Error de credenciales: {plataforma}" + `endFlow`
- Todos los eventos con `actor_intervencion = "IA"`
**Validación:** Flujo completo end-to-end: webhook Clientify → timer 1 → WhatsApp → botón/timer 2 → VAPI/Calendar/email → flujo cerrado. Fallo de credenciales → email owner + flujo cerrado.

## Variables de entorno nuevas (ya configuradas en `.env`)

```
GCP_PROJECT_ID=           # ID del proyecto GCP
GCP_LOCATION=             # Región (us-central1)
GCP_QUEUE_NAME=           # Nombre de la queue (rol-ia-leads)
API_BASE_URL=             # URL del API en Cloud Run
META_VERIFY_TOKEN=        # Token de verificación webhook Meta
```
