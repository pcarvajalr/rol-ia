import { Hono } from "hono"
import { createTenantClient } from "../db/client"
import type { AuthUser } from "../middleware/auth"
import type { TenantUser } from "../middleware/tenant"

type Variables = {
  authUser: AuthUser
  user: TenantUser
  tenantId: string
}

const intel = new Hono<{ Variables: Variables }>()

// GET /intel/kpi
intel.get("/kpi", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ capitalAtRisk: 0, humanResponseTimeMin: 0, roliaResponseTimeMin: 0 })

  const db = createTenantClient(tenantId)
  const now = new Date()
  const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  // capitalAtRisk = sum gastoIntervalo last 24h where convIntervalo=0
  const zeroConv = await db.metricsAdPerformance.findMany({
    where: { timestamp: { gte: h24ago }, convIntervalo: 0 },
  })
  const capitalAtRisk = zeroConv.reduce((sum, r) => sum + r.gastoIntervalo, 0)

  // Response times: avg diff between lead creation and first event by actor type
  const leads = await db.leadTracking.findMany({
    include: { eventos: { orderBy: { timestamp: "asc" } } },
  })

  let humanTotal = 0, humanCount = 0
  let iaTotal = 0, iaCount = 0

  for (const lead of leads) {
    const humanEvt = lead.eventos.find((e) => e.actorIntervencion === "HUMANO")
    const iaEvt = lead.eventos.find((e) => e.actorIntervencion === "IA")

    if (humanEvt) {
      humanTotal += humanEvt.timestamp.getTime() - lead.fechaCreacion.getTime()
      humanCount++
    }
    if (iaEvt) {
      iaTotal += iaEvt.timestamp.getTime() - lead.fechaCreacion.getTime()
      iaCount++
    }
  }

  const humanResponseTimeMin = humanCount > 0 ? Math.round(humanTotal / humanCount / 60000) : 0
  const roliaResponseTimeMin = iaCount > 0 ? parseFloat((iaTotal / iaCount / 60000).toFixed(2)) : 0

  return c.json({ capitalAtRisk: Math.round(capitalAtRisk), humanResponseTimeMin, roliaResponseTimeMin })
})

// GET /intel/cpa-realtime
intel.get("/cpa-realtime", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ points: [] })

  const db = createTenantClient(tenantId)
  const now = new Date()
  const h5ago = new Date(now.getTime() - 5 * 60 * 60 * 1000)

  const records = await db.metricsAdPerformance.findMany({
    where: { timestamp: { gte: h5ago } },
    orderBy: { timestamp: "asc" },
  })

  // Group by 10-min interval and pivot by source
  const buckets = new Map<string, { metaSpend: number; googleSpend: number; metaConv: number; googleConv: number }>()

  for (const r of records) {
    const d = r.timestamp
    const m = Math.floor(d.getMinutes() / 10) * 10
    const key = `${String(d.getHours()).padStart(2, "0")}:${String(m).padStart(2, "0")}`

    if (!buckets.has(key)) {
      buckets.set(key, { metaSpend: 0, googleSpend: 0, metaConv: 0, googleConv: 0 })
    }
    const b = buckets.get(key)!
    if (r.fuenteId === "Meta") {
      b.metaSpend += r.gastoIntervalo
      b.metaConv += r.convIntervalo
    } else {
      b.googleSpend += r.gastoIntervalo
      b.googleConv += r.convIntervalo
    }
  }

  const points = Array.from(buckets.entries()).map(([time, v]) => ({
    time,
    metaSpend: Math.round(v.metaSpend),
    googleSpend: Math.round(v.googleSpend),
    metaConv: Math.round(v.metaConv),
    googleConv: Math.round(v.googleConv),
  }))

  return c.json({ points })
})

