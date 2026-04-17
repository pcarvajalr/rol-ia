import { prisma } from "../db/client"
import { createTask, cancelTask } from "./task-scheduler"
import { queryContactStatus } from "../modules/clientify"
import { sendTemplate, sendTextMessage, getTemplateStructure } from "../modules/whatsapp"
import { makeOutboundCall } from "../modules/vapi"
import { sendEmailToOwner, sendEmail } from "../modules/email"
import { validateCredentials } from "../utils/encryption"

const GUARDIAN_DEFAULTS = {
  tipoProceso: "automatizado",
  tiempoRespuestaLeadSeg: 120,
  tiempoLlamadaSeg: 120,
  callRetryDays: 2,
  callRetryMax: 3,
  tiempoVerdeMins: 5,
  tiempoAmarilloMins: 5,
  criticalState: "", // vacio = gate desactivado
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

async function getTipoProceso(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  })
  const settings = tenant?.settings as Record<string, unknown> | null
  const guardian = settings?.guardian as Record<string, unknown> | null
  return (guardian?.tipoProceso as string) || GUARDIAN_DEFAULTS.tipoProceso
}

export async function notifyVendedor(
  tenantId: string,
  leadId: string,
  accionTexto: string
): Promise<void> {
  const lead = await prisma.leadTracking.findUnique({
    where: { leadId },
    select: { nombreLead: true, telefono: true, vendedorId: true },
  })

  if (!lead) return

  let vendedorEmail: string | null = null
  let vendedorTelefono: string | null = null

  if (lead.vendedorId) {
    const vendedor = await prisma.vendedor.findUnique({
      where: { id: lead.vendedorId },
    })
    if (vendedor) {
      vendedorEmail = vendedor.email
      vendedorTelefono = vendedor.telefono
    }
  }

  const nombreLead = lead.nombreLead
  const telefonoLead = lead.telefono || "sin teléfono"

  // 1. Intentar WhatsApp al vendedor
  if (vendedorTelefono) {
    try {
      let enviado = false
      try {
        const templateInfo = await getTemplateStructure(tenantId, "rol_notifica_vendedor")
        if (templateInfo.category === "UTILITY" && templateInfo.status === "APPROVED") {
          await sendTemplate(tenantId, vendedorTelefono, "rol_notifica_vendedor", "es", {
            "1": nombreLead,
            "2": telefonoLead,
            "3": accionTexto,
          })
          enviado = true
        }
      } catch {
        // Template no existe, usar fallback texto
      }

      if (!enviado) {
        await sendTextMessage(
          tenantId,
          vendedorTelefono,
          `[Rol.IA] ${accionTexto}\nLead: ${nombreLead}\nTeléfono: ${telefonoLead}`
        )
      }

      console.log(`[lead-flow] Notificación WhatsApp enviada al vendedor ${vendedorTelefono} para lead ${leadId}`)
      return
    } catch (error) {
      console.error(`[lead-flow] Error enviando WhatsApp al vendedor para lead ${leadId}:`, error)
    }
  }

  // 2. Fallback: email al vendedor
  if (vendedorEmail) {
    try {
      const sent = await sendEmail(tenantId, {
        to: vendedorEmail,
        subject: `[Rol.IA] ${accionTexto}`,
        html: `<p><strong>${accionTexto}</strong></p><p>Lead: ${nombreLead}<br>Teléfono: ${telefonoLead}</p>`,
      })
      if (sent) {
        console.log(`[lead-flow] Notificación email enviada al vendedor ${vendedorEmail} para lead ${leadId}`)
        return
      }
    } catch (error) {
      console.error(`[lead-flow] Error enviando email al vendedor para lead ${leadId}:`, error)
    }
  }

  // 3. Fallback: email al owner del tenant
  await sendEmailToOwner(
    tenantId,
    `[Rol.IA] ${accionTexto}`,
    `<p><strong>${accionTexto}</strong></p><p>Lead: ${nombreLead}<br>Teléfono: ${telefonoLead}</p>`
  )
  console.log(`[lead-flow] Notificación fallback email al owner para lead ${leadId}`)
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

export async function getLastEvent(leadId: string, tenantId: string) {
  return prisma.leadEventHistory.findFirst({
    where: { leadId, tenantId },
    orderBy: { timestamp: "desc" },
    include: { tipoEvento: true },
  })
}

export async function startFlow(tenantId: string, leadId: string): Promise<void> {
  const tipoProceso = await getTipoProceso(tenantId)
  const tiempoRespuesta = await getTiempoRespuesta(tenantId)

  const taskId = `lead-${leadId}-timer1`
  const taskName = await createTask(
    taskId,
    `/internal/lead-timeout/${leadId}`,
    tiempoRespuesta
  )

  await prisma.leadTracking.update({
    where: { leadId },
    data: { flowJobId: taskName },
  })

  if (tipoProceso === "directo") {
    await notifyVendedor(tenantId, leadId, "Nuevo lead ingresó al sistema")

    // Evento forense: semáforo verde
    const tipoVerde = await prisma.catTipoEvento.findFirst({ where: { nombre: "Semáforo verde" } })
    if (tipoVerde) {
      await prisma.leadEventHistory.create({
        data: { tenantId, leadId, idTipoEvento: tipoVerde.id, actorIntervencion: "IA", guardian: "G1", descripcion: "Nuevo lead asignado, vendedor notificado" },
      })
    }

    const { tiempoVerdeMins, tiempoAmarilloMins } = await getGuardianSettings(tenantId)

    const yellowDelaySec = tiempoVerdeMins * 60
    const yellowTaskId = `lead-${leadId}-semaphore-yellow`
    const yellowTaskName = await createTask(
      yellowTaskId,
      `/internal/lead-semaphore-alert/${leadId}?color=yellow`,
      yellowDelaySec
    )

    const redDelaySec = (tiempoVerdeMins + tiempoAmarilloMins) * 60
    const redTaskId = `lead-${leadId}-semaphore-red`
    const redTaskName = await createTask(
      redTaskId,
      `/internal/lead-semaphore-alert/${leadId}?color=red`,
      redDelaySec
    )

    await prisma.leadTracking.update({
      where: { leadId },
      data: {
        semaphoreYellowTaskId: yellowTaskName,
        semaphoreRedTaskId: redTaskName,
      },
    })

    console.log(`[lead-flow] Flow DIRECTO started for lead ${leadId}, timer: ${tiempoRespuesta}s, yellow: ${yellowDelaySec}s, red: ${redDelaySec}s`)
  } else {
    console.log(`[lead-flow] Flow started for lead ${leadId}, timer: ${tiempoRespuesta}s`)
  }
}

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

  const tipoProceso = await getTipoProceso(tenantId)

  if (tipoProceso === "directo") {
    await handleTimeoutDirecto(leadId, tenantId, lead, lastEvent)
  } else {
    await handleTimeoutAutomatizado(leadId, tenantId, lead, lastEvent)
  }
}

