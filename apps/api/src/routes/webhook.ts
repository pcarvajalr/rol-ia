import { Hono } from "hono"
import { prisma } from "../db/client"
import { validateCredentials } from "../utils/encryption"
import { parseClientifyPayload } from "../modules/clientify"
import { sendEmailToOwner } from "../modules/email"
import { startFlow, handleButtonResponse } from "../services/lead-flow"
import {
  parseWebhookPayload,
  findTenantByPhoneNumberId,
  validateWebhookSignature,
} from "../modules/whatsapp"

const webhookRouter = new Hono()

// POST /webhook/:plataforma/:idEmpresa
webhookRouter.post("/:plataforma/:idEmpresa", async (c) => {
  const { plataforma, idEmpresa } = c.req.param()

  // 1. Verificar tenant existe
  const tenant = await prisma.tenant.findUnique({
    where: { id: idEmpresa },
    select: { id: true, active: true },
  })

  if (!tenant || !tenant.active) {
    return c.json({ error: "Tenant no encontrado" }, 404)
  }

  // 2. Autenticar según plataforma
  if (plataforma === "clientify") {
    try {
      const credentials = await validateCredentials(idEmpresa, "clientify", ["api_token"])

      // Si viene header Authorization, validar token
      const authHeader = c.req.header("Authorization")
      if (authHeader?.startsWith("Token ")) {
        const token = authHeader.replace("Token ", "")
        if (credentials.api_token !== token) {
          return c.json({ error: "Token inválido" }, 401)
        }
      }
      // Si no viene header, se acepta (Clientify no soporta headers custom en webhooks)
      // La seguridad se basa en el tenantId (UUID) en la URL + integración activa
    } catch {
      return c.json({ error: "Integración no configurada" }, 401)
    }
  } else {
    return c.json({ error: `Plataforma "${plataforma}" no soportada` }, 400)
  }

  // 3. Procesar y responder
  const body = await c.req.json()
  console.log(`[webhook] Payload recibido de ${plataforma}:`, JSON.stringify(body))

  try {
    if (plataforma === "clientify") {
      await handleClientifyWebhook(idEmpresa, body)
    }
  } catch (error) {
    console.error(`[webhook] Error procesando ${plataforma} para tenant ${idEmpresa}:`, error)
  }

  return c.json({ ok: true })
})

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

  // Verificar idempotencia
  const existingLead = await prisma.leadTracking.findFirst({
    where: {
      tenantId,
      externalId: lead.externalId,
      fuente: lead.fuente,
    },
  })

  if (existingLead) {
    const lastEvent = await prisma.leadEventHistory.findFirst({
      where: { leadId: existingLead.leadId, tenantId },
      orderBy: { timestamp: "desc" },
      include: { tipoEvento: true },
    })

    const completedEvents = ["Llamada", "Cita", "Timeout"]
    const isCompleted =
      (lastEvent && lastEvent.tipoEvento && completedEvents.includes(lastEvent.tipoEvento.nombre)) ||
      lastEvent?.descripcion?.includes("No contactar")

    if (isCompleted) {
      console.log(`[webhook] Lead ${lead.externalId} ya completado, ignorando`)
    } else {
      console.log(`[webhook] Lead ${lead.externalId} con flujo activo, ignorando`)
    }
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
    },
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

  const parsed = parseWebhookPayload(body)

  if (!parsed) {
    return c.json({ ok: true })
  }

  // Identify tenant
  const tenantId = await findTenantByPhoneNumberId(parsed.phoneNumberId)

  if (!tenantId) {
    console.error(`[webhook] No tenant found for phone_number_id: ${parsed.phoneNumberId}`)
    return c.json({ ok: true })
  }

  // Validate signature (mandatory — Meta always sends X-Hub-Signature-256)
  const signature = c.req.header("X-Hub-Signature-256")
  if (!signature) {
    console.error(`[webhook] Missing X-Hub-Signature-256 for tenant ${tenantId}`)
    return c.json({ error: "Signature required" }, 403)
  }

  try {
    const credentials = await validateCredentials(tenantId, "whatsapp", ["app_secret"])
    if (!validateWebhookSignature(rawBody, signature, credentials.app_secret)) {
      console.error(`[webhook] Invalid Meta signature for tenant ${tenantId}`)
      return c.json({ error: "Invalid signature" }, 403)
    }
  } catch (error) {
    console.error(`[webhook] Cannot validate signature for tenant ${tenantId}:`, error)
    return c.json({ error: "Signature validation failed" }, 500)
  }

  // Process button responses
  if (parsed.type === "button_reply" && parsed.buttonId) {
    try {
      // Find lead by phone number (normalize: Meta sends without +, DB may have +)
      const phoneVariants = [parsed.from, `+${parsed.from}`]
      const lead = await prisma.leadTracking.findFirst({
        where: {
          tenantId,
          telefono: { in: phoneVariants },
        },
      })

      if (!lead) {
        console.error(`[webhook] No lead found for phone ${parsed.from} in tenant ${tenantId}`)
      } else {
        await handleButtonResponse(tenantId, lead.leadId, parsed.buttonId!)
      }
    } catch (error) {
      console.error("[webhook] Error processing Meta callback:", error)
    }
  }

  return c.json({ ok: true })
})

export { webhookRouter }
