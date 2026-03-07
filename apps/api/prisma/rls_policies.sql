-- Enable RLS on all tables with tenant_id
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_guardianes ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads_event_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE citas_agendadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_ad_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_performance_detail ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_fuga_diagnostico ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_content_hooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_roas_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas_proyecciones ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policies
CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_config_guardianes ON config_guardianes
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_leads_tracking ON leads_tracking
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_leads_event_history ON leads_event_history
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_citas_agendadas ON citas_agendadas
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_metrics_ad_performance ON metrics_ad_performance
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_ad_performance_detail ON ad_performance_detail
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_budget_recommendations ON budget_recommendations
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_ia_fuga_diagnostico ON ia_fuga_diagnostico
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_ia_content_hooks ON ia_content_hooks
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_metrics_roas_history ON metrics_roas_history
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_ventas_proyecciones ON ventas_proyecciones
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
