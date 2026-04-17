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

  // Load CRM state mappings for this tenant (to show CRM label instead of internal name)
  const crmMappings = await db.crmStateMapping.findMany({
    where: { tenantId },
    select: { catEstadoGestionId: true, crmStatus: true },
  })
  // Map: internal estado id → CRM status label
  const estadoToCrm = new Map<number, string>()
  for (const m of crmMappings) {
    // If multiple CRM statuses map to the same estado, keep the first one
    if (!estadoToCrm.has(m.catEstadoGestionId)) {
      estadoToCrm.set(m.catEstadoGestionId, m.crmStatus)
    }
  }

  // Active in semaphore: semaphoreTimeMs is null (not yet stopped by CRM)
  const activeLeads = await db.leadTracking.findMany({
    where: { tenantId, semaphoreTimeMs: null, ...stateFilter },
    include: { estado: { select: { id: true, nombre: true } } },
    orderBy: { fechaCreacion: "desc" },
  })

  // Completed in semaphore: semaphoreTimeMs set (stopped by CRM)
  const completedLeads = await db.leadTracking.findMany({
    where: {
      tenantId,
      semaphoreTimeMs: { not: null },
      ...stateFilter,
    },
    include: { estado: { select: { id: true, nombre: true } } },
    orderBy: { fechaCreacion: "desc" },
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
    crmStatusMapped: l.estado?.id ? (estadoToCrm.get(l.estado.id) ?? null) : null,
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
  if (!tenantId) return c.json({ lossIndex: { lost: 0, total: 0, percentage: 0 }, reasons: [] })

  const db = createTenantClient(tenantId)

  const [totalLeads, lostLeads, records] = await Promise.all([
    db.leadTracking.count(),
    db.leadTracking.count({ where: { idEstado: 40 } }),
    db.iaFugaDiagnostico.findMany(),
  ])

  const percentage = totalLeads > 0 ? Math.round((lostLeads / totalLeads) * 1000) / 10 : 0

  const reasons = records
    .map((r) => ({
      name: r.categoriaFuga,
      frequency: r.frecuenciaPorcentaje,
      impact: r.impactoNegocio,
      volume: r.volumenLeads,
    }))
    .sort((a, b) => b.frequency - a.frequency)

  return c.json({
    lossIndex: { lost: lostLeads, total: totalLeads, percentage },
    reasons,
  })
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

  const since = new Date()
  since.setDate(since.getDate() - 30)

  // Buscar leads que tengan eventos forenses de rescate (semáforo rojo + rescate WhatsApp)
  const tipoRojo = await db.catTipoEvento.findFirst({ where: { nombre: "Semáforo rojo" } })
  const tipoRescate = await db.catTipoEvento.findFirst({ where: { nombre: "Rescate WhatsApp" } })
  const tipoVerde = await db.catTipoEvento.findFirst({ where: { nombre: "Semáforo verde" } })

  if (!tipoRojo || !tipoRescate) return c.json({ items: [] })

  // Leads con rescate en los últimos 30 días
  const rescateEvents = await db.leadEventHistory.findMany({
    where: {
      idTipoEvento: tipoRescate.id,
      timestamp: { gte: since },
    },
    select: { leadId: true },
    orderBy: { timestamp: "desc" },
    take: 20,
  })

  const leadIds = [...new Set(rescateEvents.map((e) => e.leadId))]
  if (leadIds.length === 0) return c.json({ items: [] })

  // Obtener leads con vendedor y eventos forenses
  const leads = await db.leadTracking.findMany({
    where: { leadId: { in: leadIds } },
    include: {
      vendedor: { select: { nombre: true } },
      eventos: {
        where: { guardian: { not: null } },
        orderBy: { timestamp: "asc" },
        include: { tipoEvento: true },
      },
    },
    orderBy: { fechaCreacion: "desc" },
    take: 10,
  })

  const items = leads.map((l) => {
    const verdeEvt = tipoVerde ? l.eventos.find((e) => e.idTipoEvento === tipoVerde.id) : null
    const rojoEvt = l.eventos.find((e) => e.idTipoEvento === tipoRojo!.id)
    const rescateEvt = l.eventos.find((e) => e.idTipoEvento === tipoRescate!.id)

    // Tiempo sin respuesta humana = diff entre verde y rojo
    const sinRespuestaMin = verdeEvt && rojoEvt
      ? Math.round((rojoEvt.timestamp.getTime() - verdeEvt.timestamp.getTime()) / 60000)
      : null

    // Tiempo de rescate IA = diff entre rojo y rescate
    const rescateMin = rojoEvt && rescateEvt
      ? Math.round((rescateEvt.timestamp.getTime() - rojoEvt.timestamp.getTime()) / 1000)
      : null

    // Resultado del rescate: buscar evento de preferencia o estado final
    const resultadoEvt = l.eventos.find((e) =>
      e.tipoEvento && ["Preferencia llamada", "Preferencia agendamiento", "Preferencia chat", "Opt-out", "Llamada contestada", "Reintentos agotados"].includes(e.tipoEvento.nombre)
    )

    const h = l.fechaCreacion.getHours()
    const m = l.fechaCreacion.getMinutes()
    const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`

    return {
      time,
      leadNombre: l.nombreLead,
      vendedor: l.vendedor?.nombre || "Sin asignar",
      human: sinRespuestaMin !== null ? `${sinRespuestaMin} min sin respuesta` : "No respondio",
      aura: rescateEvt
        ? `Rescate en ${rescateMin}s → ${resultadoEvt?.tipoEvento?.nombre || "En proceso"}`
        : "Sin intervencion IA",
    }
  })

  return c.json({ items })
})

// GET /intel/forensic-rescue-by-vendor
intel.get("/forensic-rescue-by-vendor", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ vendors: [] })

  const db = createTenantClient(tenantId)

  const since = new Date()
  since.setDate(since.getDate() - 30)

  // Tipos forenses relevantes
  const [tipoVerde, tipoAmarillo, tipoRojo, tipoRescate, tipoPrefLlamada, tipoPrefAgenda, tipoPrefChat, tipoOptOut, tipoLlamadaRescate, tipoContestada, tipoNoContestada, tipoAgotados] = await Promise.all([
    db.catTipoEvento.findFirst({ where: { nombre: "Semáforo verde" } }),
    db.catTipoEvento.findFirst({ where: { nombre: "Semáforo amarillo" } }),
    db.catTipoEvento.findFirst({ where: { nombre: "Semáforo rojo" } }),
    db.catTipoEvento.findFirst({ where: { nombre: "Rescate WhatsApp" } }),
    db.catTipoEvento.findFirst({ where: { nombre: "Preferencia llamada" } }),
    db.catTipoEvento.findFirst({ where: { nombre: "Preferencia agendamiento" } }),
    db.catTipoEvento.findFirst({ where: { nombre: "Preferencia chat" } }),
    db.catTipoEvento.findFirst({ where: { nombre: "Opt-out" } }),
    db.catTipoEvento.findFirst({ where: { nombre: "Llamada rescate" } }),
    db.catTipoEvento.findFirst({ where: { nombre: "Llamada contestada" } }),
    db.catTipoEvento.findFirst({ where: { nombre: "Llamada no contestada" } }),
    db.catTipoEvento.findFirst({ where: { nombre: "Reintentos agotados" } }),
  ])

  const rescuedIds = new Set([tipoPrefLlamada?.id, tipoPrefAgenda?.id, tipoPrefChat?.id, tipoContestada?.id].filter(Boolean))
  const lostIds = new Set([tipoOptOut?.id, tipoAgotados?.id, tipoNoContestada?.id].filter(Boolean))

  // Vendedores del tenant
  const vendedores = await db.vendedor.findMany({ select: { id: true, nombre: true } })

  // Leads del período con vendedor y eventos forenses
  const leads = await db.leadTracking.findMany({
    where: { fechaCreacion: { gte: since }, vendedorId: { not: null } },
    include: {
      eventos: {
        where: { guardian: { not: null } },
        orderBy: { timestamp: "asc" },
        include: { tipoEvento: true },
      },
    },
    orderBy: { fechaCreacion: "desc" },
  })

  // Agrupar leads por vendedor
  const vendors = vendedores.map((v) => {
    const vLeads = leads.filter((l) => l.vendedorId === v.id)
    const totalLeads = vLeads.length
    const leadsConRescate = vLeads.filter((l) => l.eventos.some((e) => e.idTipoEvento === tipoRescate?.id))

    let rescuedByIA = 0
    let lostLeads = 0
    let tiempoTotalSeg = 0
    let tiempoCount = 0

    // Armar eventos por lead
    const events = leadsConRescate.map((l) => {
      const verdeEvt = l.eventos.find((e) => e.idTipoEvento === tipoVerde?.id)
      const rojoEvt = l.eventos.find((e) => e.idTipoEvento === tipoRojo?.id)
      const rescateEvt = l.eventos.find((e) => e.idTipoEvento === tipoRescate?.id)

      // Tiempo sin respuesta
      const sinRespuestaMin = verdeEvt && rojoEvt
        ? Math.round((rojoEvt.timestamp.getTime() - verdeEvt.timestamp.getTime()) / 60000)
        : null

      if (sinRespuestaMin !== null) {
        tiempoTotalSeg += sinRespuestaMin * 60
        tiempoCount++
      }

      // Determinar resultado
      const resultEvt = l.eventos.find((e) => e.idTipoEvento && (rescuedIds.has(e.idTipoEvento) || lostIds.has(e.idTipoEvento)))
      let result: "rescued" | "lost" | "pending" = "pending"
      if (resultEvt?.idTipoEvento && rescuedIds.has(resultEvt.idTipoEvento)) {
        result = "rescued"
        rescuedByIA++
      } else if (resultEvt?.idTipoEvento && lostIds.has(resultEvt.idTipoEvento)) {
        result = "lost"
        lostLeads++
      }

      // Determinar tipo de rescate
      const tieneCall = l.eventos.some((e) => e.idTipoEvento === tipoLlamadaRescate?.id)
      const tieneAgenda = l.eventos.some((e) => e.idTipoEvento === tipoPrefAgenda?.id)
      const rescueType = tieneAgenda ? "calendar" : tieneCall ? "call" : "whatsapp"

      // Construir descripción de falla humana
      const humanFailure = sinRespuestaMin !== null ? `Sin respuesta por ${sinRespuestaMin} minutos` : "Sin actividad registrada"

      // Construir acción IA
      const acciones: string[] = []
      if (rescateEvt) acciones.push("G1: Rescate WhatsApp")
      if (tieneCall) acciones.push("G7: Llamada de Rescate")
      const iaAction = acciones.join(" + ") || "G1: Alerta enviada"

      const h = l.fechaCreacion.getHours()
      const m = l.fechaCreacion.getMinutes()
      const timestamp = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`

      return {
        leadId: l.leadId.slice(0, 8),
        leadName: l.nombreLead,
        timestamp,
        humanFailure,
        humanDetail: rojoEvt?.descripcion || "Vendedor no atendió dentro del tiempo límite",
        iaAction,
        iaDetail: resultEvt?.descripcion || rescateEvt?.descripcion || "Secuencia de rescate activada",
        result,
        rescueType,
      }
    })

    const avgResponseMin = tiempoCount > 0 ? (tiempoTotalSeg / tiempoCount / 60).toFixed(1) : "0"
    const status = lostLeads >= 3 || parseFloat(avgResponseMin) >= 10 ? "critical"
      : lostLeads >= 1 || parseFloat(avgResponseMin) >= 5 ? "warning"
      : "ok"

    return {
      id: v.id,
      name: v.nombre,
      avatar: v.nombre.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
      totalLeads,
      rescuedByIA,
      lostLeads,
      avgResponseTime: `${avgResponseMin} min`,
      status,
      events,
    }
  }).filter((v) => v.events.length > 0) // solo vendedores con rescates

  return c.json({ vendors })
})

