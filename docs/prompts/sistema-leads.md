# Implementar sistema de captura y gestión de leads vía webhook

## Contexto
Sistema multi-tenant existente de seguimiento, con módulo de configuración "bóveda de seguridad" para
credenciales de integraciones por tenant. Se requiere agregar un flujo de captura y seguimiento automático
de leads desde CRMs/redes sociales, iniciando con Clientify.

## Archivos clave
- Módulo de configuración / bóveda de seguridad (credenciales por tenant) existente.
- Modelos/migraciones de tablas actuales (leads, empresas/tenants, procesos), tenant_integrations guarda los datos de cada tenant encriptados, integration_fields guarda el identificador de cada campo de la integracion en field_key. con este identificador se encuentra el dato que se necesita en cada proceso. integration_platforms guarda las plataformas y se identifican con slug: clientify, vapi, whatsapp, email, google_calendar. tabla leads_event_history registra seguimientos del lead.
- `apps/api/src/routes/settings.ts` — endpoints GET/PUT para configuración de guardian por tenant (incluye `tiempoRespuestaLeadSeg`).
- `leads_tracking.telefono`, `leads_tracking.email`, `leads_tracking.flow_job_id` — campos de contacto y referencia al job activo (ya migrados).
- `apps/api/src/modules/email.ts` — módulo de envío de emails ya implementado.

## Modelo de datos del lead

### Campos de `leads_tracking`
| Campo | Uso |
|-------|-----|
| `lead_id` (PK) | UUID autogenerado (`@default(uuid())`). Identificador único interno del sistema. **YA MIGRADO**. |
| `external_id` | ID del contacto en el CRM/plataforma origen (ej: `"12345"` de Clientify). **YA MIGRADO**. |
| `nombre_lead` | `first_name + last_name` del payload de Clientify |
| `fuente` | `contact_source` del payload de Clientify. Identifica qué plataforma/CRM es origen. |
| `telefono` | `phone` del payload de Clientify. Necesario para WhatsApp. |
| `email` | `email` del payload de Clientify. Contexto y notificaciones. |
| `id_estado` | FK a `cat_estados_gestion`. Estado comercial del lead (Nuevo, Contactado, etc.). Se busca por nombre, NO por ID hardcodeado. |
| `flow_job_id` | ID del Cloud Task activo. Para cancelar el timer al terminar flujo. |

**Constraint de idempotencia** (ya migrado): `@@unique([tenantId, externalId, fuente])` — un mismo contacto de la misma fuente para el mismo tenant no se duplica.

### Tipos de evento (`cat_tipos_evento`)
| ID | Nombre | Uso |
|----|--------|-----|
| 1 | Lead ingreso | Lead ingresó al sistema |
| 2 | Llamada | Se realizó llamada VAPI |
| 3 | WhatsApp | Se envió mensaje WhatsApp |
| 4 | Email | Se envió email |
| 5 | Cita | Se agendó cita |
| 6 | Timeout | Flujo expiró por TTL (12h). **YA EN SEED.** |

### Máquina de estados del flujo (via `leads_event_history`)
El estado del flujo automatizado NO se guarda en un campo de `leads_tracking`. Se **deriva del último evento** registrado en `leads_event_history` para ese lead. Esto mantiene trazabilidad completa y evita inconsistencias.

**Estados del flujo (derivados del último `id_tipo_evento` + `descripcion`):**

| Estado lógico | Se determina por | Siguiente paso |
|----------------|-----------------|----------------|
| `ingreso` | Último evento = "Lead ingreso" | Primer timer activo |
| `consulta_estado` | Transitorio (no persistido). Ocurre dentro del handler de timeout: se consulta el estado del lead en la API del CRM origen. | Enviar WhatsApp |
| `whatsapp_enviado` | Último evento = "WhatsApp" | Segundo timer activo |
| `completado` | Último evento = "Llamada" / "Cita" / "Timeout" / descripcion contiene "No contactar" | Flujo terminado |

**Nota**: `consulta_estado` NO se registra como evento. Es un paso interno de procesamiento. Los estados reales persistidos son: `ingreso`, `whatsapp_enviado`, y los terminales.

**Transiciones válidas:**
```
Lead ingreso → (timer vence) → consulta_estado → WhatsApp enviado → (timer vence) → Llamada VAPI → Completado
                                                                    → Botón "Llamar" → Completado
                                                                    → Botón "Agendar" → Completado
                                                                    → Botón "No Contactar" → Completado
                                                 → (TTL 12h) → Timeout → Completado
```

