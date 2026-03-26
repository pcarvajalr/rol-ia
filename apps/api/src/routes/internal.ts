import { Hono } from "hono"
import { prisma } from "../db/client"
import { getLastEvent, handleTimeout, endFlow } from "../services/lead-flow"
import { sendTextMessage } from "../modules/whatsapp"

const internalRouter = new Hono()

// POST /internal/lead-timeout/:leadId
internalRouter.post("/lead-timeout/:leadId", async (c) => {
  const { leadId } = c.req.param()

  // Validar que viene de Cloud Tasks en producción
  const taskHeader = c.req.header("X-CloudTasks-TaskName")
  if (process.env.NODE_ENV === "production" && !taskHeader) {
    return c.json({ error: "Unauthorized" }, 403)
  }

  const lead = await prisma.leadTracking.findUnique({
    where: { leadId },
    select: { leadId: true, tenantId: true, telefono: true, nombreLead: true, flowJobId: true },
  })

  if (!lead) {
    return c.json({ error: "Lead no encontrado" }, 404)
  }

  const lastEvent = await getLastEvent(leadId, lead.tenantId)

  if (!lastEvent) {
    console.error(`[internal] No events found for lead ${leadId}`)
    return c.json({ error: "No events" }, 400)
  }

  const completedEvents = ["Llamada", "Cita", "Timeout"]
  const isCompleted =
    (lastEvent.tipoEvento && completedEvents.includes(lastEvent.tipoEvento.nombre)) ||
    lastEvent.descripcion?.includes("No contactar")

  if (isCompleted) {
    console.log(`[internal] Lead ${leadId} already completed, skipping timeout`)
    return c.json({ ok: true, skipped: true })
  }

  await handleTimeout(leadId, lead.tenantId)

  return c.json({ ok: true })
})

// POST /internal/lead-cleanup
internalRouter.post("/lead-cleanup", async (c) => {
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000)

  const activeLeads = await prisma.leadTracking.findMany({
    where: {
      flowJobId: { not: null },
    },
    select: { leadId: true, tenantId: true, flowJobId: true, nombreLead: true },
  })

  const tipoTimeout = await prisma.catTipoEvento.findFirst({
    where: { nombre: "Timeout" },
  })

  if (!tipoTimeout) {
    console.error("[internal] Tipo evento 'Timeout' no encontrado")
    return c.json({ error: "Timeout event type not found" }, 500)
  }

  let cleaned = 0

  for (const lead of activeLeads) {
    const lastEvent = await getLastEvent(lead.leadId, lead.tenantId)

    if (lastEvent && lastEvent.timestamp < twelveHoursAgo) {
      await prisma.leadEventHistory.create({
        data: {
          tenantId: lead.tenantId,
          leadId: lead.leadId,
          idTipoEvento: tipoTimeout.id,
          actorIntervencion: "IA",
          descripcion: "Timeout - flujo expirado",
        },
      })

      await endFlow(lead.tenantId, lead.leadId)
      cleaned++
      console.log(`[internal] Lead ${lead.leadId} (${lead.nombreLead}) marked as timeout`)
    }
  }

  console.log(`[internal] Cleanup completed: ${cleaned} leads marked as timeout`)
  return c.json({ ok: true, cleaned })
})

// POST /internal/cita-reminder/:citaId
internalRouter.post("/cita-reminder/:citaId", async (c) => {
  const { citaId } = c.req.param()

  const taskHeader = c.req.header("X-CloudTasks-TaskName")
  if (process.env.NODE_ENV === "production" && !taskHeader) {
    return c.json({ error: "Unauthorized" }, 403)
  }

  const cita = await prisma.citaAgendada.findUnique({
    where: { idCita: citaId },
    include: { lead: true },
  })

  if (!cita) {
    return c.json({ error: "Cita no encontrada" }, 404)
  }

  if (cita.estado === "cancelada") {
    console.log(`[internal] Cita ${citaId} cancelada, recordatorio omitido`)
    return c.json({ ok: true, skipped: true })
  }

  if (!cita.lead.telefono) {
    console.log(`[internal] Lead ${cita.leadId} sin teléfono, recordatorio omitido`)
    return c.json({ ok: true, skipped: true })
  }

  try {
    const timeStr = cita.horaAgenda
      ? cita.horaAgenda.toLocaleTimeString("es-CO", {
          hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "America/Bogota",
        })
      : "pronto"

    await sendTextMessage(
      cita.tenantId,
      cita.lead.telefono,
      `Recordatorio: ${cita.lead.nombreLead}, tu cita es en 30 minutos (${timeStr}). Te esperamos.`
    )
    console.log(`[internal] Recordatorio enviado para cita ${citaId}`)
  } catch (error) {
    console.error(`[internal] Error enviando recordatorio para cita ${citaId}:`, error)
    return c.json({ error: "Failed to send reminder" }, 500)
  }

  return c.json({ ok: true })
})

export { internalRouter }