// === FORENSIC AUDIT MAPPINGS ===

const TIPO_TO_ACCION: Record<string, string> = {
  "Semáforo verde": "ALERTA_SEMAFORO_VERDE",
  "Semáforo amarillo": "ALERTA_SEMAFORO_AMARILLO",
  "Semáforo rojo": "ALERTA_SEMAFORO_ROJO",
  "Rescate WhatsApp": "DISPARO_RESCATE_G1",
  "Preferencia llamada": "PREF_LLAMADA_IA",
  "Preferencia agendamiento": "PREF_AGENDAMIENTO",
  "Preferencia chat": "PREF_CONTINUAR_CHAT",
  "Opt-out": "PREF_OPT_OUT",
  "Llamada rescate": "EJECUCION_LLAMADA_RESCATE",
  "Llamada contestada": "ESTADO_LLAMADA_CONTESTADA",
  "Llamada no contestada": "ESTADO_BUZON_NO_CONTESTA",
  "Reintento programado": "INTENTO_REMARCADO",
  "Reintentos agotados": "REINTENTOS_AGOTADOS",
}

const ACCION_TO_TIPO_EVENTO: Record<string, string> = {
  ALERTA_SEMAFORO_VERDE: "alerta",
  ALERTA_SEMAFORO_AMARILLO: "alerta",
  ALERTA_SEMAFORO_ROJO: "alerta",
  DISPARO_RESCATE_G1: "accion",
  EJECUCION_LLAMADA_RESCATE: "accion",
  INTENTO_REMARCADO: "accion",
  PREF_LLAMADA_IA: "respuesta",
  PREF_AGENDAMIENTO: "respuesta",
  PREF_CONTINUAR_CHAT: "respuesta",
  PREF_OPT_OUT: "respuesta",
  ESTADO_LLAMADA_CONTESTADA: "estado",
  ESTADO_BUZON_NO_CONTESTA: "estado",
  REINTENTOS_AGOTADOS: "estado",
}

