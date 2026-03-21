import { Hono } from "hono"
import { prisma } from "../db/client"
import type { AuthUser } from "../middleware/auth"
import type { TenantUser } from "../middleware/tenant"

const settingsRouter = new Hono<{
  Variables: {
    authUser: AuthUser
    user: TenantUser
    tenantId: string
  }
}>()

const GUARDIAN_DEFAULTS = {
  slaMinutes: 7,
  criticalState: "cold-lead",
  doubleTouchMinutes: 2,
  tiempoRespuestaLeadSeg: 15,
  tiempoVerdeMins: 5,
  tiempoAmarilloMins: 5,
}

// GET /settings/guardian - Returns guardian settings (or defaults)
settingsRouter.get("/guardian", async (c) => {
  const tenantId = c.get("tenantId")

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    })

    const settings = (tenant?.settings as Record<string, unknown>) ?? {}
    const guardian = (settings.guardian as Record<string, unknown>) ?? {}

    return c.json({
      ...GUARDIAN_DEFAULTS,
      ...guardian,
    })
  } catch (error) {
    console.error("Error fetching guardian settings:", error)
    return c.json({ error: "Error al obtener configuración del guardian" }, 500)
  }
})

// PUT /settings/guardian - Updates guardian settings
settingsRouter.put("/guardian", async (c) => {
  const tenantId = c.get("tenantId")

  try {
    const body = await c.req.json()

    // Validate tiempoRespuestaLeadSeg
    if (body.tiempoRespuestaLeadSeg !== undefined) {
      const val = Number(body.tiempoRespuestaLeadSeg)
      if (isNaN(val) || val < 15 || val > 300) {
        return c.json({ error: "tiempoRespuestaLeadSeg debe estar entre 15 y 300 segundos" }, 400)
      }
    }

    // Validate slaMinutes
    if (body.slaMinutes !== undefined) {
      const val = Number(body.slaMinutes)
      if (isNaN(val) || val < 1 || val > 30) {
        return c.json({ error: "slaMinutes debe estar entre 1 y 30" }, 400)
      }
    }

    // Validate doubleTouchMinutes
    if (body.doubleTouchMinutes !== undefined) {
      const val = Number(body.doubleTouchMinutes)
      if (isNaN(val) || val < 1 || val > 10) {
        return c.json({ error: "doubleTouchMinutes debe estar entre 1 y 10" }, 400)
      }
    }

    if (body.tiempoVerdeMins !== undefined) {
      const val = Number(body.tiempoVerdeMins)
      if (!Number.isInteger(val) || val < 1 || val > 30) {
        return c.json({ error: "tiempoVerdeMins debe ser entero entre 1 y 30" }, 400)
      }
    }

    if (body.tiempoAmarilloMins !== undefined) {
      const val = Number(body.tiempoAmarilloMins)
      if (!Number.isInteger(val) || val < 1 || val > 30) {
        return c.json({ error: "tiempoAmarilloMins debe ser entero entre 1 y 30" }, 400)
      }
    }

    // Get current settings to merge
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    })

    const currentSettings = (tenant?.settings as Record<string, unknown>) ?? {}
    const currentGuardian = (currentSettings.guardian as Record<string, unknown>) ?? {}

    // Only pick known guardian keys from body
    const guardianUpdate: Record<string, unknown> = { ...currentGuardian }
    if (body.slaMinutes !== undefined) guardianUpdate.slaMinutes = Number(body.slaMinutes)
    if (body.criticalState !== undefined) guardianUpdate.criticalState = body.criticalState
    if (body.doubleTouchMinutes !== undefined) guardianUpdate.doubleTouchMinutes = Number(body.doubleTouchMinutes)
    if (body.tiempoRespuestaLeadSeg !== undefined) guardianUpdate.tiempoRespuestaLeadSeg = Number(body.tiempoRespuestaLeadSeg)
    if (body.tiempoVerdeMins !== undefined) guardianUpdate.tiempoVerdeMins = Number(body.tiempoVerdeMins)
    if (body.tiempoAmarilloMins !== undefined) guardianUpdate.tiempoAmarilloMins = Number(body.tiempoAmarilloMins)

    // Merge with existing settings (preserve other keys)
    const updatedSettings = {
      ...currentSettings,
      guardian: guardianUpdate as Record<string, string | number | boolean>,
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: updatedSettings as Record<string, unknown> as any },
    })

    return c.json({
      ...GUARDIAN_DEFAULTS,
      ...guardianUpdate,
    })
  } catch (error) {
    console.error("Error updating guardian settings:", error)
    return c.json({ error: "Error al actualizar configuración del guardian" }, 500)
  }
})

