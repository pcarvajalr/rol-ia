import { prisma } from "../db/client"
import { createTask, cancelTask } from "./task-scheduler"
import { queryContactStatus } from "../modules/clientify"
import { sendTemplate, sendTextMessage, getTemplateStructure } from "../modules/whatsapp"
import { makeOutboundCall } from "../modules/vapi"
import { sendEmailToOwner } from "../modules/email"
import { validateCredentials } from "../utils/encryption"

const GUARDIAN_DEFAULTS = {
  tiempoRespuestaLeadSeg: 15,
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

  console.log(`[lead-flow] Flow started for lead ${leadId}, timer: ${tiempoRespuesta}s`)
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

  if (lastEvent.tipoEvento?.nombre === "Lead ingreso") {
    await handleFirstTimeout(leadId, tenantId, lead)
  } else if (lastEvent.tipoEvento?.nombre === "WhatsApp") {
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

    // No detener semáforo — solo las acciones automáticas terminaron
    // El lead sigue activo en el semáforo hasta que el CRM cambie el status
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
        descripcion: `WhatsApp (${metodoEnvio}) enviado a ${lead.telefono}`,
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
  if (!lastEvent || lastEvent.tipoEvento?.nombre !== "WhatsApp") {
    console.log(`[lead-flow] Lead ${leadId} not waiting for button response, skipping`)
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

  await endFlow(tenantId, leadId)
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

  const estadoNuevo = await prisma.catEstadoGestion.findFirst({ where: { nombre: "Nuevo" } })
  if (estadoNuevo) {
    await prisma.leadTracking.update({
      where: { leadId },
      data: { idEstado: estadoNuevo.id },
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