const ACCIONES_EXITO = ["ESTADO_LLAMADA_CONTESTADA", "PREF_AGENDAMIENTO", "PREF_CONTINUAR_CHAT"]
const ACCIONES_FRACASO = ["ESTADO_BUZON_NO_CONTESTA", "PREF_OPT_OUT", "REINTENTOS_AGOTADOS"]

const TIPOS_FORENSES = Object.keys(TIPO_TO_ACCION)

// GET /intel/forensic-bitacora
intel.get("/forensic-bitacora", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ events: [], stats: { total: 0, exitosos: 0, alertasRojas: 0, optOuts: 0 } })

  const db = createTenantClient(tenantId)

  const tiposForenses = await db.catTipoEvento.findMany({
    where: { nombre: { in: TIPOS_FORENSES } },
  })
  const tipoIds = tiposForenses.map((t) => t.id)

  if (tipoIds.length === 0) {
    return c.json({ events: [], stats: { total: 0, exitosos: 0, alertasRojas: 0, optOuts: 0 } })
  }

  const since = new Date()
  since.setDate(since.getDate() - 30)

  const rawEvents = await db.leadEventHistory.findMany({
    where: {
      idTipoEvento: { in: tipoIds },
      timestamp: { gte: since },
    },
    include: {
      lead: {
        select: {
          nombreLead: true,
          telefono: true,
          fuente: true,
          fechaCreacion: true,
          vendedor: { select: { id: true, nombre: true } },
        },
      },
      tipoEvento: true,
    },
    orderBy: { timestamp: "desc" },
    take: 500,
  })

  const events = rawEvents.map((e) => {
    const accion = e.tipoEvento ? TIPO_TO_ACCION[e.tipoEvento.nombre] || "SISTEMA" : "SISTEMA"
    const tipoEvento = ACCION_TO_TIPO_EVENTO[accion] || "estado"
    const tiempoRespuestaSeg = Math.round((e.timestamp.getTime() - e.lead.fechaCreacion.getTime()) / 1000)

    return {
      id: e.eventId,
      timestamp: e.timestamp.toISOString(),
      leadId: e.leadId,
      leadNombre: e.lead.nombreLead,
      telefono: e.lead.telefono || "",
      fuente: e.lead.fuente,
      accion,
      guardian: e.guardian || null,
      tipoEvento,
      resultado: e.descripcion || "",
      vendedorAsignado: e.lead.vendedor?.nombre || "Sin asignar",
      tiempoRespuestaSeg,
    }
  })

  const stats = {
    total: events.length,
    exitosos: events.filter((e) => ACCIONES_EXITO.includes(e.accion)).length,
    alertasRojas: events.filter((e) => e.accion === "ALERTA_SEMAFORO_ROJO").length,
    optOuts: events.filter((e) => e.accion === "PREF_OPT_OUT").length,
  }

  return c.json({ events, stats })
})