**Validación antes de cada acción:** consultar el último evento del lead en `leads_event_history`. Si el flujo ya está en estado `completado`, NO actuar. Esto previene doble ejecución y race conditions.

## Tareas

- Crear Módulo de WhatsApp (Meta API) — ver sección 7.
- Crear Módulo de VAPI si existe
- Crear Sistema de colas/timers con Google Cloud Tasks — ver sección 6.
- ~~Crear módulo de envío de emails~~ → **YA IMPLEMENTADO** en `apps/api/src/modules/email.ts`. Usa credenciales SMTP de la bóveda por tenant (slug `email`). Funciones: `sendEmail(tenantId, options)`, `sendEmailToOwner(tenantId, subject, html)`, `validateSmtpCredentials(tenantId)`.
- ~~Migración pendiente~~ → **YA MIGRADO**: `lead_id` es UUID autogenerado, campo `external_id` agregado, constraint `@@unique([tenantId, externalId, fuente])` aplicado, tipo "Timeout" agregado al seed.

### 1. Webhook principal orquestador
   - Crear endpoint `POST /webhook/:plataforma/:idEmpresa`
   - **Montaje**: las rutas de webhook se montan en `index.ts` ANTES del middleware CORS global, para que Clientify y Meta puedan llamar sin restricciones de origen. Ejemplo:
     ```typescript
     // Webhooks — sin CORS (llamados por servicios externos)
     app.route("/webhook", webhookRoutes)

     // CORS — solo para rutas del frontend
     app.use("*", cors({ origin: [...] }))
     ```
   - **Seguridad**: validar que `idEmpresa` es un tenantId existente con integración activa de la plataforma correspondiente. Verificar header `Authorization: Token {api_token}` contra el `api_token` almacenado en la bóveda del tenant (slug `clientify`).
   - **Respuesta rápida**: el endpoint responde `200 OK` inmediatamente tras validar el payload mínimo. El procesamiento del lead se ejecuta async via `setImmediate()` o Cloud Task con delay 0.
   - Delegar al módulo correspondiente según `:plataforma`, inicialmente solo `clientify`.

### 2. Módulo Clientify
   - Validar payload recibido de Clientify. Campos esperados:
     ```json
     {
       "id": 12345,
       "first_name": "Carlos",
       "last_name": "Perez",
       "email": "carlos@ejemplo.com",
       "phone": "+573001234567",
       "status": "warm-lead",
       "contact_source": "Meta",
       "company": "Empresa SAS",
       "custom_fields": []
     }
     ```
   - Mapeo: `external_id` = `id` (convertido a string), `lead_id` = UUID autogenerado, `nombre_lead` = `first_name + " " + last_name`, `fuente` = `contact_source`, `telefono` = `phone`, `email` = `email`.
   - **Idempotencia**: antes de crear, verificar si ya existe un lead con `external_id` = `id` + `tenant_id` = `idEmpresa` + `fuente` = `contact_source` (constraint unique).
     - Si ya existe y último evento = "completado" → ignorar, responder 200.
     - Si ya existe y flujo activo (último evento != "completado") → ignorar, responder 200.
     - Si no existe → crear y continuar flujo.
   - Persistir lead con `id_estado` buscando "Nuevo" por nombre en `cat_estados_gestion`.

