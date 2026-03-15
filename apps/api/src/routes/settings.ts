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

export { settingsRouter as settingsRoutes }