// GET /intel/forensic-auditoria
intel.get("/forensic-auditoria", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ asesores: [], resumen: { pctFallaComercial: 0, causaPrincipal: "N/A", totalLeadsRojos: 0, totalRescatesIA: 0, tiempoMedioGeneral: 0 } })

  const db = createTenantClient(tenantId)

  const since = new Date()
  since.setDate(since.getDate() - 30)

  const vendedores = await db.vendedor.findMany({
    select: { id: true, nombre: true },
  })

  const tipoRojo = await db.catTipoEvento.findFirst({ where: { nombre: "Semáforo rojo" } })
  const tipoRescate = await db.catTipoEvento.findFirst({ where: { nombre: "Rescate WhatsApp" } })
  const tipoVerde = await db.catTipoEvento.findFirst({ where: { nombre: "Semáforo verde" } })

  const leads = await db.leadTracking.findMany({
    where: { fechaCreacion: { gte: since } },
    select: {
      leadId: true,
      fechaCreacion: true,
      vendedorId: true,
      semaphoreColor: true,
    },
  })

  const totalLeads = leads.length

  const eventosForenses = await db.leadEventHistory.findMany({
    where: {
      timestamp: { gte: since },
      guardian: { not: null },
    },
    select: {
      leadId: true,
      idTipoEvento: true,
      timestamp: true,
    },
  })

  const asesores = vendedores.map((v) => {
    const leadsVendedor = leads.filter((l) => l.vendedorId === v.id)
    const leadIds = leadsVendedor.map((l) => l.leadId)

    const leadsSemaforoRojo = leadsVendedor.filter((l) => l.semaphoreColor === "rojo").length

    const rescatesPorIA = tipoRescate
      ? eventosForenses.filter((e) => leadIds.includes(e.leadId) && e.idTipoEvento === tipoRescate.id).length
      : 0

    let tiempoTotalSeg = 0
    let tiempoCount = 0

    for (const lead of leadsVendedor) {
      const verdeEvento = tipoVerde
        ? eventosForenses.find((e) => e.leadId === lead.leadId && e.idTipoEvento === tipoVerde.id)
        : null
      const rojoEvento = tipoRojo
        ? eventosForenses.find((e) => e.leadId === lead.leadId && e.idTipoEvento === tipoRojo.id)
        : null

      if (verdeEvento && rojoEvento) {
        tiempoTotalSeg += Math.round((rojoEvento.timestamp.getTime() - verdeEvento.timestamp.getTime()) / 1000)
        tiempoCount++
      }
    }

    const tiempoMedioSeg = tiempoCount > 0 ? Math.round(tiempoTotalSeg / tiempoCount) : 0
    const tiempoMedioMin = Math.round(tiempoMedioSeg / 60)

    let accionTipo: "reasignacion" | "capacitacion" | "mantener"
    let accionSugerida: string
    if (tiempoMedioMin >= 10) {
      accionTipo = "reasignacion"
      accionSugerida = "REASIGNACION INMEDIATA"
    } else if (tiempoMedioMin >= 5) {
      accionTipo = "capacitacion"
      accionSugerida = "CAPACITACION EN CIERRE"
    } else {
      accionTipo = "mantener"
      accionSugerida = "MANTENER FLUJO ALTO"
    }

    return {
      id: v.id,
      nombre: v.nombre,
      tiempoMedioSeg,
      leadsSemaforoRojo,
      rescatesPorIA,
      accionSugerida,
      accionTipo,
    }
  })

  const totalLeadsRojos = leads.filter((l) => l.semaphoreColor === "rojo").length
  const totalRescatesIA = tipoRescate
    ? eventosForenses.filter((e) => e.idTipoEvento === tipoRescate.id).length
    : 0
  const pctFallaComercial = totalLeads > 0 ? Math.round((totalLeadsRojos / totalLeads) * 100) : 0
  const asesoresConTiempo = asesores.filter((a) => a.tiempoMedioSeg > 0)
  const tiempoMedioGeneral = asesoresConTiempo.length > 0
    ? Math.round(asesoresConTiempo.reduce((sum, a) => sum + a.tiempoMedioSeg, 0) / asesoresConTiempo.length / 60)
    : 0

  return c.json({
    asesores,
    resumen: {
      pctFallaComercial,
      causaPrincipal: pctFallaComercial >= 50 ? "Falla Comercial" : "Tiempo de Respuesta",
      totalLeadsRojos,
      totalRescatesIA,
      tiempoMedioGeneral,
    },
  })
})