async function handleTimeoutAutomatizado(
  leadId: string,
  tenantId: string,
  lead: { nombreLead: string; telefono: string | null; externalId: string | null; email: string | null },
  lastEvent: NonNullable<Awaited<ReturnType<typeof getLastEvent>>>
): Promise<void> {
  if (lastEvent.tipoEvento?.nombre === "Lead ingreso") {
    await handleFirstTimeout(leadId, tenantId, lead)
  } else if (lastEvent.tipoEvento?.nombre === "WhatsApp") {
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

    // Evento forense: llamada rescate
    const tipoLlamadaRescate = await prisma.catTipoEvento.findFirst({ where: { nombre: "Llamada rescate" } })
    if (tipoLlamadaRescate) {
      await prisma.leadEventHistory.create({
        data: { tenantId, leadId, idTipoEvento: tipoLlamadaRescate.id, actorIntervencion: "IA", guardian: "G7", descripcion: `Llamada VAPI de rescate a ${lead.telefono}` },
      })
    }
  }
}

async function handleTimeoutDirecto(
  leadId: string,
  tenantId: string,
  lead: { nombreLead: string; telefono: string | null; externalId: string | null; email: string | null },
  lastEvent: NonNullable<Awaited<ReturnType<typeof getLastEvent>>>
): Promise<void> {
  if (lastEvent.tipoEvento?.nombre === "Lead ingreso") {
    await notifyVendedor(tenantId, leadId, "Es momento de enviar WhatsApp al lead")

    const tipoWhatsApp = await prisma.catTipoEvento.findFirst({ where: { nombre: "WhatsApp" } })
    if (tipoWhatsApp) {
      await prisma.leadEventHistory.create({
        data: {
          tenantId,
          leadId,
          idTipoEvento: tipoWhatsApp.id,
          actorIntervencion: "Vendedor",
          descripcion: "Notificación al vendedor: enviar WhatsApp",
        },
      })
    }

    // Evento forense: rescate WhatsApp (directo)
    const tipoRescateD = await prisma.catTipoEvento.findFirst({ where: { nombre: "Rescate WhatsApp" } })
    if (tipoRescateD) {
      await prisma.leadEventHistory.create({
        data: { tenantId, leadId, idTipoEvento: tipoRescateD.id, actorIntervencion: "IA", guardian: "G1", descripcion: "Notificación al vendedor: enviar WhatsApp (rescate)" },
      })
    }

    const { tiempoLlamadaSeg } = await getCallSettings(tenantId)
    const taskId = `lead-${leadId}-timer2`
    const taskName = await createTask(
      taskId,
      `/internal/lead-timeout/${leadId}`,
      tiempoLlamadaSeg
    )

    await prisma.leadTracking.update({
      where: { leadId },
      data: { flowJobId: taskName },
    })

    console.log(`[lead-flow] DIRECTO: notificación WhatsApp enviada, timer2 creado para lead ${leadId}`)
  } else if (lastEvent.tipoEvento?.nombre === "WhatsApp") {
    await notifyVendedor(tenantId, leadId, "Es momento de llamar al lead")

    const tipoLlamada = await prisma.catTipoEvento.findFirst({ where: { nombre: "Llamada" } })
    if (tipoLlamada) {
      await prisma.leadEventHistory.create({
        data: {
          tenantId,
          leadId,
          idTipoEvento: tipoLlamada.id,
          actorIntervencion: "Vendedor",
          guardian: "G7",
          descripcion: "Notificación al vendedor: llamar al lead",
        },
      })
    }

    const { callRetryDays } = await getCallSettings(tenantId)
    const delaySec = callRetryDays * 24 * 60 * 60

    const lead2 = await prisma.leadTracking.findUnique({
      where: { leadId },
      select: { callRetriesRemaining: true },
    })

    const remaining = (lead2?.callRetriesRemaining ?? 1) - 1
    await prisma.leadTracking.update({
      where: { leadId },
      data: { callRetriesRemaining: remaining },
    })

    if (remaining > 0) {
      const retryTaskId = `lead-${leadId}-retry-${remaining}`
      const retryTaskName = await createTask(
        retryTaskId,
        `/internal/lead-call-retry/${leadId}`,
        delaySec
      )

      await prisma.leadTracking.update({
        where: { leadId },
        data: { flowJobId: retryTaskName },
      })

      const tipoProgramado = await prisma.catTipoEvento.findFirst({ where: { nombre: "Reintento programado" } })
      if (tipoProgramado) {
        await prisma.leadEventHistory.create({
          data: {
            tenantId,
            leadId,
            idTipoEvento: tipoProgramado.id,
            actorIntervencion: "Vendedor",
            guardian: "G7",
            descripcion: `Reintento programado en ${callRetryDays} dias (${remaining} restantes)`,
          },
        })
      }
    } else {
      const tipoAgotados = await prisma.catTipoEvento.findFirst({ where: { nombre: "Reintentos agotados" } })
      if (tipoAgotados) {
        await prisma.leadEventHistory.create({
          data: {
            tenantId,
            leadId,
            idTipoEvento: tipoAgotados.id,
            actorIntervencion: "Vendedor",
            guardian: "G7",
            descripcion: "Reintentos de llamada agotados",
          },
        })
      }

      await stopFlowWithSemaphore(tenantId, leadId)
    }

    console.log(`[lead-flow] DIRECTO: notificación llamada enviada para lead ${leadId}`)
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

  // 2. Validar credenciales de WhatsApp
  try {
    await validateCredentials(tenantId, "whatsapp", ["phone_number_id", "access_token"])
  } catch (error) {
    console.error(`[lead-flow] WhatsApp credentials error for tenant ${tenantId}:`, error)
    await handleCredentialError(leadId, tenantId, lead.nombreLead, "whatsapp")
    return
  }

  // 3. Enviar WhatsApp: verificar si existe template UTILITY aprobado, si no enviar texto
  let mensajeEnviado = false
  let metodoEnvio = ""
  let useTemplate = false

  // Verificar si el template existe y es UTILITY + APPROVED
  try {
    const templateInfo = await getTemplateStructure(tenantId, "rol_contacto_primero")
    if (templateInfo.category === "UTILITY" && templateInfo.status === "APPROVED") {
      useTemplate = true
    } else {
      console.log(`[lead-flow] Template "rol_contacto_primero" es ${templateInfo.category}/${templateInfo.status}, usando texto`)
    }
  } catch {
    console.log(`[lead-flow] Template "rol_contacto_primero" no encontrado, usando texto`)
  }

  if (useTemplate) {
    // Enviar template con botones
    try {
      await sendTemplate(tenantId, lead.telefono!, "rol_contacto_primero", "es", {
        nombre: lead.nombreLead,
      })
      mensajeEnviado = true
      metodoEnvio = "template"
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      if (err.code === "INVALID_NUMBER") {
        await handleInvalidNumber(leadId, tenantId, lead)
        return
      }
      console.error(`[lead-flow] Template send error for lead ${leadId}:`, err.message)
      await handleCredentialError(leadId, tenantId, lead.nombreLead, "whatsapp")
      return
    }
  } else {
    // Enviar texto con opciones numéricas (fallback temporal)
    try {
      const textoOpciones = [
        `Hola ${lead.nombreLead}, gracias por tu interés. ¿Cómo te gustaría que te contactemos?`,
        "",
        "1️⃣ Llamar Ahora",
        "2️⃣ Agendar Cita",
        "3️⃣ Seguir en el Chat",
        "4️⃣ No Contactar",
        "",
        "Responde con el número de tu opción.",
      ].join("\n")

      await sendTextMessage(tenantId, lead.telefono!, textoOpciones)
      mensajeEnviado = true
      metodoEnvio = "texto_opciones"
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      if (err.code === "INVALID_NUMBER") {
        await handleInvalidNumber(leadId, tenantId, lead)
        return
      }
      console.error(`[lead-flow] WhatsApp text failed for lead ${leadId}:`, err.message)
      await handleCredentialError(leadId, tenantId, lead.nombreLead, "whatsapp")
      return
    }
  }

  if (!mensajeEnviado) return

  // 4. Actualizar estado a "En proceso"
  const estadoEnProceso = await prisma.catEstadoGestion.findFirst({
    where: { nombre: "En proceso" },
  })
  if (estadoEnProceso) {
    await prisma.leadTracking.update({
      where: { leadId },
      data: { idEstado: estadoEnProceso.id },
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
        descripcion: `WhatsApp (${metodoEnvio}) enviado a ${lead.telefono}`,
      },
    })
  }

  // Evento forense: rescate WhatsApp
  const tipoRescate = await prisma.catTipoEvento.findFirst({ where: { nombre: "Rescate WhatsApp" } })
  if (tipoRescate) {
    await prisma.leadEventHistory.create({
      data: { tenantId, leadId, idTipoEvento: tipoRescate.id, actorIntervencion: "IA", guardian: "G1", descripcion: `Rescate WhatsApp (${metodoEnvio}) enviado a ${lead.telefono}` },
    })
  }

  // 6. Crear segundo Cloud Task con tiempoLlamadaSeg
  const { tiempoLlamadaSeg } = await getCallSettings(tenantId)
  const taskId = `lead-${leadId}-timer2`
  const taskName = await createTask(
    taskId,
    `/internal/lead-timeout/${leadId}`,
    tiempoLlamadaSeg
  )

  await prisma.leadTracking.update({
    where: { leadId },
    data: { flowJobId: taskName },
  })

  console.log(`[lead-flow] WhatsApp sent, second timer created for lead ${leadId}`)
}

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

  // Verify flow is still active (last event = "WhatsApp" or "Rescate WhatsApp")
  const lastEvent = await getLastEvent(leadId, tenantId)
  const validEvents = ["WhatsApp", "Rescate WhatsApp"]
  if (!lastEvent || !validEvents.includes(lastEvent.tipoEvento?.nombre ?? "")) {
    console.log(`[lead-flow] Lead ${leadId} not waiting for button response (last=${lastEvent?.tipoEvento?.nombre}), skipping`)
    return
  }

  // Normalizar: Meta envía el texto del botón como ID en templates Quick Reply
  const normalizedId = buttonId.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_")

  switch (normalizedId) {
    case "llamar_ahora":
    case "1": // respuesta numérica (fallback texto)
      await handleLlamarAhora(leadId, tenantId, lead)
      break
    case "agendar_cita":
    case "2": // respuesta numérica (fallback texto)
      await handleAgendarCita(leadId, tenantId, lead)
      break
    case "seguir_en_el_chat":
    case "3": // respuesta numérica (fallback texto)
      await handleSeguirEnChat(leadId, tenantId, lead)
      break
    case "no_contestar":
    case "no_contactar":
    case "4": // respuesta numérica (fallback texto)
      await handleNoContactar(leadId, tenantId, lead)
      break
    default:
      console.log(`[lead-flow] Unknown button/text: "${buttonId}", ignoring`)
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

  // Evento forense: preferencia llamada (G1)
  const tipoPrefLlamada = await prisma.catTipoEvento.findFirst({ where: { nombre: "Preferencia llamada" } })
  if (tipoPrefLlamada) {
    await prisma.leadEventHistory.create({
      data: { tenantId, leadId, idTipoEvento: tipoPrefLlamada.id, actorIntervencion: "IA", guardian: "G1", descripcion: "Cliente eligió: Llamar Ahora" },
    })
  }

  // Evento forense: llamada rescate (G7)
  const tipoLlamadaRescateB = await prisma.catTipoEvento.findFirst({ where: { nombre: "Llamada rescate" } })
  if (tipoLlamadaRescateB) {
    await prisma.leadEventHistory.create({
      data: { tenantId, leadId, idTipoEvento: tipoLlamadaRescateB.id, actorIntervencion: "IA", guardian: "G7", descripcion: "Llamada VAPI solicitada por lead (rescate)" },
    })
  }

  // No llamar endFlow — el flujo queda abierto esperando el webhook de Vapi
  // con el resultado de la llamada (contestó / no contestó)
}

