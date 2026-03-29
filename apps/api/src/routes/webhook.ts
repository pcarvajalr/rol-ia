import { Hono } from "hono"
import { prisma } from "../db/client"
import { validateCredentials } from "../utils/encryption"
import { parseClientifyPayload } from "../modules/clientify"
import { sendEmailToOwner } from "../modules/email"
import { parseCalcomWebhook, validateCalcomSignature } from "../modules/calcom"
import { sendTextMessage } from "../modules/whatsapp"
import { createTask, cancelTask } from "../services/task-scheduler"
import { startFlow, handleButtonResponse, stopFlowWithSemaphore } from "../services/lead-flow"
import {
  parseWebhookPayload,
  findTenantByPhoneNumberId,
  // validateWebhookSignature, // TODO: restaurar con validación de firma
} from "../modules/whatsapp"

const webhookRouter = new Hono()

// =============================================
// CAL.COM WEBHOOK (debe ir ANTES de la ruta genérica /:plataforma/:idEmpresa)
// =============================================

// POST /webhook/calcom/:tenantId
webhookRouter.post("/calcom/:tenantId", async (c) => {
  const { tenantId } = c.req.param()
  const rawBody = await c.req.text()

  console.log(`[webhook] Cal.com raw body (${rawBody.length} chars):`, rawBody.substring(0, 500))

  // Cal.com puede enviar ping vacío al configurar el webhook
  if (!rawBody || rawBody.trim() === "") {
    console.log(`[webhook] Cal.com: ping vacío para tenant ${tenantId}`)
    return c.json({ ok: true })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    console.error(`[webhook] Cal.com: JSON inválido para tenant ${tenantId}`)
    return c.json({ error: "Invalid JSON" }, 400)
  }

  console.log(`[webhook] Cal.com recibido para tenant ${tenantId}`)

  // Responder 200 inmediato, procesar en background
  processCalcomInBackground(tenantId, rawBody, body, c.req.raw.headers)

  return c.json({ ok: true })
})

// POST /webhook/:plataforma/:idEmpresa
webhookRouter.post("/:plataforma/:idEmpresa", async (c) => {
  const { plataforma, idEmpresa } = c.req.param()

  // Validar plataforma soportada (sin consultar DB)
  if (plataforma !== "clientify") {
    return c.json({ error: `Plataforma "${plataforma}" no soportada` }, 400)
  }

  // Parsear body y logear inmediatamente (queda en Google Cloud Logging)
  const body = await c.req.json()
  console.log(`[webhook] Recibido ${plataforma}/${idEmpresa}:`, JSON.stringify(body))

  // Responder 200 inmediato — Clientify no espera validación
  // Todo el procesamiento corre en background (requiere --no-cpu-throttling en Cloud Run)
  processWebhookInBackground(plataforma, idEmpresa, body, c.req.raw.headers)

  return c.json({ ok: true })
})