// POST /intel/forensic-auditoria/reasignar
intel.post("/forensic-auditoria/reasignar", async (c) => {
  const tenantId = c.get("tenantId")
  if (!tenantId) return c.json({ error: "No tenant" }, 400)

  const body = await c.req.json<{
    vendedorOrigenId: string
    vendedorDestinoId: string
    soloLeadsCriticos: boolean
  }>()

  const { vendedorOrigenId, vendedorDestinoId, soloLeadsCriticos } = body

  if (!vendedorOrigenId || !vendedorDestinoId) {
    return c.json({ error: "vendedorOrigenId y vendedorDestinoId son requeridos" }, 400)
  }

  if (vendedorOrigenId === vendedorDestinoId) {
    return c.json({ error: "Origen y destino no pueden ser el mismo vendedor" }, 400)
  }

  const db = createTenantClient(tenantId)

  const vendedorDestino = await db.vendedor.findUnique({
    where: { id: vendedorDestinoId },
    select: { nombre: true },
  })

  if (!vendedorDestino) {
    return c.json({ error: "Vendedor destino no encontrado" }, 404)
  }

  const coloresFiltro = soloLeadsCriticos ? ["rojo"] : ["rojo", "amarillo"]
  const leadsParaReasignar = await db.leadTracking.findMany({
    where: {
      vendedorId: vendedorOrigenId,
      semaphoreColor: { in: coloresFiltro },
      flowJobId: { not: null },
    },
    select: { leadId: true },
  })

  if (leadsParaReasignar.length === 0) {
    return c.json({ leadsReasignados: 0, vendedorDestino: vendedorDestino.nombre })
  }

  const leadIds = leadsParaReasignar.map((l) => l.leadId)

  await db.leadTracking.updateMany({
    where: { leadId: { in: leadIds } },
    data: { vendedorId: vendedorDestinoId },
  })

  const vendedorOrigen = await db.vendedor.findUnique({
    where: { id: vendedorOrigenId },
    select: { nombre: true },
  })

  for (const lead of leadsParaReasignar) {
    await db.leadEventHistory.create({
      data: {
        tenantId,
        leadId: lead.leadId,
        idTipoEvento: null,
        actorIntervencion: "IA",
        guardian: "G1",
        descripcion: `Reasignado de ${vendedorOrigen?.nombre || "desconocido"} a ${vendedorDestino.nombre}`,
      },
    })
  }

  return c.json({
    leadsReasignados: leadIds.length,
    vendedorDestino: vendedorDestino.nombre,
  })
})

export { intel as intelRoutes }