async function handleAgendarCita(
  leadId: string,
  tenantId: string,
  lead: { nombreLead: string; telefono: string | null }
): Promise<void> {
  // 1. Obtener URL de booking: preferir calcom, fallback a google_calendar
  let bookingUrl: string
  let bookingPlatform: "calcom" | "google_calendar"

  try {
    const calcomCreds = await validateCredentials(tenantId, "calcom", ["booking_url"])
    bookingUrl = calcomCreds.booking_url
    bookingPlatform = "calcom"
  } catch {
    try {
      const gcalCreds = await validateCredentials(tenantId, "google_calendar", ["calendar_url"])
      bookingUrl = gcalCreds.calendar_url
      bookingPlatform = "google_calendar"
    } catch (error) {
      console.error(`[lead-flow] No booking platform configured for tenant ${tenantId}:`, error)
      await handleCredentialError(leadId, tenantId, lead.nombreLead, "google_calendar")
      return
    }
  }

  // 2. Enviar link por WhatsApp
  try {
    await validateCredentials(tenantId, "whatsapp", ["phone_number_id", "access_token"])
    await sendTextMessage(
      tenantId,
      lead.telefono!,
      `¡Hola ${lead.nombreLead}! Agenda tu cita aquí: ${bookingUrl}`
    )
  } catch (error) {
    console.error(`[lead-flow] WhatsApp text error for lead ${leadId}:`, error)
    await handleCredentialError(leadId, tenantId, lead.nombreLead, "whatsapp")
    return
  }

  // 3. Registrar evento "Cita"
  const tipoCita = await prisma.catTipoEvento.findFirst({ where: { nombre: "Cita" } })
  if (tipoCita) {
    await prisma.leadEventHistory.create({
      data: {
        tenantId,
        leadId,
        idTipoEvento: tipoCita.id,
        actorIntervencion: "IA",
        descripcion: `Enlace de ${bookingPlatform === "calcom" ? "Cal.com" : "calendario"} enviado a ${lead.telefono}`,
      },
    })
  }

  // Evento forense: preferencia agendamiento
  const tipoPrefAgenda = await prisma.catTipoEvento.findFirst({ where: { nombre: "Preferencia agendamiento" } })
  if (tipoPrefAgenda) {
    await prisma.leadEventHistory.create({
      data: { tenantId, leadId, idTipoEvento: tipoPrefAgenda.id, actorIntervencion: "IA", guardian: "G1", descripcion: "Cliente eligió: Agendar Cita" },
    })
  }

  // 4. Crear registro de cita agendada
  // horaAgenda queda null — se actualiza cuando Cal.com envía el webhook de confirmación
  await prisma.citaAgendada.create({
    data: {
      tenantId,
      leadId,
      canal: "WhatsApp",
    },
  })

  console.log(`[lead-flow] CitaAgendada created for lead ${leadId} (platform: ${bookingPlatform})`)

  await endFlow(tenantId, leadId)
}

