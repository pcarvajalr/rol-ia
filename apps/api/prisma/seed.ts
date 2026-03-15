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
    "Timeout",
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

  // ---- Integration Platforms ----
  await prisma.tenantIntegration.deleteMany({});
  await prisma.integrationField.deleteMany({});
  await prisma.integrationPlatform.deleteMany({});

  const platforms = [
    {
      name: "WhatsApp",
      slug: "whatsapp",
      icon: "MessageSquare",
      category: "messaging",
      sortOrder: 1,
      fields: [
        { label: "Número de WhatsApp", fieldKey: "phone_number", fieldType: "text", sortOrder: 1 },
        { label: "ID de Número de Teléfono (Meta)", fieldKey: "phone_number_id", fieldType: "text", sortOrder: 2 },
        { label: "ID Cuenta (WABA)", fieldKey: "account_id", fieldType: "text", sortOrder: 3 },
        { label: "Token de Acceso", fieldKey: "access_token", fieldType: "secret", sortOrder: 4 },
        { label: "App Secret", fieldKey: "app_secret", fieldType: "secret", sortOrder: 5 },
      ],
    },
    {
      name: "Vapi",
      slug: "vapi",
      icon: "Mic",
      category: "voice",
      sortOrder: 2,
      fields: [
        { label: "ID de Asistente", fieldKey: "assistant_id", fieldType: "text", sortOrder: 1 },
        { label: "ID de Número de Teléfono", fieldKey: "phone_number_id", fieldType: "text", sortOrder: 2 },
        { label: "Token de Autorizacion", fieldKey: "auth_token", fieldType: "secret", sortOrder: 3 },
      ],
    },
    {
      name: "Telefonia",
      slug: "telephony",
      icon: "Phone",
      category: "telephony",
      sortOrder: 3,
      fields: [
        { label: "SID", fieldKey: "sid", fieldType: "text", sortOrder: 1 },
        { label: "Numero de Origen", fieldKey: "from_number", fieldType: "text", sortOrder: 2 },
        { label: "Token Privado", fieldKey: "private_token", fieldType: "secret", sortOrder: 3 },
      ],
    },
    {
      name: "Clientify",
      slug: "clientify",
      icon: "Database",
      category: "crm",
      sortOrder: 4,
      fields: [
        { label: "Token de Integracion API", fieldKey: "api_token", fieldType: "secret", sortOrder: 1 },
      ],
    },
    {
      name: "Envío Emails",
      slug: "email",
      icon: "Mail",
      category: "email",
      sortOrder: 5,
      fields: [
        { label: "Servidor SMTP", fieldKey: "smtp_host", fieldType: "text", sortOrder: 1 },
        { label: "Puerto SMTP", fieldKey: "smtp_port", fieldType: "text", sortOrder: 2 },
        { label: "Usuario SMTP", fieldKey: "smtp_user", fieldType: "text", sortOrder: 3 },
        { label: "Contraseña SMTP", fieldKey: "smtp_password", fieldType: "secret", sortOrder: 4 },
        { label: "Email de Envío", fieldKey: "from_email", fieldType: "text", sortOrder: 5 },
        { label: "Nombre de Envío", fieldKey: "from_name", fieldType: "text", sortOrder: 6 },
      ],
    },
    {
      name: "Google Calendar",
      slug: "google_calendar",
      icon: "Calendar",
      category: "scheduling",
      sortOrder: 6,
      fields: [
        { label: "URL de Calendario (iCal)", fieldKey: "calendar_url", fieldType: "text", sortOrder: 1 },
      ],
    },
  ];

  for (const p of platforms) {
    const { fields, ...platformData } = p;
    const platform = await prisma.integrationPlatform.create({
      data: platformData,
    });
    for (const f of fields) {
      await prisma.integrationField.create({
        data: {
          platformId: platform.id,
          ...f,
        },
      });
    }
  }
  console.log("  IntegrationPlatforms: 6 platforms with fields");

  // ---- LeadTracking (6 leads matching abandonment component) ----
  const now = new Date();

  const leadData = [
    { externalId: "CL-1001", nombre: "Carlos Peresss", fuente: "Meta", minAgo: 12 },
    { externalId: "CL-1002", nombre: "Ana Gomez", fuente: "Google", minAgo: 9 },
    { externalId: "CL-1003", nombre: "Luis Torres", fuente: "Meta", minAgo: 7 },
    { externalId: "CL-1004", nombre: "Maria Lopez", fuente: "Google", minAgo: 5 },
    { externalId: "CL-1005", nombre: "Juan Ruiz", fuente: "Organico", minAgo: 3 },
    { externalId: "CL-1006", nombre: "Sofia Diaz", fuente: "Meta", minAgo: 1 },
  ];

  const createdLeads: { leadId: string; externalId: string; minAgo: number }[] = [];

  for (const l of leadData) {
    const fechaCreacion = new Date(now.getTime() - l.minAgo * 60 * 1000);
    const lead = await prisma.leadTracking.create({
      data: {
        tenantId,
        externalId: l.externalId,
        nombreLead: l.nombre,
        fuente: l.fuente,
        fechaCreacion,
        idEstado: estadoRecords[0].id,
      },
    });
    createdLeads.push({ leadId: lead.leadId, externalId: l.externalId, minAgo: l.minAgo });
  }
  console.log("  LeadTracking: 6 records");

  // ---- LeadEventHistory (~12: 2 events per lead for KPI calc) ----
  for (const l of createdLeads) {
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
  // Use relative timestamps: appointments spread across the next few hours from now
  const citasData = [
    { leadIndex: 0, offsetMin: 30, canal: "Telefono" },
    { leadIndex: 1, offsetMin: 60, canal: "WhatsApp" },
    { leadIndex: 2, offsetMin: 105, canal: "Telefono" },
    { leadIndex: 3, offsetMin: 180, canal: "Telefono" },
    { leadIndex: 4, offsetMin: 270, canal: "WhatsApp" },
  ];

  for (const c of citasData) {
    const horaAgenda = new Date(now.getTime() + c.offsetMin * 60 * 1000);
    await prisma.citaAgendada.create({
      data: {
        idCita: randomUUID(),
        tenantId,
        leadId: createdLeads[c.leadIndex].leadId,
        horaAgenda,
        canal: c.canal,
        idGoogleCalendar: `gcal_${randomUUID().slice(0, 8)}`,
      },
    });
  }
  console.log("  CitaAgendada: 5 records");

  // ---- MetricsAdPerformance (30 records, 10min intervals ending ~now) ----
  // Use relative timestamps so data always falls within the 5h query window
  for (let i = 0; i < 30; i++) {
    const minutesAgo = (29 - i) * 10; // 290min ago → 0min ago
    const timestamp = new Date(now.getTime() - minutesAgo * 60 * 1000);

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
        briefVisual: h.briefVisual ?? undefined,
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