### 3. Flujo principal del lead (MVP)
   - Persistir el lead con estado Nuevo, registrar en `leads_event_history` evento "Lead ingreso" con `actor_intervencion = "IA"`.
   - Crear Cloud Task con delay = `tiempoRespuestaLeadSeg` del tenant (default 15 seg). Guardar el task ID en `leads_tracking.flow_job_id`.
   - Al vencer el timer (endpoint `POST /internal/lead-timeout/:leadId`):
     1. Verificar que el último evento del lead sigue siendo "Lead ingreso" (si no, el flujo ya avanzó → no actuar).
     2. **consulta_estado**: Consultar estado actualizado del lead vía API del CRM origen. Para Clientify: `GET https://api.clientify.net/v1/contacts/:externalId/` con header `Authorization: Token {api_token}`. El campo `external_id` del lead se usa directamente para la consulta.
     3. Actualizar `id_estado` en BD según respuesta del CRM (buscar por nombre en `cat_estados_gestion`, si el estado no existe dejarlo "Nuevo").
   - **MVP**: enviar mensaje WhatsApp automáticamente con plantilla `rol_primer_contacto` (3 botones). Actualizar estado a "Contactado" (buscar por nombre). Registrar evento "WhatsApp" en `leads_event_history`. Crear nuevo Cloud Task (segundo timer) y actualizar `flow_job_id`.
   - **Producción futura NO IMPLEMENTAR Y DOCUMENTAR EN CLAUDE.md como pendiente**: antes de enviar WhatsApp, validar si el lead sigue pendiente en Clientify.
   - Botones de plantilla `rol_primer_contacto`:
     - **"Llamar Ahora"** → ejecutar llamada vía VAPI → registrar evento "Llamada" → terminar flujo.
     - **"Agendar Cita"** → enviar por WhatsApp el enlace de Google Calendar con mensaje amigable (URL iCal del tenant, plataforma `google_calendar`, campo `calendar_url`) → registrar evento "Cita" → terminar flujo.
     - **"No Contactar"** → enviar correo al owner del tenant usando `sendEmailToOwner(tenantId, "Lead rechazó contacto", html)` del módulo `apps/api/src/modules/email.ts` (usa credenciales SMTP de la bóveda del tenant) → registrar evento con descripcion "No contactar" → Actualizar estado a "Nuevo" → terminar flujo.
   - Si no hay respuesta al segundo timer → llamar vía VAPI → registrar evento "Llamada" → terminar flujo.
   - **Al terminar flujo**: cancelar Cloud Task activo usando `flow_job_id`, limpiar `flow_job_id` a null.
   - Todos los eventos se registran con `actor_intervencion = "IA"`.
   - Los ids de los estados se buscan en `cat_estados_gestion` por nombre.