async function handleSeguirEnChat(
  leadId: string,
  tenantId: string,
  lead: { nombreLead: string; telefono: string | null }
): Promise<void> {
  // El lead quiere seguir por chat — notificar al owner para que un asesor tome el chat
  await sendEmailToOwner(
    tenantId,
    "Lead quiere seguir por chat",
    `<p>El lead <strong>${lead.nombreLead}</strong> (${lead.telefono}) eligió "Seguir en el Chat". Un asesor debe continuar la conversación por WhatsApp.</p>`
  )

  try {
    await sendTextMessage(
      tenantId,
      lead.telefono!,
      `¡Perfecto ${lead.nombreLead}! Un asesor continuará la conversación por este medio. Gracias por tu paciencia.`
    )
  } catch (error) {
    console.error(`[lead-flow] Error sending chat confirmation to lead ${leadId}:`, error)
  }

  const tipoWhatsApp = await prisma.catTipoEvento.findFirst({ where: { nombre: "WhatsApp" } })
  if (tipoWhatsApp) {
    await prisma.leadEventHistory.create({
      data: {
        tenantId,
        leadId,
        idTipoEvento: tipoWhatsApp.id,
        actorIntervencion: "IA",
        descripcion: "Seguir en el Chat — asesor notificado",
      },
    })
  }

  // Evento forense: preferencia chat
  const tipoPrefChat = await prisma.catTipoEvento.findFirst({ where: { nombre: "Preferencia chat" } })
  if (tipoPrefChat) {
    await prisma.leadEventHistory.create({
      data: { tenantId, leadId, idTipoEvento: tipoPrefChat.id, actorIntervencion: "IA", guardian: "G1", descripcion: "Cliente eligió: Seguir en el Chat" },
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

  // Evento forense: opt-out
  const tipoOptOut = await prisma.catTipoEvento.findFirst({ where: { nombre: "Opt-out" } })
  if (tipoOptOut) {
    await prisma.leadEventHistory.create({
      data: { tenantId, leadId, idTipoEvento: tipoOptOut.id, actorIntervencion: "IA", guardian: "G1", descripcion: "Cliente solicitó no ser contactado" },
    })
  }

  const estadoFrio = await prisma.catEstadoGestion.findFirst({ where: { nombre: "Frío" } })
  if (estadoFrio) {
    await prisma.leadTracking.update({
      where: { leadId },
      data: { idEstado: estadoFrio.id },
    })
  }

  await endFlow(tenantId, leadId)
}

async function handleInvalidNumber(
  leadId: string,
  tenantId: string,
  lead: { nombreLead: string; telefono: string | null }
): Promise<void> {
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

export async function endFlow(tenantId: string, leadId: string): Promise<void> {
  const lead = await prisma.leadTracking.findUnique({
    where: { leadId },
    select: { flowJobId: true, semaphoreYellowTaskId: true, semaphoreRedTaskId: true },
  })

  if (lead?.flowJobId) {
    await cancelTask(lead.flowJobId)
  }

  if (lead?.semaphoreYellowTaskId) {
    try {
      await cancelTask(lead.semaphoreYellowTaskId)
    } catch (error) {
      console.error(`[lead-flow] Error cancelling yellow semaphore task for lead ${leadId}:`, error)
    }
  }

  if (lead?.semaphoreRedTaskId) {
    try {
      await cancelTask(lead.semaphoreRedTaskId)
    } catch (error) {
      console.error(`[lead-flow] Error cancelling red semaphore task for lead ${leadId}:`, error)
    }
  }

  await prisma.leadTracking.update({
    where: { leadId },
    data: {
      flowJobId: null,
      semaphoreYellowTaskId: null,
      semaphoreRedTaskId: null,
    },
  })

  console.log(`[lead-flow] Flow ended for lead ${leadId}`)
}

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
          guardian: "G7",
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
        guardian: "G7",
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
          guardian: "G7",
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
  const taskId = `lead-${leadId}-retry-${remaining}`
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
        guardian: "G7",
        descripcion: `Reintento programado en ${callRetryDays} dias (${remaining} restantes)`,
      },
    })
  }

  console.log(`[lead-flow] Retry scheduled for lead ${leadId} in ${callRetryDays} days (${remaining} remaining)`)
}

