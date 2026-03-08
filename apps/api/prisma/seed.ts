import { PrismaClient } from "@prisma/client";
import admin from "firebase-admin";
import { randomUUID } from "crypto";

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
}

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrCreateFirebaseUser(
  email: string,
  password: string
): Promise<string> {
  try {
    const user = await admin.auth().createUser({
      email,
      password,
      emailVerified: true,
    });
    return user.uid;
  } catch (err: any) {
    if (err.code === "auth/email-already-exists") {
      const existing = await admin.auth().getUserByEmail(email);
      return existing.uid;
    }
    // If Firebase Admin credentials aren't available, try to find existing UID in DB
    if (err.code === "app/invalid-credential") {
      const existingUser = await prisma.user.findFirst({
        where: { email },
        select: { firebaseUid: true },
      });
      if (existingUser) {
        console.log(`  Using existing Firebase UID for ${email} from database`);
        return existingUser.firebaseUid;
      }
      // Generate a placeholder UID for new users when Firebase is unavailable
      console.warn(`  WARNING: No Firebase credentials and no existing user for ${email}. Using placeholder UID.`);
      return `placeholder_${email.replace(/[^a-z0-9]/g, "_")}`;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const ADMIN_TENANT_ID = "75c003f2-d881-4343-8637-0477db03fbc1";

async function main() {
  console.log("Seeding Rol.IA database...");

  // ---- Firebase users ----
  const superadminUid = await getOrCreateFirebaseUser(
    "admin@rol.ia",
    "Admin123!"
  );
  console.log(`  Superadmin firebase uid: ${superadminUid}`);

  // ---- Idempotent cleanup for admin tenant only ----
  console.log("  Cleaning existing seed data for admin tenant...");

  await prisma.budgetRecommendation.deleteMany({ where: { tenantId: ADMIN_TENANT_ID } });
  await prisma.adPerformanceDetail.deleteMany({ where: { tenantId: ADMIN_TENANT_ID } });
  await prisma.metricsAdPerformance.deleteMany({ where: { tenantId: ADMIN_TENANT_ID } });
  await prisma.metricsRoasHistory.deleteMany({ where: { tenantId: ADMIN_TENANT_ID } });
  await prisma.ventasProyeccion.deleteMany({ where: { tenantId: ADMIN_TENANT_ID } });
  await prisma.iaFugaDiagnostico.deleteMany({ where: { tenantId: ADMIN_TENANT_ID } });
  await prisma.iaContentHook.deleteMany({ where: { tenantId: ADMIN_TENANT_ID } });
  await prisma.citaAgendada.deleteMany({ where: { tenantId: ADMIN_TENANT_ID } });
  await prisma.leadEventHistory.deleteMany({ where: { tenantId: ADMIN_TENANT_ID } });
  await prisma.leadTracking.deleteMany({ where: { tenantId: ADMIN_TENANT_ID } });
  await prisma.configGuardian.deleteMany({ where: { tenantId: ADMIN_TENANT_ID } });

  // Cleanup global tables only if re-seeding
  await prisma.catTipoEvento.deleteMany({});
  await prisma.catEstadoGestion.deleteMany({});

  // Clean users and tenant for admin tenant
  await prisma.user.deleteMany({
    where: { email: "admin@rol.ia" },
  });
  await prisma.tenant.deleteMany({ where: { id: ADMIN_TENANT_ID } });

  // ---- Tenant ----
  const tenant = await prisma.tenant.create({
    data: {
      id: ADMIN_TENANT_ID,
      name: "Rol Demo",
      slug: "rol-demo",
      plan: "pro",
      settings: {},
      active: true,
    },
  });
  const tenantId = tenant.id;
  console.log(`  Tenant created: ${tenant.name} (${tenantId})`);

  // ---- Users ----
  await prisma.user.create({
    data: {
      id: randomUUID(),
      tenantId,
      firebaseUid: superadminUid,
      email: "admin@rol.ia",
      name: "Superadmin",
      role: "superadmin",
      approved: true,
      approvedAt: new Date(),
      permissions: {},
    },
  });

  console.log("  Users created");

  // ---- CatEstadoGestion ----
  const estados = [
    { nombre: "Nuevo", color: "#3B82F6" },
    { nombre: "Contactado", color: "#F59E0B" },
    { nombre: "En proceso", color: "#8B5CF6" },
    { nombre: "Cerrado", color: "#10B981" },
    { nombre: "Perdido", color: "#EF4444" },
  ];

  const estadoRecords: { id: number; nombre: string }[] = [];
  for (const e of estados) {
    const rec = await prisma.catEstadoGestion.create({
      data: { nombre: e.nombre, color: e.color },
    });
    estadoRecords.push(rec);
  }
  console.log(`  CatEstadoGestion: ${estadoRecords.length} records`);

  // ---- CatTipoEvento ----
  const tiposEvento = [
    "Lead ingreso",
    "Llamada",
    "WhatsApp",
    "Email",
    "Cita",
  ];

  const tipoEventoRecords: { id: number; nombre: string }[] = [];
  for (const t of tiposEvento) {
    const rec = await prisma.catTipoEvento.create({ data: { nombre: t } });
    tipoEventoRecords.push(rec);
  }
  console.log(`  CatTipoEvento: ${tipoEventoRecords.length} records`);

  // ---- ConfigGuardian ----
  const guardianNames = [
    "Guardian de Leads Nuevos",
    "Guardian de Seguimiento",
    "Guardian de WhatsApp",
    "Guardian de Citas",
    "Guardian de Presupuesto",
    "Guardian de ROAS",
    "Guardian de Contenido",
  ];

  for (let i = 0; i < 7; i++) {
    await prisma.configGuardian.create({
      data: {
        guardianId: `G${i + 1}`,
        tenantId,
        nombre: guardianNames[i],
        estaActivo: true,
        ultimaActivacion: new Date(),
        usuarioCambio: "seed",
      },
    });
  }
  console.log("  ConfigGuardian: 7 records");

  // ---- LeadTracking (6 leads matching abandonment component) ----
  const now = new Date();

  const leadData = [
    { leadId: "L-001", nombre: "Carlos Peresss", fuente: "Meta", minAgo: 12 },
    { leadId: "L-002", nombre: "Ana Gomez", fuente: "Google", minAgo: 9 },
    { leadId: "L-003", nombre: "Luis Torres", fuente: "Meta", minAgo: 7 },
    { leadId: "L-004", nombre: "Maria Lopez", fuente: "Google", minAgo: 5 },
    { leadId: "L-005", nombre: "Juan Ruiz", fuente: "Organico", minAgo: 3 },
    { leadId: "L-006", nombre: "Sofia Diaz", fuente: "Meta", minAgo: 1 },
  ];

  const leadIds: string[] = [];

  for (const l of leadData) {
    leadIds.push(l.leadId);
    const fechaCreacion = new Date(now.getTime() - l.minAgo * 60 * 1000);
    await prisma.leadTracking.create({
      data: {
        leadId: l.leadId,
        tenantId,
        nombreLead: l.nombre,
        fuente: l.fuente,
        fechaCreacion,
        idEstado: estadoRecords[0].id,
      },
    });
  }
  console.log("  LeadTracking: 6 records");

  // ---- LeadEventHistory (~12: 2 events per lead for KPI calc) ----
  for (const l of leadData) {
    const leadCreation = new Date(now.getTime() - l.minAgo * 60 * 1000);

    // IA event: quick response (3-10 min after creation)
    const iaDelay = (3 + Math.floor(Math.random() * 7)) * 60 * 1000;
    await prisma.leadEventHistory.create({
      data: {
        eventId: randomUUID(),
        tenantId,
        leadId: l.leadId,
        idTipoEvento: tipoEventoRecords[0].id,
        actorIntervencion: "IA",
        descripcion: "Respuesta automatica enviada",
        timestamp: new Date(leadCreation.getTime() + iaDelay),
      },
    });

    // HUMANO event: slower response (30-60 min after creation)
    const humanDelay = (30 + Math.floor(Math.random() * 30)) * 60 * 1000;
    await prisma.leadEventHistory.create({
      data: {
        eventId: randomUUID(),
        tenantId,
        leadId: l.leadId,
        idTipoEvento: tipoEventoRecords[1].id,
        actorIntervencion: "HUMANO",
        descripcion: "Llamada de seguimiento realizada",
        timestamp: new Date(leadCreation.getTime() + humanDelay),
      },
    });
  }
  console.log("  LeadEventHistory: 12 records");

  // ---- CitaAgendada (5 matching scheduling component) ----
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const citasData = [
    { lead: "L-001", hora: 10, min: 30, canal: "Telefono" },
    { lead: "L-002", hora: 11, min: 0, canal: "WhatsApp" },
    { lead: "L-003", hora: 11, min: 45, canal: "Telefono" },
    { lead: "L-004", hora: 14, min: 0, canal: "Telefono" },
    { lead: "L-005", hora: 15, min: 30, canal: "WhatsApp" },
  ];

  for (const c of citasData) {
    const horaAgenda = new Date(today);
    horaAgenda.setHours(c.hora, c.min, 0, 0);
    await prisma.citaAgendada.create({
      data: {
        idCita: randomUUID(),
        tenantId,
        leadId: c.lead,
        horaAgenda,
        canal: c.canal,
        idGoogleCalendar: `gcal_${randomUUID().slice(0, 8)}`,
      },
    });
  }
  console.log("  CitaAgendada: 5 records");

  // ---- MetricsAdPerformance (30 records, 10min intervals from 08:00) ----
  for (let i = 0; i < 30; i++) {
    const hour = 8 + Math.floor(i / 6);
    const min = (i % 6) * 10;
    const timestamp = new Date(today);
    timestamp.setHours(hour, min, 0, 0);

    const fuente = i % 2 === 0 ? "Meta" : "Google";
    const metaSpendBase = 15 + Math.random() * 35;
    const googleSpendBase = 10 + Math.random() * 25;
    const spend = fuente === "Meta" ? metaSpendBase : googleSpendBase;
    const conv = Math.floor(Math.random() * 5);

    await prisma.metricsAdPerformance.create({
      data: {
        id: randomUUID(),
        tenantId,
        timestamp,
        fuenteId: fuente,
        gastoIntervalo: parseFloat(spend.toFixed(2)),
        convIntervalo: conv,
        adAccountId: `${fuente.toLowerCase()}_acc_001`,
      },
    });
  }
  console.log("  MetricsAdPerformance: 30 records");

  // ---- AdPerformanceDetail (5 ads matching optimizer component) ----
  const creatives = [
    { adId: "AD-001", nombreCreativo: "Carrusel Urgencia", cplActual: 4200, trend: "down", presupuestoActual: 50000, estadoIa: "winner" },
    { adId: "AD-002", nombreCreativo: "Video Testimonial", cplActual: 5100, trend: "down", presupuestoActual: 35000, estadoIa: "winner" },
    { adId: "AD-003", nombreCreativo: "Story Lead Form", cplActual: 8900, trend: "up", presupuestoActual: 40000, estadoIa: "loser" },
    { adId: "AD-004", nombreCreativo: "Banner Estatico", cplActual: 12300, trend: "up", presupuestoActual: 30000, estadoIa: "paused" },
    { adId: "AD-005", nombreCreativo: "Reel Educativo", cplActual: 6200, trend: "stable", presupuestoActual: 25000, estadoIa: "winner" },
  ];

  for (const c of creatives) {
    await prisma.adPerformanceDetail.create({
      data: { ...c, tenantId },
    });
  }
  console.log("  AdPerformanceDetail: 5 records");

  // ---- BudgetRecommendation (1 per ad) ----
  const recommendations = [
    { adId: "AD-001", presupuestoSugerido: 80000, ahorroDetectado: 0 },
    { adId: "AD-002", presupuestoSugerido: 55000, ahorroDetectado: 0 },
    { adId: "AD-003", presupuestoSugerido: 15000, ahorroDetectado: 25000 },
    { adId: "AD-004", presupuestoSugerido: 0, ahorroDetectado: 30000 },
    { adId: "AD-005", presupuestoSugerido: 40000, ahorroDetectado: 0 },
  ];

  for (const r of recommendations) {
    await prisma.budgetRecommendation.create({
      data: {
        id: randomUUID(),
        tenantId,
        adId: r.adId,
        presupuestoSugerido: r.presupuestoSugerido,
        ahorroDetectado: r.ahorroDetectado,
        fechaCalculo: now,
      },
    });
  }
  console.log("  BudgetRecommendation: 5 records");

  // ---- IaFugaDiagnostico (8 records matching leak-diagnosis component) ----
  const fugas = [
    { categoriaFuga: "Vendedor saturado", frecuenciaPorcentaje: 38, impactoNegocio: 85, volumenLeads: 420, colorHex: "#ef4444" },
    { categoriaFuga: "Horario inhabil", frecuenciaPorcentaje: 27, impactoNegocio: 60, volumenLeads: 310, colorHex: "#f59e0b" },
    { categoriaFuga: "Lead de baja calidad", frecuenciaPorcentaje: 22, impactoNegocio: 35, volumenLeads: 250, colorHex: "#6366f1" },
    { categoriaFuga: "Sin numero valido", frecuenciaPorcentaje: 15, impactoNegocio: 70, volumenLeads: 180, colorHex: "#a855f7" },
    { categoriaFuga: "CRM desactualizado", frecuenciaPorcentaje: 12, impactoNegocio: 50, volumenLeads: 150, colorHex: "#f59e0b" },
    { categoriaFuga: "Canal equivocado", frecuenciaPorcentaje: 9, impactoNegocio: 40, volumenLeads: 120, colorHex: "#6366f1" },
    { categoriaFuga: "Respuesta generica", frecuenciaPorcentaje: 18, impactoNegocio: 55, volumenLeads: 200, colorHex: "#ef4444" },
    { categoriaFuga: "Doble asignacion", frecuenciaPorcentaje: 8, impactoNegocio: 30, volumenLeads: 100, colorHex: "#22c55e" },
  ];

  for (const f of fugas) {
    await prisma.iaFugaDiagnostico.create({
      data: { id: randomUUID(), tenantId, ...f },
    });
  }
  console.log("  IaFugaDiagnostico: 8 records");

  // ---- IaContentHook (3 hooks matching copywriter component) ----
  const hooks = [
    {
      contenido: "Tu competencia ya automatizo sus ventas. Tu equipo sigue copiando y pegando mensajes.",
      categoria: "Dolor / Comparacion",
      scoreProbabilidad: 87,
      briefVisual: [
        { label: "Tono visual", value: "Urgente, limpio, profesional" },
        { label: "Paleta sugerida", value: "Oscuro + acento violeta + rojo CTA" },
        { label: "Formato", value: "Video corto 15s o Carrusel 3 slides" },
        { label: "CTA principal", value: "Agenda tu demo en 30 segundos" },
      ],
    },
    {
      contenido: "Cada 7 minutos pierdes un cliente. Rol.IA los rescata en 30 segundos.",
      categoria: "Urgencia / Estadistica",
      scoreProbabilidad: 92,
      briefVisual: null,
    },
    {
      contenido: "Deja de pagar publicidad para que tus vendedores la ignoren.",
      categoria: "Frustracion / Inversion",
      scoreProbabilidad: 78,
      briefVisual: null,
    },
  ];

  for (const h of hooks) {
    await prisma.iaContentHook.create({
      data: {
        hookId: randomUUID(),
        tenantId,
        contenido: h.contenido,
        categoria: h.categoria,
        scoreProbabilidad: h.scoreProbabilidad,
        briefVisual: h.briefVisual,
        createdAt: new Date(),
      },
    });
  }
  console.log("  IaContentHook: 3 records");

  // ---- MetricsRoasHistory (14 records: 7 days x 2 sources) ----
  const metaRoas = [3.2, 2.9, 2.5, 2.1, 1.8, 1.4, 1.1];
  const googleRoas = [2.8, 2.6, 2.3, 2.4, 2.0, 1.7, 1.5];

  for (let day = 6; day >= 0; day--) {
    const fecha = new Date(now);
    fecha.setDate(fecha.getDate() - day);
    fecha.setHours(0, 0, 0, 0);

    const idx = 6 - day;

    await prisma.metricsRoasHistory.create({
      data: {
        id: randomUUID(),
        tenantId,
        fecha,
        fuente: "Meta",
        roasDiario: metaRoas[idx],
        umbralCorte: 1.5,
      },
    });

    await prisma.metricsRoasHistory.create({
      data: {
        id: randomUUID(),
        tenantId,
        fecha,
        fuente: "Google",
        roasDiario: googleRoas[idx],
        umbralCorte: 1.5,
      },
    });
  }
  console.log("  MetricsRoasHistory: 14 records");

  // ---- VentasProyeccion (8 records matching goal-predictor component) ----
  const ventasActuales = [18, 29, 37, 48, 55, 63, 70, 78];
  const diasVentas = [1, 4, 7, 10, 13, 16, 19, 22];
  const metaMensual = 120;

  for (let i = 0; i < diasVentas.length; i++) {
    const fecha = new Date(now.getFullYear(), now.getMonth(), diasVentas[i]);
    fecha.setHours(0, 0, 0, 0);

    await prisma.ventasProyeccion.create({
      data: {
        pkId: `VP-${fecha.toISOString().slice(0, 10)}`,
        tenantId,
        fecha,
        ventasReales: ventasActuales[i],
        ventasProyectadas: ventasActuales[i],
        metaMensual,
        fuente: "Mixto",
      },
    });
  }
  console.log("  VentasProyeccion: 8 records");

  console.log("\nSeed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
