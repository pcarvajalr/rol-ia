
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Pencil,
  TrendingUp,
  Search,
  Rocket,
  CalendarCheck,
  Eye,
  Shield,
  Sparkles,
  BarChart3,
  Brain,
  ArrowRight,
  DollarSign,
  PhoneCall,
  MessageCircle,
  Mail,
  FileText,
  AlertTriangle,
  Target,
  Palette,
} from "lucide-react"

/* ─── Shared types ─── */

interface ActionStep {
  icon: React.ReactNode
  label: string
  description: string
}

function GuardianActionList({ actions, active }: { actions: ActionStep[]; active: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {actions.map((a, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08, duration: 0.25 }}
          className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${
            active ? "bg-aura/5 border-aura/10 border" : "bg-secondary/30 border-border/30 border"
          }`}
        >
          <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs ${
            active ? "bg-aura/15 text-aura" : "bg-secondary text-muted-foreground"
          }`}>
            {a.icon}
          </span>
          <div className="flex flex-col gap-0.5">
            <span className={`text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>
              {a.label}
            </span>
            <span className="text-muted-foreground text-[11px] leading-relaxed">{a.description}</span>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════
   G3 - Copywriter Estrategico
   ═══════════════════════════════════════ */

export function GuardianCopywriter() {
  const [active, setActive] = useState(false)

  const actions: ActionStep[] = [
    {
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      label: "Analisis de Angulo",
      description: "Toma el reporte del Guardian de Pauta (G2) y analiza que angulo de venta fallo.",
    },
    {
      icon: <Sparkles className="h-3.5 w-3.5" />,
      label: "Creacion de Hooks",
      description: "Genera 3 variaciones de ganchos basados en psicologia de ventas y datos del CRM.",
    },
    {
      icon: <Palette className="h-3.5 w-3.5" />,
      label: "Briefing de Diseno",
      description: "Crea un prompt para el disenador con imagen, tono y formato sugerido para el anuncio.",
    },
  ]

  return (
    <Card className="border-aura/20 bg-card">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-base">
            <span className="bg-info/20 text-info inline-flex h-6 w-6 items-center justify-center rounded-md text-xs">
              G3
            </span>
            Copywriter Estrategico
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {active ? <Shield className="text-aura h-3.5 w-3.5" /> : <Eye className="text-muted-foreground h-3.5 w-3.5" />}
              <span className={`text-xs font-medium ${active ? "text-aura" : "text-muted-foreground"}`}>
                {active ? "Guardian Activo" : "Modo Observador"}
              </span>
              <Switch checked={active} onCheckedChange={setActive} className="data-[state=checked]:bg-aura" />
            </div>
          </div>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          No solo pausa campanas, propone soluciones de mercado generando copys alternativos y briefs de diseno.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <GuardianActionList actions={actions} active={active} />
        <AnimatePresence>
          {!active && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-secondary/50 border-border/50 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs"
            >
              <Eye className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="text-muted-foreground">
                Modo Observador: registra que angulos falla pero no genera copys automaticamente.
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}

/* ═══════════════════════════════════════
   G4 - Analista Predictivo
   ═══════════════════════════════════════ */

export function GuardianPredictive() {
  const [active, setActive] = useState(false)

  const actions: ActionStep[] = [
    {
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      label: "Entrenamiento de Regresion",
      description: "Toma los ultimos 30 dias de datos y entrena un modelo de regresion para proyectar ventas.",
    },
    {
      icon: <Target className="h-3.5 w-3.5" />,
      label: "Proyeccion de Cobertura",
      description: "Calcula si al ritmo actual se cubriran los gastos fijos del mes ($8M COP).",
    },
    {
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      label: "Alerta Temprana",
      description: "Si la proyeccion es < 100%, emite alerta de 'Ajuste de Estrategia Requerido' al equipo.",
    },
  ]

  return (
    <Card className="border-aura/20 bg-card">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-base">
            <span className="bg-rescue/20 text-rescue inline-flex h-6 w-6 items-center justify-center rounded-md text-xs">
              G4
            </span>
            Analista Predictivo
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {active ? <Shield className="text-aura h-3.5 w-3.5" /> : <Eye className="text-muted-foreground h-3.5 w-3.5" />}
              <span className={`text-xs font-medium ${active ? "text-aura" : "text-muted-foreground"}`}>
                {active ? "Guardian Activo" : "Modo Observador"}
              </span>
              <Switch checked={active} onCheckedChange={setActive} className="data-[state=checked]:bg-aura" />
            </div>
          </div>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Evita las sorpresas de fin de mes proyectando ventas y alertando cuando la meta esta en riesgo.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <GuardianActionList actions={actions} active={active} />
        <AnimatePresence>
          {!active && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-secondary/50 border-border/50 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs"
            >
              <Eye className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="text-muted-foreground">
                Modo Observador: calcula proyecciones pero no envia alertas automaticas al equipo.
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}

/* ═══════════════════════════════════════
   G5 - Auditor de Fugas
   ═══════════════════════════════════════ */

export function GuardianAuditor() {
  const [active, setActive] = useState(false)

  const actions: ActionStep[] = [
    {
      icon: <FileText className="h-3.5 w-3.5" />,
      label: "Clasificacion de Notas",
      description: "Lee las notas que dejan los vendedores en el CRM y las clasifica automaticamente.",
    },
    {
      icon: <Brain className="h-3.5 w-3.5" />,
      label: "Analisis de Sentimiento",
      description: "Determina si el lead era 'basura' (mala pauta) o un 'error de cierre' (falla del vendedor).",
    },
    {
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      label: "Mapa de Calor",
      description: "Genera el grafico de burbujas en Diagnostico de Fuga con los motivos reales de perdida.",
    },
  ]

  return (
    <Card className="border-aura/20 bg-card">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-base">
            <span className="bg-warning/20 text-warning inline-flex h-6 w-6 items-center justify-center rounded-md text-xs">
              G5
            </span>
            Auditor de Fugas
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {active ? <Shield className="text-aura h-3.5 w-3.5" /> : <Eye className="text-muted-foreground h-3.5 w-3.5" />}
              <span className={`text-xs font-medium ${active ? "text-aura" : "text-muted-foreground"}`}>
                {active ? "Guardian Activo" : "Modo Observador"}
              </span>
              <Switch checked={active} onCheckedChange={setActive} className="data-[state=checked]:bg-aura" />
            </div>
          </div>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Entiende por que la gente no compra analizando notas del CRM y clasificando motivos de perdida.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <GuardianActionList actions={actions} active={active} />
        <AnimatePresence>
          {!active && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-secondary/50 border-border/50 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs"
            >
              <Eye className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="text-muted-foreground">
                Modo Observador: lee notas del CRM pero no genera clasificaciones automaticamente.
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}

/* ═══════════════════════════════════════
   G6 - Optimizador de Conversion
   ═══════════════════════════════════════ */

export function GuardianOptimizer() {
  const [active, setActive] = useState(false)

  const actions: ActionStep[] = [
    {
      icon: <Search className="h-3.5 w-3.5" />,
      label: "Deteccion de Ganadores",
      description: "Identifica anuncios con el CPL mas bajo y estable para escalar inversion.",
    },
    {
      icon: <DollarSign className="h-3.5 w-3.5" />,
      label: "Sugerencia de Presupuesto",
      description: "Recomienda mover presupuesto de anuncios pausados por G2 hacia los ganadores detectados.",
    },
    {
      icon: <Rocket className="h-3.5 w-3.5" />,
      label: "Escalado Automatico",
      description: "Si esta activo, ejecuta la redistribucion automaticamente via API de Meta/Google.",
    },
  ]

  return (
    <Card className="border-aura/20 bg-card">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-base">
            <span className="bg-aura/20 text-aura inline-flex h-6 w-6 items-center justify-center rounded-md text-xs">
              G6
            </span>
            Optimizador de Conversion
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {active ? <Shield className="text-aura h-3.5 w-3.5" /> : <Eye className="text-muted-foreground h-3.5 w-3.5" />}
              <span className={`text-xs font-medium ${active ? "text-aura" : "text-muted-foreground"}`}>
                {active ? "Guardian Activo" : "Modo Observador"}
              </span>
              <Switch checked={active} onCheckedChange={setActive} className="data-[state=checked]:bg-aura" />
            </div>
          </div>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Decide donde meter mas dinero identificando ganadores y redistribuyendo presupuesto automaticamente.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <GuardianActionList actions={actions} active={active} />
        <AnimatePresence>
          {!active && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-secondary/50 border-border/50 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs"
            >
              <Eye className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="text-muted-foreground">
                Modo Observador: detecta ganadores y sugiere presupuesto pero no redistribuye automaticamente.
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}

/* ═══════════════════════════════════════
   G7 - Agente de Agendamiento
   ═══════════════════════════════════════ */

export function GuardianScheduler() {
  const [active, setActive] = useState(true)

  const actions: ActionStep[] = [
    {
      icon: <PhoneCall className="h-3.5 w-3.5" />,
      label: "Cierre de Cita",
      description: "Confirma disponibilidad en Google Calendar de la agencia durante la llamada de voz IA.",
    },
    {
      icon: <CalendarCheck className="h-3.5 w-3.5" />,
      label: "Agendamiento Automatico",
      description: "Reserva el slot disponible y genera enlace de Google Meet automaticamente.",
    },
    {
      icon: <Mail className="h-3.5 w-3.5" />,
      label: "Confirmacion Omnicanal",
      description: "Envia correo electronico y WhatsApp con el link de la reunión y detalles de la cita.",
    },
  ]

  return (
    <Card className="border-aura/20 bg-card">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-base">
            <span className="bg-alert/20 text-alert inline-flex h-6 w-6 items-center justify-center rounded-md text-xs">
              G7
            </span>
            Agente de Agendamiento
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {active ? <Shield className="text-aura h-3.5 w-3.5" /> : <Eye className="text-muted-foreground h-3.5 w-3.5" />}
              <span className={`text-xs font-medium ${active ? "text-aura" : "text-muted-foreground"}`}>
                {active ? "Guardian Activo" : "Modo Observador"}
              </span>
              <Switch checked={active} onCheckedChange={setActive} className="data-[state=checked]:bg-aura" />
            </div>
          </div>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Es el que pone la cara (la voz) por la agencia: cierra citas y confirma por todos los canales.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <GuardianActionList actions={actions} active={active} />
        <AnimatePresence>
          {!active && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-secondary/50 border-border/50 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs"
            >
              <Eye className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="text-muted-foreground">
                Modo Observador: detecta oportunidades de cita pero no agenda automaticamente.
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
