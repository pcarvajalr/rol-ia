import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  Shield,
  BarChart3,
  Radio,
  Settings,
  Eye,
  Bot,
  Search,
  TrendingUp,
  ChevronRight,
  LogOut,
  ShieldCheck,
} from "lucide-react"
import { useNavigate } from "react-router"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"

import { KPICards } from "@/components/kpi-cards"
import { SLATracker } from "@/components/sla-tracker"
import { ROASGuardian } from "@/components/roas-guardian"
import { RescueHistory } from "@/components/rescue-history"
import { ActivityFeed } from "@/components/activity-feed"
import { GuardianConfig } from "@/components/guardian-config"
import { CrmStateMapping } from "@/components/crm-state-mapping"
import { SecurityVault } from "@/components/security-vault"
import { HelpPanel } from "@/components/help-panel"
import { RolLogo, RolIcon } from "@/components/rol-logo"
import { useAuthStore } from "@/stores/auth-store"
import { toast } from "sonner"

/* Intel panels */
import { IntelCPARealtime } from "@/components/intel-cpa-realtime"
import { IntelGoalPredictor } from "@/components/intel-goal-predictor"
import { IntelAbandonment } from "@/components/intel-abandonment"
import { IntelLeakDiagnosis } from "@/components/intel-leak-diagnosis"
import { IntelCopywriter } from "@/components/intel-copywriter"
import { IntelOptimizer } from "@/components/intel-optimizer"
import { IntelScheduling } from "@/components/intel-scheduling"
import { IntelROASTrend } from "@/components/intel-roas-trend"

/* Guardian cards */
import {
  GuardianCopywriter,
  GuardianPredictive,
  GuardianAuditor,
  GuardianOptimizer,
  GuardianScheduler,
} from "@/components/guardian-cards"