export async function handleCallRetry(leadId: string, tenantId: string): Promise<void> {
  const lead = await prisma.leadTracking.findUnique({
    where: { leadId },
    select: { telefono: true, nombreLead: true },
  })

  if (!lead || !lead.telefono) {
    console.error(`[lead-flow] Cannot retry call for lead ${leadId}: no phone number`)
    return
  }

  const tipoProceso = await getTipoProceso(tenantId)

  if (tipoProceso === "directo") {
    await notifyVendedor(tenantId, leadId, "Recordatorio: reintentar llamada al lead")

    const tipoLlamada = await prisma.catTipoEvento.findFirst({ where: { nombre: "Llamada" } })
    if (tipoLlamada) {
      await prisma.leadEventHistory.create({
        data: {
          tenantId,
          leadId,
          idTipoEvento: tipoLlamada.id,
          actorIntervencion: "Vendedor",
          guardian: "G7",
          descripcion: `Notificación reintento de llamada a ${lead.telefono}`,
        },
      })
    }

    console.log(`[lead-flow] DIRECTO: retry notification sent for lead ${leadId}`)
    return
  }

  // Modo automatizado: lógica existente
  try {
    await validateCredentials(tenantId, "vapi", ["assistant_id", "auth_token"])
  } catch (error) {
    console.error(`[lead-flow] VAPI credentials error for tenant ${tenantId}:`, error)
    await handleCredentialError(leadId, tenantId, lead.nombreLead, "vapi")
    return
  }

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
        guardian: "G7",
        descripcion: `Reintento de llamada VAPI a ${lead.telefono}`,
      },
    })
  }

  console.log(`[lead-flow] Retry call made for lead ${leadId} to ${lead.telefono}`)
}