// GET /intel/abandonment
intel.get("/abandonment", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ leads: [], thresholds: { tiempoVerdeMins: 5, tiempoAmarilloMins: 5 } })

  const db = createTenantClient(tenantId)
  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  // Load tenant guardian settings for thresholds
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  })
  const settings = tenant?.settings as Record<string, unknown> | null
  const guardian = settings?.guardian as Record<string, unknown> | null
  const tiempoVerdeMins = (guardian?.tiempoVerdeMins as number) || 5
  const tiempoAmarilloMins = (guardian?.tiempoAmarilloMins as number) || 5

  // Exclude terminal states from semaphore
  const excludedStates = await db.catEstadoGestion.findMany({
    where: { nombre: { in: ["Cerrado", "Perdido", "Eliminado"] } },
    select: { id: true },
  })
  const excludedIds = excludedStates.map((e) => e.id)

  const stateFilter = excludedIds.length > 0
    ? { OR: [{ idEstado: null }, { idEstado: { notIn: excludedIds } }] }
    : {}

  // Active in semaphore: semaphoreTimeMs is null (not yet stopped by CRM)
  const activeLeads = await db.leadTracking.findMany({
    where: { tenantId, semaphoreTimeMs: null, ...stateFilter },
    include: { estado: { select: { nombre: true } } },
    orderBy: { fechaCreacion: "desc" },
    take: 10,
  })

  // Completed in semaphore: semaphoreTimeMs set (stopped by CRM), last 24h
  const completedLeads = await db.leadTracking.findMany({
    where: {
      tenantId,
      semaphoreTimeMs: { not: null },
      fechaCreacion: { gte: twentyFourHoursAgo },
      ...stateFilter,
    },
    include: { estado: { select: { nombre: true } } },
    orderBy: { fechaCreacion: "desc" },
    take: 6,
  })

  const mapLead = (l: typeof activeLeads[0], isActive: boolean) => ({
    id: l.leadId,
    name: l.nombreLead,
    source: l.fuente,
    waitMs: isActive ? now.getTime() - l.fechaCreacion.getTime() : 0,
    isFlowActive: isActive,
    semaphoreTimeMs: l.semaphoreTimeMs ? Number(l.semaphoreTimeMs) : null,
    semaphoreColor: l.semaphoreColor,
    crmStatusInicial: l.crmStatusInicial,
    estadoGestion: l.estado?.nombre ?? null,
  })

  const leads = [
    ...activeLeads.map((l) => mapLead(l, true)),
    ...completedLeads.map((l) => mapLead(l, false)),
  ]

  return c.json({
    thresholds: { tiempoVerdeMins, tiempoAmarilloMins },
    leads,
  })
})

// GET /intel/optimizer
intel.get("/optimizer", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ ads: [] })

  const db = createTenantClient(tenantId)

  const adDetails = await db.adPerformanceDetail.findMany({
    include: { budgetRecs: { orderBy: { fechaCalculo: "desc" }, take: 1 } },
  })

  const ads = adDetails.map((ad) => {
    const rec = ad.budgetRecs[0]
    return {
      name: ad.nombreCreativo,
      cpl: ad.cplActual,
      trend: ad.trend,
      status: ad.estadoIa,
      budget: ad.presupuestoActual,
      suggestedBudget: rec?.presupuestoSugerido ?? ad.presupuestoActual,
    }
  })

  return c.json({ ads })
})

// GET /intel/scheduling
intel.get("/scheduling", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ appointments: [] })

  const db = createTenantClient(tenantId)
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)

  const citas = await db.citaAgendada.findMany({
    where: {
      OR: [
        // Confirmadas/canceladas: citas de hoy en adelante
        {
          estado: { in: ["confirmada", "cancelada"] },
          horaAgenda: { gte: startOfDay },
        },
        // Pendientes: creadas hoy
        {
          estado: "pendiente",
          creadoEn: { gte: startOfDay },
        },
      ],
    },
    include: { lead: true },
    orderBy: [
      { horaAgenda: { sort: "asc", nulls: "last" } },
      { creadoEn: "asc" },
    ],
  })

  const tz = "America/Bogota"

  const appointments = citas.map((cita) => {
    let time = "--:--"
    if (cita.horaAgenda) {
      time = cita.horaAgenda.toLocaleTimeString("es-CO", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz,
      })
    }

    let date = ""
    if (cita.horaAgenda) {
      date = cita.horaAgenda.toLocaleDateString("es-CO", {
        weekday: "short", day: "numeric", month: "short", timeZone: tz,
      })
    }

    return {
      id: cita.idCita,
      lead: cita.lead.nombreLead,
      time,
      date,
      channel: cita.canal.toLowerCase().includes("whatsapp") ? "whatsapp" : "voz",
      status: cita.estado,
      notes: cita.notas || "",
      agent: "Rol G7",
    }
  })

  return c.json({ appointments })
})