// GET /settings/estados-gestion - Returns all management states (catalog)
settingsRouter.get("/estados-gestion", async (c) => {
  const estados = await prisma.catEstadoGestion.findMany({
    orderBy: { id: "asc" },
  })
  return c.json({ estados })
})

// GET /settings/crm-mapping - Returns CRM state mappings for the tenant
settingsRouter.get("/crm-mapping", async (c) => {
  const tenantId = c.get("tenantId")
  const mappings = await prisma.crmStateMapping.findMany({
    where: { tenantId },
    include: { estadoGestion: { select: { id: true, nombre: true } } },
    orderBy: { id: "asc" },
  })
  return c.json({ mappings })
})

// POST /settings/crm-mapping - Creates a new CRM state mapping
settingsRouter.post("/crm-mapping", async (c) => {
  const tenantId = c.get("tenantId")
  const body = await c.req.json()

  const { platformSlug, crmStatus, catEstadoGestionId } = body
  if (!platformSlug || !crmStatus || !catEstadoGestionId) {
    return c.json({ error: "platformSlug, crmStatus y catEstadoGestionId son requeridos" }, 400)
  }

  const normalizedStatus = String(crmStatus).toLowerCase().trim()
  if (!normalizedStatus) {
    return c.json({ error: "crmStatus no puede estar vacio" }, 400)
  }

  const estado = await prisma.catEstadoGestion.findUnique({
    where: { id: Number(catEstadoGestionId) },
  })
  if (!estado) {
    return c.json({ error: "Estado de gestion no encontrado" }, 404)
  }

  const existing = await prisma.crmStateMapping.findFirst({
    where: { tenantId, platformSlug, crmStatus: normalizedStatus },
  })
  if (existing) {
    return c.json({ error: `El estado CRM "${crmStatus}" ya esta mapeado para ${platformSlug}` }, 409)
  }

  const mapping = await prisma.crmStateMapping.create({
    data: {
      tenantId,
      platformSlug,
      crmStatus: normalizedStatus,
      catEstadoGestionId: Number(catEstadoGestionId),
    },
    include: { estadoGestion: { select: { id: true, nombre: true } } },
  })

  return c.json({ mapping }, 201)
})

// DELETE /settings/crm-mapping/:id - Deletes a CRM state mapping
settingsRouter.delete("/crm-mapping/:id", async (c) => {
  const tenantId = c.get("tenantId")
  const id = Number(c.req.param("id"))

  const mapping = await prisma.crmStateMapping.findFirst({
    where: { id, tenantId },
  })
  if (!mapping) {
    return c.json({ error: "Mapeo no encontrado" }, 404)
  }

  await prisma.crmStateMapping.delete({ where: { id } })
  return c.json({ ok: true })
})

// GET /settings/webhook-log - Returns paginated webhook request logs
settingsRouter.get("/webhook-log", async (c) => {
  const tenantId = c.get("tenantId")
  const page = Math.max(1, Number(c.req.query("page")) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize")) || 20))
  const source = c.req.query("source")

  const where: { tenantId: string; source?: string } = { tenantId }
  if (source) where.source = source

  const [logs, total] = await Promise.all([
    prisma.webhookRequestLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        source: true,
        externalId: true,
        crmStatus: true,
        leadId: true,
        action: true,
        timestamp: true,
      },
    }),
    prisma.webhookRequestLog.count({ where }),
  ])

  return c.json({
    logs,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  })
})

export { settingsRouter as settingsRoutes }
