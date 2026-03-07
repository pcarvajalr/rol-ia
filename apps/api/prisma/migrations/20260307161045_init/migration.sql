-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "api_keys_encrypted" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "firebase_uid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_guardianes" (
    "guardian_id" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "esta_activo" BOOLEAN NOT NULL DEFAULT false,
    "ultima_activacion" TIMESTAMP(3),
    "usuario_cambio" TEXT,

    CONSTRAINT "config_guardianes_pkey" PRIMARY KEY ("guardian_id")
);

-- CreateTable
CREATE TABLE "cat_tipos_evento" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "cat_tipos_evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cat_estados_gestion" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "cat_estados_gestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads_tracking" (
    "lead_id" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "nombre_lead" TEXT NOT NULL,
    "fuente" TEXT NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_estado" INTEGER,

    CONSTRAINT "leads_tracking_pkey" PRIMARY KEY ("lead_id")
);

-- CreateTable
CREATE TABLE "leads_event_history" (
    "event_id" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lead_id" TEXT NOT NULL,
    "id_tipo_evento" INTEGER,
    "actor_intervencion" TEXT NOT NULL,
    "descripcion" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_event_history_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "citas_agendadas" (
    "id_cita" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lead_id" TEXT NOT NULL,
    "hora_agenda" TIMESTAMP(3) NOT NULL,
    "canal" TEXT NOT NULL,
    "id_google_calendar" TEXT,

    CONSTRAINT "citas_agendadas_pkey" PRIMARY KEY ("id_cita")
);

-- CreateTable
CREATE TABLE "metrics_ad_performance" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "fuente_id" TEXT NOT NULL,
    "gasto_intervalo" DOUBLE PRECISION NOT NULL,
    "conv_intervalo" INTEGER NOT NULL DEFAULT 0,
    "ad_account_id" TEXT,

    CONSTRAINT "metrics_ad_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_performance_detail" (
    "ad_id" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "nombre_creativo" TEXT NOT NULL,
    "cpl_actual" DOUBLE PRECISION NOT NULL,
    "trend" TEXT NOT NULL,
    "presupuesto_actual" DOUBLE PRECISION NOT NULL,
    "estado_ia" TEXT NOT NULL,

    CONSTRAINT "ad_performance_detail_pkey" PRIMARY KEY ("ad_id")
);

-- CreateTable
CREATE TABLE "budget_recommendations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ad_id" TEXT NOT NULL,
    "presupuesto_sugerido" DOUBLE PRECISION NOT NULL,
    "ahorro_detectado" DOUBLE PRECISION NOT NULL,
    "fecha_calculo" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_fuga_diagnostico" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "categoria_fuga" TEXT NOT NULL,
    "frecuencia_porcentaje" DOUBLE PRECISION NOT NULL,
    "impacto_negocio" DOUBLE PRECISION NOT NULL,
    "volumen_leads" INTEGER NOT NULL,
    "color_hex" TEXT NOT NULL,

    CONSTRAINT "ia_fuga_diagnostico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ia_content_hooks" (
    "hook_id" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contenido" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "score_probabilidad" INTEGER NOT NULL,
    "brief_visual" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ia_content_hooks_pkey" PRIMARY KEY ("hook_id")
);

-- CreateTable
CREATE TABLE "metrics_roas_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "fuente" TEXT NOT NULL,
    "roas_diario" DOUBLE PRECISION NOT NULL,
    "umbral_corte" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "metrics_roas_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas_proyecciones" (
    "pk_id" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "ventas_reales" INTEGER NOT NULL DEFAULT 0,
    "ventas_proyectadas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "meta_mensual" INTEGER NOT NULL DEFAULT 0,
    "fuente" TEXT NOT NULL,

    CONSTRAINT "ventas_proyecciones_pkey" PRIMARY KEY ("pk_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "config_guardianes_tenant_id_idx" ON "config_guardianes"("tenant_id");

-- CreateIndex
CREATE INDEX "leads_tracking_tenant_id_idx" ON "leads_tracking"("tenant_id");

-- CreateIndex
CREATE INDEX "leads_tracking_tenant_id_fecha_creacion_idx" ON "leads_tracking"("tenant_id", "fecha_creacion");

-- CreateIndex
CREATE INDEX "leads_event_history_tenant_id_idx" ON "leads_event_history"("tenant_id");

-- CreateIndex
CREATE INDEX "leads_event_history_lead_id_idx" ON "leads_event_history"("lead_id");

-- CreateIndex
CREATE INDEX "citas_agendadas_tenant_id_idx" ON "citas_agendadas"("tenant_id");

-- CreateIndex
CREATE INDEX "metrics_ad_performance_tenant_id_idx" ON "metrics_ad_performance"("tenant_id");

-- CreateIndex
CREATE INDEX "metrics_ad_performance_tenant_id_timestamp_idx" ON "metrics_ad_performance"("tenant_id", "timestamp");

-- CreateIndex
CREATE INDEX "ad_performance_detail_tenant_id_idx" ON "ad_performance_detail"("tenant_id");

-- CreateIndex
CREATE INDEX "budget_recommendations_tenant_id_idx" ON "budget_recommendations"("tenant_id");

-- CreateIndex
CREATE INDEX "ia_fuga_diagnostico_tenant_id_idx" ON "ia_fuga_diagnostico"("tenant_id");

-- CreateIndex
CREATE INDEX "ia_content_hooks_tenant_id_idx" ON "ia_content_hooks"("tenant_id");

-- CreateIndex
CREATE INDEX "metrics_roas_history_tenant_id_idx" ON "metrics_roas_history"("tenant_id");

-- CreateIndex
CREATE INDEX "metrics_roas_history_tenant_id_fecha_idx" ON "metrics_roas_history"("tenant_id", "fecha");

-- CreateIndex
CREATE INDEX "ventas_proyecciones_tenant_id_idx" ON "ventas_proyecciones"("tenant_id");

-- CreateIndex
CREATE INDEX "ventas_proyecciones_tenant_id_fecha_idx" ON "ventas_proyecciones"("tenant_id", "fecha");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_guardianes" ADD CONSTRAINT "config_guardianes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads_tracking" ADD CONSTRAINT "leads_tracking_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads_tracking" ADD CONSTRAINT "leads_tracking_id_estado_fkey" FOREIGN KEY ("id_estado") REFERENCES "cat_estados_gestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads_event_history" ADD CONSTRAINT "leads_event_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads_event_history" ADD CONSTRAINT "leads_event_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads_tracking"("lead_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads_event_history" ADD CONSTRAINT "leads_event_history_id_tipo_evento_fkey" FOREIGN KEY ("id_tipo_evento") REFERENCES "cat_tipos_evento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas_agendadas" ADD CONSTRAINT "citas_agendadas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citas_agendadas" ADD CONSTRAINT "citas_agendadas_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads_tracking"("lead_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrics_ad_performance" ADD CONSTRAINT "metrics_ad_performance_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_performance_detail" ADD CONSTRAINT "ad_performance_detail_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_recommendations" ADD CONSTRAINT "budget_recommendations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_recommendations" ADD CONSTRAINT "budget_recommendations_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ad_performance_detail"("ad_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_fuga_diagnostico" ADD CONSTRAINT "ia_fuga_diagnostico_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ia_content_hooks" ADD CONSTRAINT "ia_content_hooks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrics_roas_history" ADD CONSTRAINT "metrics_roas_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas_proyecciones" ADD CONSTRAINT "ventas_proyecciones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