// GET /intel/leak-diagnosis
intel.get("/leak-diagnosis", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ reasons: [] })

  const db = createTenantClient(tenantId)

  const records = await db.iaFugaDiagnostico.findMany()

  const reasons = records.map((r) => ({
    name: r.categoriaFuga,
    frequency: r.frecuenciaPorcentaje,
    impact: r.impactoNegocio,
    size: r.volumenLeads,
    color: r.colorHex,
  }))

  return c.json({ reasons })
})

// GET /intel/copywriter
intel.get("/copywriter", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ hooks: [], designBrief: [] })

  const db = createTenantClient(tenantId)

  const records = await db.iaContentHook.findMany({
    orderBy: { scoreProbabilidad: "desc" },
    take: 5,
  })

  const hooks = records.map((r, i) => {
    let sentiment: string
    if (r.scoreProbabilidad > 80) sentiment = "positive"
    else if (r.scoreProbabilidad > 60) sentiment = "neutral"
    else sentiment = "negative"

    return {
      id: i + 1,
      hook: r.contenido,
      angle: r.categoria,
      sentiment,
      score: r.scoreProbabilidad,
    }
  })

  // Design brief from first record's briefVisual or default
  const firstBrief = records[0]?.briefVisual as Record<string, string>[] | null
  const designBrief = firstBrief ?? [
    { label: "Tono visual", value: "Urgente, limpio, profesional" },
    { label: "Paleta sugerida", value: "Oscuro + acento violeta + rojo CTA" },
    { label: "Formato", value: "Video corto 15s o Carrusel 3 slides" },
    { label: "CTA principal", value: "Agenda tu demo en 30 segundos" },
  ]

  return c.json({ hooks, designBrief })
})

// GET /intel/roas-trend
intel.get("/roas-trend", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ points: [] })

  const db = createTenantClient(tenantId)
  const now = new Date()
  const d7ago = new Date(now)
  d7ago.setDate(d7ago.getDate() - 7)
  d7ago.setHours(0, 0, 0, 0)

  const records = await db.metricsRoasHistory.findMany({
    where: { fecha: { gte: d7ago } },
    orderBy: { fecha: "asc" },
  })

  const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"]

  // Group by date and pivot by source
  const buckets = new Map<string, { meta: number; google: number; threshold: number; date: Date }>()

  for (const r of records) {
    const key = r.fecha.toISOString().slice(0, 10)
    if (!buckets.has(key)) {
      buckets.set(key, { meta: 0, google: 0, threshold: r.umbralCorte, date: r.fecha })
    }
    const b = buckets.get(key)!
    if (r.fuente === "Meta") b.meta = r.roasDiario
    else b.google = r.roasDiario
    b.threshold = Math.min(b.threshold, r.umbralCorte)
  }

  const points = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      day: dayNames[v.date.getDay()],
      meta: v.meta,
      google: v.google,
      threshold: 1.5,
    }))

  return c.json({ points })
})

// GET /intel/goal-predictor
intel.get("/goal-predictor", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ monthlyGoal: 0, points: [] })

  const db = createTenantClient(tenantId)

  // Current month
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const records = await db.ventasProyeccion.findMany({
    where: { fecha: { gte: startOfMonth, lte: endOfMonth } },
    orderBy: { fecha: "asc" },
  })

  if (records.length === 0) {
    return c.json({ monthlyGoal: 0, points: [] })
  }

  const monthlyGoal = records[0].metaMensual

  // Build running total of actual sales
  let runningTotal = 0
  const actuals: { idx: number; day: string; actual: number }[] = []

  for (const r of records) {
    runningTotal += r.ventasReales
    const dayNum = r.fecha.getDate()
    actuals.push({ idx: actuals.length, day: `Dia ${dayNum}`, actual: runningTotal })
  }

  // Linear regression for forecast
  const n = actuals.length
  if (n < 2) {
    const points = actuals.map((a) => ({ day: a.day, actual: a.actual }))
    return c.json({ monthlyGoal, points })
  }

  const xMean = (n - 1) / 2
  const yMean = actuals.reduce((s, a) => s + a.actual, 0) / n
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (actuals[i].actual - yMean)
    den += (i - xMean) * (i - xMean)
  }
  const slope = den !== 0 ? num / den : 0
  const intercept = yMean - slope * xMean

  const points: { day: string; actual?: number; forecast?: number }[] = actuals.map((a) => ({
    day: a.day,
    actual: a.actual,
  }))

  // Bridge point
  points[points.length - 1].forecast = actuals[actuals.length - 1].actual

  // Forecast remaining days
  const lastDay = records[records.length - 1].fecha.getDate()
  const daysInMonth = endOfMonth.getDate()
  const forecastDays = [lastDay + 3, lastDay + 6, daysInMonth].filter((d) => d <= daysInMonth)

  for (const dayNum of forecastDays) {
    const idx = n + (dayNum - lastDay) / 3
    const predicted = Math.round(intercept + slope * idx)
    points.push({ day: `Dia ${dayNum}`, forecast: Math.max(0, predicted) })
  }

  return c.json({ monthlyGoal, points })
})