/* Reusable animated collapsible group */
function ReportGroup({
  icon,
  iconBg,
  title,
  subtitle,
  badge,
  badgeColor,
  count,
  defaultOpen = true,
  children,
}: {
  icon: React.ReactNode
  iconColor: string
  iconBg: string
  title: string
  subtitle: string
  badge: string
  badgeColor: string
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col">
      <CollapsibleTrigger asChild>
        <button
          className="border-border/40 hover:border-border/60 group flex w-full cursor-pointer items-center justify-between rounded-xl border bg-[#0c0c10]/60 px-5 py-4 transition-all hover:bg-[#0f0f14]/80"
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg} transition-transform duration-200 ${
                open ? "scale-100" : "scale-95"
              }`}
            >
              {icon}
            </div>
            <div className="flex flex-col items-start gap-0.5">
              <div className="flex items-center gap-2.5">
                <span className="text-foreground text-sm font-semibold tracking-tight">
                  {title}
                </span>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-normal ${badgeColor}`}
                >
                  {badge}
                </Badge>
              </div>
              <span className="text-muted-foreground text-[11px] leading-tight">
                {subtitle}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-muted-foreground/50 hidden text-xs sm:block">
              {count} {count === 1 ? "panel" : "paneles"}
            </span>
            <div
              className={`text-muted-foreground flex h-6 w-6 items-center justify-center rounded-md transition-all duration-200 ${
                open ? "rotate-90 bg-[#18181b]" : "rotate-0"
              }`}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div className="pt-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay },
})

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const authStatus = useAuthStore((s) => s.authStatus)
  const token = useAuthStore((s) => s.token)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [slaMinutes, setSlaMinutes] = useState(7)
  const [criticalState, setCriticalState] = useState("cold-lead")
  const [doubleTouchMinutes, setDoubleTouchMinutes] = useState(2)
  const [tiempoRespuestaLeadSeg, setTiempoRespuestaLeadSeg] = useState(15)
  const [tiempoVerdeMins, setTiempoVerdeMins] = useState(5)
  const [tiempoAmarilloMins, setTiempoAmarilloMins] = useState(5)
  const [isSavingGuardian, setIsSavingGuardian] = useState(false)
  const [guardianLoaded, setGuardianLoaded] = useState(false)

  useEffect(() => {
    const loadGuardianSettings = async () => {
      try {
        if (!token) return
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/settings/guardian`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setSlaMinutes(data.slaMinutes ?? 7)
          setCriticalState(data.criticalState ?? "cold-lead")
          setDoubleTouchMinutes(data.doubleTouchMinutes ?? 2)
          setTiempoRespuestaLeadSeg(data.tiempoRespuestaLeadSeg ?? 15)
          if (data.tiempoVerdeMins) setTiempoVerdeMins(data.tiempoVerdeMins)
          if (data.tiempoAmarilloMins) setTiempoAmarilloMins(data.tiempoAmarilloMins)
        }
      } catch (err) {
        console.error("Failed to load guardian settings:", err)
      } finally {
        setGuardianLoaded(true)
      }
    }
    loadGuardianSettings()
  }, [token])

  const handleSaveGuardian = async () => {
    setIsSavingGuardian(true)
    try {
      if (!token) return
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/settings/guardian`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slaMinutes,
          criticalState,
          doubleTouchMinutes,
          tiempoRespuestaLeadSeg,
          tiempoVerdeMins,
          tiempoAmarilloMins,
        }),
      })
      if (!res.ok) throw new Error("Failed to save")
      toast.success("Configuracion guardada exitosamente")
    } catch (err) {
      console.error("Failed to save guardian settings:", err)
      toast.error("Error al guardar la configuracion")
    } finally {
      setIsSavingGuardian(false)
    }
  }

  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="bg-background text-foreground flex min-h-screen flex-col"
    >
      {/* Header */}
      <header className="border-border/40 sticky top-0 z-50 border-b bg-[#09090b]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <RolLogo size="sm" showTagline={false} showIcon={true} animate={false} />
            <div className="bg-border/40 hidden h-6 w-px sm:block" />
            <span className="text-muted-foreground hidden text-[11px] sm:block">
              Centro de Comando
            </span>
          </div>
          <div className="flex items-center gap-3">
            <HelpPanel />
            {user && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground hidden text-xs sm:block">
                  {user.name || user.email}
                </span>
                <Badge
                  variant="outline"
                  className="border-aura/30 text-aura text-[10px]"
                >
                  {user.role}
                </Badge>
              </div>
            )}
            {authStatus === "superadmin" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin")}
                className="text-aura hover:text-aura/80 h-8 gap-1.5 text-xs"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-muted-foreground hover:text-foreground h-8 gap-1.5 text-xs"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 px-6 py-6">
        {/* KPI Strip */}
        <motion.section {...fadeIn(0)}>
          <KPICards />
        </motion.section>

        {/* Tabs */}
        <Tabs defaultValue="intelligence" className="flex flex-col gap-4">
          <TabsList className="bg-secondary/60 border-border/40 h-10 w-full justify-start gap-1 border p-1">
            <TabsTrigger
              value="intelligence"
              className="data-[state=active]:bg-aura/10 data-[state=active]:text-aura gap-1.5 rounded-md px-4 text-xs"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Reportes
            </TabsTrigger>
            <TabsTrigger
              value="guardians"
              className="data-[state=active]:bg-aura/10 data-[state=active]:text-aura gap-1.5 rounded-md px-4 text-xs"
            >
              <Radio className="h-3.5 w-3.5" />
              Guardianes
            </TabsTrigger>
            <TabsTrigger
              value="config"
              className="data-[state=active]:bg-aura/10 data-[state=active]:text-aura gap-1.5 rounded-md px-4 text-xs"
            >
              <Settings className="h-3.5 w-3.5" />
              Configuracion
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Reportes */}
          <TabsContent value="intelligence" className="flex flex-col gap-4">
            {/* DESCRIPTIVOS */}
            <ReportGroup
              icon={<Eye className="text-info h-4 w-4" />}
              iconColor="text-info"
              iconBg="bg-info/10"
              title="Descriptivos"
              subtitle="Que esta pasando ahora mismo -- datos en tiempo real"
              badge="En Vivo"
              badgeColor="border-info/30 text-info"
              count={4}
              defaultOpen={true}
            >
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <motion.div {...fadeIn(0)}>
                  <IntelCPARealtime />
                </motion.div>
                <motion.div {...fadeIn(0.06)}>
                  <IntelAbandonment />
                </motion.div>
                <motion.div {...fadeIn(0.12)}>
                  <IntelOptimizer />
                </motion.div>
                <motion.div {...fadeIn(0.18)}>
                  <IntelScheduling />
                </motion.div>
              </div>
            </ReportGroup>

            {/* DIAGNOSTICOS */}
            <ReportGroup
              icon={<Search className="text-warning h-4 w-4" />}
              iconColor="text-warning"
              iconBg="bg-warning/10"
              title="Diagnosticos"
              subtitle="Por que esta pasando -- causas raiz y analisis"
              badge="Analisis"
              badgeColor="border-warning/30 text-warning"
              count={3}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <motion.div {...fadeIn(0)}>
                  <IntelLeakDiagnosis />
                </motion.div>
                <motion.div {...fadeIn(0.06)}>
                  <IntelCopywriter />
                </motion.div>
                <motion.div {...fadeIn(0.12)} className="xl:col-span-2">
                  <IntelROASTrend />
                </motion.div>
              </div>
            </ReportGroup>

            {/* PREDICTIVOS */}
            <ReportGroup
              icon={<TrendingUp className="text-rescue h-4 w-4" />}
              iconColor="text-rescue"
              iconBg="bg-rescue/10"
              title="Predictivos"
              subtitle="Que va a pasar -- proyecciones de ventas con IA"
              badge="Forecasting"
              badgeColor="border-rescue/30 text-rescue"
              count={1}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 gap-5">
                <motion.div {...fadeIn(0)}>
                  <IntelGoalPredictor />
                </motion.div>
              </div>
            </ReportGroup>
          </TabsContent>

          {/* TAB 2: Guardianes */}
          <TabsContent value="guardians" className="flex flex-col gap-4">
            {/* Operativos */}
            <ReportGroup
              icon={<Shield className="text-aura h-4 w-4" />}
              iconColor="text-aura"
              iconBg="bg-aura/10"
              title="Guardianes Operativos"
              subtitle="G1 y G2 ejecutan en tiempo real: rescatan leads y pausan campanas"
              badge="G1 + G2"
              badgeColor="border-aura/30 text-aura"
              count={2}
              defaultOpen={true}
            >
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
                <div className="flex flex-col gap-6">
                  <motion.div {...fadeIn(0)}>
                    <SLATracker
                      demoMode={false}
                      slaMinutes={slaMinutes}
                      doubleTouchMinutes={doubleTouchMinutes}
                    />
                  </motion.div>
                  <motion.div {...fadeIn(0.06)}>
                    <ROASGuardian />
                  </motion.div>
                </div>
                <aside>
                  <div className="sticky top-20">
                    <ActivityFeed slaMinutes={slaMinutes} />
                  </div>
                </aside>
              </div>
            </ReportGroup>

            {/* Estrategicos */}
            <ReportGroup
              icon={<Bot className="text-info h-4 w-4" />}
              iconColor="text-info"
              iconBg="bg-info/10"
              title="Guardianes Estrategicos"
              subtitle="G3 a G7 analizan, crean, optimizan, auditan y agendan"
              badge="G3 - G7"
              badgeColor="border-info/30 text-info"
              count={5}
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <motion.div {...fadeIn(0)}>
                  <GuardianCopywriter />
                </motion.div>
                <motion.div {...fadeIn(0.06)}>
                  <GuardianPredictive />
                </motion.div>
                <motion.div {...fadeIn(0.12)}>
                  <GuardianAuditor />
                </motion.div>
                <motion.div {...fadeIn(0.18)}>
                  <GuardianOptimizer />
                </motion.div>
                <motion.div {...fadeIn(0.24)} className="xl:col-span-2">
                  <GuardianScheduler />
                </motion.div>
              </div>
            </ReportGroup>

            {/* Historial */}
            <ReportGroup
              icon={<Search className="text-muted-foreground h-4 w-4" />}
              iconColor="text-muted-foreground"
              iconBg="bg-secondary"
              title="Historial de Rescates"
              subtitle="Comparacion forense: inaccion humana vs respuesta automatica"
              badge="Registro"
              badgeColor="border-border/40 text-muted-foreground"
              count={1}
              defaultOpen={false}
            >
              <motion.div {...fadeIn(0)}>
                <RescueHistory />
              </motion.div>
            </ReportGroup>
          </TabsContent>

          {/* TAB 3: Configuracion */}
          <TabsContent value="config" className="flex flex-col gap-4">
            <ReportGroup
              icon={<Settings className="text-aura h-4 w-4" />}
              iconColor="text-aura"
              iconBg="bg-aura/10"
              title="Estrategia de Guardianes"
              subtitle="Ajusta SLA, estados criticos y ventana de doble toque"
              badge="Parametros"
              badgeColor="border-aura/30 text-aura"
              count={1}
              defaultOpen={true}
            >
              <GuardianConfig
                slaMinutes={slaMinutes}
                onSlaChange={setSlaMinutes}
                criticalState={criticalState}
                onCriticalStateChange={setCriticalState}
                doubleTouchMinutes={doubleTouchMinutes}
                onDoubleTouchChange={setDoubleTouchMinutes}
                tiempoRespuestaLeadSeg={tiempoRespuestaLeadSeg}
                onTiempoRespuestaChange={setTiempoRespuestaLeadSeg}
                tiempoVerdeMins={tiempoVerdeMins}
                onTiempoVerdeChange={setTiempoVerdeMins}
                tiempoAmarilloMins={tiempoAmarilloMins}
                onTiempoAmarilloChange={setTiempoAmarilloMins}
                onSave={handleSaveGuardian}
                isSaving={isSavingGuardian}
              />
            </ReportGroup>

            <ReportGroup
              icon={<Shield className="text-alert h-4 w-4" />}
              iconColor="text-alert"
              iconBg="bg-alert/10"
              title="Boveda de Seguridad"
              subtitle="Credenciales encriptadas del ecosistema de integraciones"
              badge="Protegido"
              badgeColor="border-alert/30 text-alert"
              count={1}
              defaultOpen={false}
            >
              <SecurityVault />
            </ReportGroup>

            <ReportGroup
              icon={<Settings className="text-info h-4 w-4" />}
              iconColor="text-info"
              iconBg="bg-info/10"
              title="Mapeo de Estados CRM"
              subtitle="Traduce estados del CRM a estados internos de la app"
              badge="Integraciones"
              badgeColor="border-info/30 text-info"
              count={1}
              defaultOpen={false}
            >
              <CrmStateMapping token={token ?? ""} />
            </ReportGroup>
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-border/30 border-t px-6 py-5">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between">
          <div className="flex items-center gap-3">
            <RolIcon size={24} animate={false} />
            <div className="flex flex-col">
              <span className="text-foreground/60 text-xs font-medium">Rol.IA v2.0</span>
              <span className="text-muted-foreground/40 text-[10px]">La IA no piensa por uno, piensa con uno</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-border/30 hidden h-4 w-px sm:block" />
            <p className="text-muted-foreground/40 text-[11px]">
              7 Guardianes Autonomos
            </p>
          </div>
        </div>
      </footer>
    </motion.div>
  )
}