### 4. Validación de credenciales antes de cada proceso
   - Verificar existencia y funcionamiento de credenciales en bóveda de cada integración requerida:
     - Clientify (slug: `clientify`, campo: `api_token`)
     - WhatsApp/Meta (slug: `whatsapp`, campos: `account_id`, `phone_number`, `access_token`)
     - VAPI (slug: `vapi`, campos: `assistant_id`, `auth_token`)
     - Email (slug: `email`, campos: `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `from_email`)
     - Google Calendar (slug: `google_calendar`, campo: `calendar_url`) — solo para acción "Agendar Cita"
   - Si alguna falla: notificar al owner usando `sendEmailToOwner(tenantId, "Error de credenciales de la plataforma x al intentar contactar el lead x", html)` del módulo email. Si email no está configurado, solo log en consola. Detener el flujo y cancelar Cloud Task si existe (`flow_job_id`).

### 5. Configuración por tenant en bóveda de seguridad
   Ya implementada. Plataformas disponibles: whatsapp, vapi, telephony, clientify, email, google_calendar.

### 6. Timers/Jobs — Google Cloud Tasks
   - **Infraestructura**: Google Cloud Tasks (GCP). 1M operaciones/mes gratis. Persistente, sobrevive reinicios, compatible con Cloud Run.
   - **Crear servicio `apps/api/src/services/task-scheduler.ts`** con interfaz:
     ```typescript
     interface TaskScheduler {
       createTask(taskId: string, endpoint: string, delaySec: number, payload?: object): Promise<string>
       cancelTask(taskId: string): Promise<void>
     }
     ```
   - **Implementación producción**: usa `@google-cloud/tasks` SDK. Queue configurada en GCP. Tasks apuntan a endpoints internos del API en Cloud Run.
   - **Implementación dev local**: adapter in-memory con `setTimeout`. Misma interfaz, almacena referencias en Map para cancelación.
   - **Selección automática**: via variable de entorno `TASK_SCHEDULER=cloudtasks|memory`. En el arranque del servidor se instancia la implementación correspondiente. Todo el código del flujo usa la interfaz `TaskScheduler` sin conocer la implementación.
   - **Endpoints internos**: montados ANTES del CORS y SIN auth de Firebase.
     - `POST /internal/lead-timeout/:leadId` — validar que viene de Cloud Tasks (header `X-CloudTasks-TaskName` en producción).
     - `POST /internal/lead-cleanup` — llamado por Cloud Scheduler cada hora.
   - **Tiempo configurable**: se lee de `tenant.settings.guardian.tiempoRespuestaLeadSeg` (default 15 seg). Ya implementado en endpoint `GET /api/settings/guardian`.
   - **TTL máximo**: si un flujo lleva más de 12 horas sin resolverse, marcarlo como timeout. Registrar evento con tipo "Timeout" (id_tipo_evento = 6) y descripcion "Timeout - flujo expirado". Limpiar `flow_job_id`.
   - **Job de limpieza**: Cloud Scheduler (cron) cada hora que ejecuta `POST /internal/lead-cleanup`. Busca leads con `flow_job_id IS NOT NULL` cuyo último evento tenga más de 12h. Los marca como timeout y cancela sus Cloud Tasks.

### 7. Módulo WhatsApp — Webhook de respuesta de Meta
   - **Montaje**: rutas de Meta se montan ANTES del CORS global (igual que webhooks de CRM).
   - **Endpoint de verificación**: `GET /webhook/meta` — Meta envía `hub.mode`, `hub.verify_token`, `hub.challenge` para verificar el webhook. Validar `verify_token` contra valor configurado en variable de entorno `META_VERIFY_TOKEN`.
   - **Endpoint de callback**: `POST /webhook/meta` — recibe interacciones de botones del template.
   - **Payload de Meta para botón interactivo**:
     ```json
     {
       "entry": [{
         "changes": [{
           "value": {
             "metadata": { "phone_number_id": "123456789" },
             "messages": [{
               "type": "interactive",
               "interactive": {
                 "type": "button_reply",
                 "button_reply": { "id": "llamar_ahora", "title": "Llamar Ahora" }
               },
               "from": "573001234567"
             }]
           }
         }]
       }]
     }
     ```
   - **Identificación del tenant**: extraer `phone_number_id` del payload de Meta (`entry[0].changes[0].value.metadata.phone_number_id`). Buscar en `tenant_integrations` qué tenant tiene ese valor en la plataforma `whatsapp` (desencriptar credenciales y comparar campo `phone_number`). Esto identifica el tenant al que pertenece la interacción.
   - **Mapeo de botones** (button_reply.id):
     - `llamar_ahora` → ejecutar acción "Llamar Ahora" del flujo
     - `agendar_cita` → ejecutar acción "Agendar Cita" del flujo
     - `no_contactar` → ejecutar acción "No Contactar" del flujo
   - **Identificación del lead**: una vez identificado el tenant, buscar en `leads_tracking` por `telefono` = `from` + `tenantId` = tenant identificado. Validar que el lead tiene flujo activo (último evento = "WhatsApp").
   - **Envío de template**: usar Meta Cloud API `POST https://graph.facebook.com/v21.0/{phone_number_id}/messages` con credenciales de la bóveda (slug `whatsapp`). Template `rol_primer_contacto` con parámetros del lead.
   - **Crear módulo**: `apps/api/src/modules/whatsapp.ts` con funciones:
     - `sendTemplate(tenantId, to, templateName, params)` — envía plantilla
     - `sendTextMessage(tenantId, to, text)` — envía mensaje de texto (para enlace Calendar)
     - `parseWebhookPayload(body)` — parsea payload de Meta y retorna acción + número + phone_number_id
     - `findTenantByPhoneNumberId(phoneNumberId)` — busca tenant por phone_number_id en integraciones

## Restricciones
- Solo implementar integración/módulo con Clientify en esta fase.
- Respetar la estructura de tablas existente; se agregaron campos `telefono`, `email`, `flow_job_id`, `external_id` a `leads_tracking` via migración. Constraint `@@unique([tenantId, externalId, fuente])` aplicado. `lead_id` es UUID autogenerado.
- Toda credencial debe gestionarse exclusivamente desde la bóveda de seguridad existente.
- El webhook debe ser extensible para futuras plataformas sin refactorización mayor, crear nuevos módulos en `apps/api/src/modules/`.
- No hardcodear tiempos, credenciales, ni IDs de estados. Tiempo de respuesta se lee de `tenant.settings.guardian.tiempoRespuestaLeadSeg`. Estados se buscan por nombre en `cat_estados_gestion`.
- Garantizar cierre de flujo verificando último evento en `leads_event_history` antes de cada acción. Un lead no puede tener más de un flujo activo simultáneo.
- Idempotencia por `external_id` + `tenant_id` + `fuente` (constraint unique en `leads_tracking`).
- Rutas de webhook y endpoints internos se montan ANTES del CORS global para permitir llamadas de servicios externos.