// GET /intel/roas-guardian
intel.get("/roas-guardian", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ points: [], belowThreshold: false })

  const db = createTenantClient(tenantId)
  const now = new Date()
  const d7ago = new Date(now)
  d7ago.setDate(d7ago.getDate() - 7)
  d7ago.setHours(0, 0, 0, 0)

  const records = await db.metricsRoasHistory.findMany({
    where: { fecha: { gte: d7ago } },
    orderBy: { fecha: "asc" },
  })

  const dayNames = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"]

  // Average ROAS per day (across sources)
  const buckets = new Map<string, { total: number; count: number; threshold: number; date: Date }>()

  for (const r of records) {
    const key = r.fecha.toISOString().slice(0, 10)
    if (!buckets.has(key)) {
      buckets.set(key, { total: 0, count: 0, threshold: r.umbralCorte, date: r.fecha })
    }
    const b = buckets.get(key)!
    b.total += r.roasDiario
    b.count++
    b.threshold = Math.min(b.threshold, r.umbralCorte)
  }

  const points = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      day: dayNames[v.date.getDay()],
      roas: parseFloat((v.total / v.count).toFixed(2)),
    }))

  const threshold = records.length > 0 ? records[0].umbralCorte : 1.5
  const lastRoas = points.length > 0 ? points[points.length - 1].roas : 0
  const belowThreshold = lastRoas < threshold

  return c.json({ points, threshold, belowThreshold })
})

// GET /intel/activity-feed
intel.get("/activity-feed", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ logs: [] })

  const db = createTenantClient(tenantId)

  const events = await db.leadEventHistory.findMany({
    orderBy: { timestamp: "asc" },
    take: 20,
    include: { lead: true },
  })

  const logs = events.map((e, i) => {
    const d = e.timestamp
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`

    let type: string
    const desc = e.descripcion ?? ""
    if (e.actorIntervencion === "IA") type = "whatsapp"
    else if (desc.toLowerCase().includes("llamada")) type = "vapi"
    else if (desc.toLowerCase().includes("cita") || desc.toLowerCase().includes("exito")) type = "success"
    else type = "webhook"

    return {
      id: i,
      time,
      message: `${e.lead.nombreLead}: ${e.descripcion}`,
      type,
    }
  })

  return c.json({ logs })
})

// GET /intel/rescue-history
intel.get("/rescue-history", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ items: [] })

  const db = createTenantClient(tenantId)

  const leads = await db.leadTracking.findMany({
    include: { eventos: { orderBy: { timestamp: "asc" } } },
    take: 5,
    orderBy: { fechaCreacion: "desc" },
  })

  const items = leads
    .filter((l) => l.eventos.length >= 2)
    .map((l) => {
      const humanEvt = l.eventos.find((e) => e.actorIntervencion === "HUMANO")
      const iaEvt = l.eventos.find((e) => e.actorIntervencion === "IA")

      const leadTime = l.fechaCreacion
      const humanDelay = humanEvt
        ? Math.round((humanEvt.timestamp.getTime() - leadTime.getTime()) / 60000)
        : null
      const iaDelay = iaEvt
        ? Math.round((iaEvt.timestamp.getTime() - leadTime.getTime()) / 60000)
        : null

      const h = leadTime.getHours()
      const m = leadTime.getMinutes()
      const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`

      return {
        time,
        human: humanDelay !== null ? `${humanDelay} min sin respuesta` : "Sin actividad",
        aura: iaEvt?.descripcion ?? "Sin intervencion IA",
      }
    })

  return c.json({ items })
})

export { intel as intelRoutes }