function processWebhookInBackground(
  plataforma: string,
  tenantId: string,
  body: unknown,
  headers: Headers
): void {
  const process = async () => {
    // 1. Verificar tenant existe
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, active: true },
    })

    if (!tenant || !tenant.active) {
      console.error(`[webhook] Tenant ${tenantId} no encontrado o inactivo`)
      return
    }

    // 2. Autenticar según plataforma
    if (plataforma === "clientify") {
      try {
        const credentials = await validateCredentials(tenantId, "clientify", ["api_token"])

        const authHeader = headers.get("Authorization")
        if (authHeader?.startsWith("Token ")) {
          const token = authHeader.replace("Token ", "")
          if (credentials.api_token !== token) {
            console.error(`[webhook] Token inválido para tenant ${tenantId}`)
            return
          }
        }
      } catch {
        console.error(`[webhook] Integración clientify no configurada para tenant ${tenantId}`)
        return
      }

      // 3. Procesar
      await handleClientifyWebhook(tenantId, body)
    }
  }

  process().catch((error) => {
    console.error(`[webhook] Error procesando ${plataforma} para tenant ${tenantId}:`, error)
  })
}

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

  // Verificar si ya existe un lead con este externalId
  const existingLead = await prisma.leadTracking.findFirst({
    where: { tenantId, externalId: lead.externalId, fuente: lead.fuente },
  })

  if (existingLead) {
    const incomingStatus = lead.status?.toLowerCase() || null

    // Lead semaphore already stopped (by CRM status change) — just log and skip
    if (existingLead.semaphoreTimeMs !== null) {
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
    // NOTE: When enabling, review if parseClientifyPayload can handle delete-event payloads
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
      crmStatusInicial: lead.status?.toLowerCase() || null,
    },
  })

  await logWebhookRequest({
    tenantId,
    source: "clientify",
    externalId: lead.externalId,
    crmStatus: lead.status || null,
    leadId: newLead.leadId,
    action: "created",
    payload: body,
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

  // Verificar si el status inicial del CRM está mapeado a un estado de la app
  const incomingStatus = lead.status?.toLowerCase() || null
  if (incomingStatus) {
    const mapping = await prisma.crmStateMapping.findFirst({
      where: { tenantId, platformSlug: "clientify", crmStatus: incomingStatus },
    })
    if (mapping) {
      // Status mapeado: asignar estado mapeado, no iniciar flow, registrar semáforo inmediato
      await prisma.leadTracking.update({
        where: { leadId: newLead.leadId },
        data: {
          idEstado: mapping.catEstadoGestionId,
          semaphoreTimeMs: BigInt(0),
          semaphoreColor: "verde",
        },
      })
      console.log(`[webhook] Lead ${newLead.leadId} ingresó con status mapeado "${incomingStatus}", sin flow`)
      return
    }
  }

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

  await startFlow(tenantId, newLead.leadId)
}

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

  console.log(`[webhook] Meta payload recibido:`, rawBody)

  const parsed = parseWebhookPayload(body)

  if (!parsed) {
    console.log(`[webhook] Meta payload no parseable, ignorando`)
    return c.json({ ok: true })
  }

  console.log(`[webhook] Meta parsed: type=${parsed.type}, from=${parsed.from}, phoneNumberId=${parsed.phoneNumberId}, buttonId=${parsed.buttonId}`)

  // Identify tenant
  const tenantId = await findTenantByPhoneNumberId(parsed.phoneNumberId)

  if (!tenantId) {
    console.error(`[webhook] No tenant found for phone_number_id: ${parsed.phoneNumberId}`)
    return c.json({ ok: true })
  }

  // TODO: Restaurar validación de firma cuando Meta envíe callbacks reales
  // const signature = c.req.header("X-Hub-Signature-256")
  // if (!signature) {
  //   console.error(`[webhook] Missing X-Hub-Signature-256 for tenant ${tenantId}`)
  //   return c.json({ error: "Signature required" }, 403)
  // }
  // try {
  //   const credentials = await validateCredentials(tenantId, "whatsapp", ["app_secret"])
  //   if (!validateWebhookSignature(rawBody, signature, credentials.app_secret)) {
  //     console.error(`[webhook] Invalid Meta signature for tenant ${tenantId}`)
  //     return c.json({ error: "Invalid signature" }, 403)
  //   }
  // } catch (error) {
  //   console.error(`[webhook] Cannot validate signature for tenant ${tenantId}:`, error)
  //   return c.json({ error: "Signature validation failed" }, 500)
  // }

  // Process button responses AND text numeric responses (fallback mode)
  let responseId: string | null = null

  if (parsed.type === "button_reply" && parsed.buttonId) {
    responseId = parsed.buttonId
  } else if (parsed.type === "text" && parsed.textBody) {
    // TEMPORAL: soportar respuestas numéricas cuando se usa texto en vez de template
    const trimmed = parsed.textBody.trim()
    if (["1", "2", "3", "4"].includes(trimmed)) {
      responseId = trimmed
      console.log(`[webhook] Meta: respuesta numérica "${trimmed}" de ${parsed.from}`)
    }
  }

  if (responseId) {
    try {
      // Find lead with active flow by phone number (normalize: Meta sends without +, DB may have +)
      const phoneVariants = [parsed.from, `+${parsed.from}`]
      const lead = await prisma.leadTracking.findFirst({
        where: {
          tenantId,
          telefono: { in: phoneVariants },
          flowJobId: { not: null },
        },
        orderBy: { fechaCreacion: "desc" },
      })

      if (!lead) {
        console.error(`[webhook] No lead found for phone ${parsed.from} in tenant ${tenantId}`)
      } else {
        await handleButtonResponse(tenantId, lead.leadId, responseId)
      }
    } catch (error) {
      console.error("[webhook] Error processing Meta callback:", error)
    }
  }

  return c.json({ ok: true })
})

async function processCalcomInBackground(
  tenantId: string,
  rawBody: string,
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
      console.error(`[webhook] Cal.com: tenant ${tenantId} no encontrado o inactivo`)
      return
    }

    // 2. Validar firma
    try {
      const credentials = await validateCredentials(tenantId, "calcom", ["webhook_secret"])
      const signature = headers.get("x-cal-signature-256") || ""
      if (!validateCalcomSignature(rawBody, signature, credentials.webhook_secret)) {
        console.error(`[webhook] Cal.com: firma inválida para tenant ${tenantId}`)
        return
      }
    } catch {
      console.error(`[webhook] Cal.com: credenciales no configuradas para tenant ${tenantId}`)
      return
    }

    // 3. Parsear payload
    const parsed = parseCalcomWebhook(body)
    if (!parsed) {
      console.error(`[webhook] Cal.com: payload no parseable`)
      return
    }

    console.log(`[webhook] Cal.com event: ${parsed.triggerEvent}, uid: ${parsed.bookingUid}, phone: ${parsed.attendeePhone}`)

    if (parsed.triggerEvent === "BOOKING_CREATED") {
      await handleCalcomBookingCreated(tenantId, parsed)
    } else if (parsed.triggerEvent === "BOOKING_CANCELLED") {
      await handleCalcomBookingCancelled(tenantId, parsed)
    }
  } catch (error) {
    console.error(`[webhook] Error procesando Cal.com para tenant ${tenantId}:`, error)
  }
}

async function handleCalcomBookingCreated(
  tenantId: string,
  booking: ReturnType<typeof parseCalcomWebhook> & {}
): Promise<void> {
  if (!booking.attendeePhone) {
    console.error(`[webhook] Cal.com booking sin teléfono, uid: ${booking.bookingUid}`)
    return
  }

  const phoneVariants = [
    booking.attendeePhone,
    booking.attendeePhone.replace(/^\+/, ""),
  ]

  // Buscar cita pendiente más reciente para este teléfono
  const cita = await prisma.citaAgendada.findFirst({
    where: {
      tenantId,
      estado: "pendiente",
      lead: { telefono: { in: phoneVariants } },
    },
    include: { lead: true },
    orderBy: { creadoEn: "desc" },
  })

  if (!cita) {
    console.error(`[webhook] Cal.com: no hay cita pendiente para teléfono ${booking.attendeePhone} en tenant ${tenantId}`)
    return
  }

  // Actualizar cita
  await prisma.citaAgendada.update({
    where: { idCita: cita.idCita },
    data: {
      horaAgenda: booking.startTime,
      estado: "confirmada",
      calcomBookingUid: booking.bookingUid,
      notas: booking.notes,
    },
  })

  console.log(`[webhook] Cal.com: cita ${cita.idCita} confirmada, hora: ${booking.startTime.toISOString()}`)

  // Enviar WhatsApp de confirmación
  if (cita.lead.telefono) {
    try {
      const tz = "America/Bogota"
      const dateStr = booking.startTime.toLocaleDateString("es-CO", {
        weekday: "long", day: "numeric", month: "long", timeZone: tz,
      })
      const timeStr = booking.startTime.toLocaleTimeString("es-CO", {
        hour: "2-digit", minute: "2-digit", hour12: true, timeZone: tz,
      })
      await sendTextMessage(
        tenantId,
        cita.lead.telefono,
        `Tu cita ha sido confirmada, ${cita.lead.nombreLead}. ${dateStr} a las ${timeStr}. Te enviaremos un recordatorio 30 minutos antes.`
      )
    } catch (error) {
      console.error(`[webhook] Cal.com: error enviando confirmación WhatsApp para cita ${cita.idCita}:`, error)
    }
  }

  // Programar recordatorio 30 min antes
  const reminderTime = new Date(booking.startTime.getTime() - 30 * 60 * 1000)

  if (reminderTime.getTime() > Date.now()) {
    try {
      const delaySec = Math.floor((reminderTime.getTime() - Date.now()) / 1000)
      const taskId = `cita-reminder-${cita.idCita}`
      const taskName = await createTask(taskId, `/internal/cita-reminder/${cita.idCita}`, delaySec)

      await prisma.citaAgendada.update({
        where: { idCita: cita.idCita },
        data: { reminderTaskId: taskName },
      })

      console.log(`[webhook] Cal.com: recordatorio programado para cita ${cita.idCita} en ${delaySec}s`)
    } catch (error) {
      console.error(`[webhook] Cal.com: error programando recordatorio para cita ${cita.idCita}:`, error)
    }
  } else {
    console.log(`[webhook] Cal.com: cita ${cita.idCita} muy próxima, recordatorio omitido`)
  }
}

async function handleCalcomBookingCancelled(
  tenantId: string,
  booking: ReturnType<typeof parseCalcomWebhook> & {}
): Promise<void> {
  const cita = await prisma.citaAgendada.findFirst({
    where: {
      tenantId,
      calcomBookingUid: booking.bookingUid,
    },
    include: { lead: true },
  })

  if (!cita) {
    console.log(`[webhook] Cal.com: no hay cita para booking cancelado ${booking.bookingUid}`)
    return
  }

  // Cancelar Cloud Task de recordatorio si existe
  if (cita.reminderTaskId) {
    try {
      await cancelTask(cita.reminderTaskId)
    } catch (error) {
      console.error(`[webhook] Cal.com: error cancelando recordatorio:`, error)
    }
  }

  // Actualizar estado
  await prisma.citaAgendada.update({
    where: { idCita: cita.idCita },
    data: { estado: "cancelada", reminderTaskId: null },
  })

  console.log(`[webhook] Cal.com: cita ${cita.idCita} cancelada`)

  // Notificar al lead
  if (cita.lead.telefono) {
    try {
      await sendTextMessage(
        tenantId,
        cita.lead.telefono,
        `${cita.lead.nombreLead}, tu cita ha sido cancelada. Si deseas reagendar, por favor contáctanos.`
      )
    } catch (error) {
      console.error(`[webhook] Cal.com: error enviando cancelación WhatsApp:`, error)
    }
  }
}

export { webhookRouter }
