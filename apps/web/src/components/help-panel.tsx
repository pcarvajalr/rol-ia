
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  HelpCircle,
  BarChart3,
  TrendingUp,
  Users,
  Brain,
  Shield,
  Radio,
  Settings,
  Activity,
  ChevronRight,
  Eye,
  Zap,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Target,
  Pause,
  Pencil,
  Rocket,
  Search,
  CalendarCheck,
  PhoneCall,
  FileText,
  Sparkles,
  DollarSign,
  Mail,
  Palette,
  Bot,
  Video,
  TrendingDown,
} from "lucide-react"

type SectionId =
  | "cpa"
  | "semaforo"
  | "optimizer"
  | "scheduling"
  | "diagnostico"
  | "copywriter"
  | "roas-trend"
  | "predictor"
  | "g1"
  | "g2"
  | "g3"
  | "g4"
  | "g5"
  | "g6"
  | "g7"
  | "config-estrategia"
  | "config-boveda"

interface HelpSection {
  id: SectionId
  title: string
  icon: React.ReactNode
  category: string
  subcategory?: string
}

const sections: HelpSection[] = [
  /* Descriptivos */
  { id: "cpa", title: "CPA Real-Time", icon: <Activity className="h-4 w-4" />, category: "Reportes", subcategory: "Descriptivos" },
  { id: "semaforo", title: "Semaforo de Abandono", icon: <Users className="h-4 w-4" />, category: "Reportes", subcategory: "Descriptivos" },
  { id: "optimizer", title: "Optimizador de Conversion", icon: <Rocket className="h-4 w-4" />, category: "Reportes", subcategory: "Descriptivos" },
  { id: "scheduling", title: "Agenda en Vivo", icon: <CalendarCheck className="h-4 w-4" />, category: "Reportes", subcategory: "Descriptivos" },
  /* Diagnosticos */
  { id: "diagnostico", title: "Diagnostico de Fuga", icon: <Brain className="h-4 w-4" />, category: "Reportes", subcategory: "Diagnosticos" },
  { id: "copywriter", title: "Copywriter IA", icon: <Pencil className="h-4 w-4" />, category: "Reportes", subcategory: "Diagnosticos" },
  { id: "roas-trend", title: "Tendencia ROAS", icon: <Radio className="h-4 w-4" />, category: "Reportes", subcategory: "Diagnosticos" },
  /* Predictivos */
  { id: "predictor", title: "Predictor de Metas", icon: <TrendingUp className="h-4 w-4" />, category: "Reportes", subcategory: "Predictivos" },
  /* Guardianes */
  { id: "g1", title: "G1 - Guardian de Leads", icon: <Shield className="h-4 w-4" />, category: "Guardianes" },
  { id: "g2", title: "G2 - Guardian de Pauta", icon: <Radio className="h-4 w-4" />, category: "Guardianes" },
  { id: "g3", title: "G3 - Copywriter Estrategico", icon: <Pencil className="h-4 w-4" />, category: "Guardianes" },
  { id: "g4", title: "G4 - Analista Predictivo", icon: <TrendingUp className="h-4 w-4" />, category: "Guardianes" },
  { id: "g5", title: "G5 - Auditor de Fugas", icon: <Search className="h-4 w-4" />, category: "Guardianes" },
  { id: "g6", title: "G6 - Optimizador de Conversion", icon: <Rocket className="h-4 w-4" />, category: "Guardianes" },
  { id: "g7", title: "G7 - Agente de Agendamiento", icon: <CalendarCheck className="h-4 w-4" />, category: "Guardianes" },
  /* Config */
  { id: "config-estrategia", title: "Ajustes de Estrategia", icon: <Settings className="h-4 w-4" />, category: "Configuracion" },
  { id: "config-boveda", title: "Boveda de Seguridad", icon: <Lock className="h-4 w-4" />, category: "Configuracion" },
]

/* ── Shared blocks ── */

function HelpBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-foreground text-xs font-semibold">{title}</h4>
      <div className="text-muted-foreground flex flex-col gap-1.5 text-xs leading-relaxed">{children}</div>
    </div>
  )
}

function HelpTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-aura/5 border-aura/15 flex items-start gap-2 rounded-lg border p-3">
      <Zap className="text-aura mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="text-muted-foreground text-xs leading-relaxed">{children}</span>
    </div>
  )
}

function LegendItem({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
      <div>
        <span className="text-foreground text-xs font-medium">{label}: </span>
        <span className="text-muted-foreground text-xs">{desc}</span>
      </div>
    </div>
  )
}

function StepItem({ n, label, desc }: { n: number; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="bg-aura/20 text-aura inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold">{n}</span>
      <div>
        <strong className="text-foreground">{label}:</strong>{" "}
        <span className="text-muted-foreground">{desc}</span>
      </div>
    </div>
  )
}

/* ── Home ── */

const subcatConfig: Record<string, { icon: React.ReactNode; color: string; desc: string }> = {
  Descriptivos: {
    icon: <Eye className="h-3.5 w-3.5" />,
    color: "text-info",
    desc: "Que esta pasando ahora: datos en tiempo real.",
  },
  Diagnosticos: {
    icon: <Search className="h-3.5 w-3.5" />,
    color: "text-warning",
    desc: "Por que esta pasando: causas raiz y analisis.",
  },
  Predictivos: {
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    color: "text-rescue",
    desc: "Que va a pasar: proyecciones de IA.",
  },
}

function HelpHome({ onNavigate }: { onNavigate: (id: SectionId) => void }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="flex flex-col gap-2">
        <div className="bg-aura/10 border-aura/20 mx-auto flex h-12 w-12 items-center justify-center rounded-xl border">
          <Zap className="text-aura h-6 w-6" />
        </div>
        <h3 className="text-foreground text-center text-base font-semibold">Centro de Ayuda</h3>
        <p className="text-muted-foreground text-center text-xs leading-relaxed">
          Reportes organizados en 3 niveles de analisis + 7 guardianes autonomos + configuracion.
        </p>
      </div>

      {/* Quick reference */}
      <div className="bg-secondary/40 border-border/40 rounded-lg border p-4">
        <h4 className="text-foreground mb-3 text-xs font-semibold uppercase tracking-wider">Como leer los reportes</h4>
        <div className="flex flex-col gap-3 text-xs leading-relaxed">
          {Object.entries(subcatConfig).map(([key, cfg]) => (
            <div key={key} className="flex items-start gap-2">
              <span className={cfg.color}>{cfg.icon}</span>
              <span className="text-muted-foreground"><strong className={cfg.color}>{key}:</strong> {cfg.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Reportes by subcategory */}
      <div className="flex flex-col gap-4">
        <h4 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Reportes</h4>
        {["Descriptivos", "Diagnosticos", "Predictivos"].map((sub) => {
          const cfg = subcatConfig[sub]
          const items = sections.filter((s) => s.subcategory === sub)
          return (
            <div key={sub} className="flex flex-col gap-1.5">
              <div className={`flex items-center gap-1.5 text-[11px] font-medium ${cfg.color}`}>
                {cfg.icon}
                {sub}
              </div>
              {items.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onNavigate(s.id)}
                  className="border-border/30 hover:bg-secondary/60 hover:border-aura/20 ml-5 flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors"
                >
                  <div className="text-aura">{s.icon}</div>
                  <span className="text-foreground flex-1 text-xs font-medium">{s.title}</span>
                  <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          )
        })}
      </div>

      {/* Guardianes */}
      <div className="flex flex-col gap-2">
        <h4 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Guardianes</h4>
        <div className="flex flex-col gap-1">
          {sections
            .filter((s) => s.category === "Guardianes")
            .map((s) => (
              <button
                key={s.id}
                onClick={() => onNavigate(s.id)}
                className="border-border/30 hover:bg-secondary/60 hover:border-aura/20 flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors"
              >
                <div className="text-aura">{s.icon}</div>
                <span className="text-foreground flex-1 text-xs font-medium">{s.title}</span>
                <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
              </button>
            ))}
        </div>
      </div>

      {/* Configuracion */}
      <div className="flex flex-col gap-2">
        <h4 className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">Configuracion</h4>
        <div className="flex flex-col gap-1">
          {sections
            .filter((s) => s.category === "Configuracion")
            .map((s) => (
              <button
                key={s.id}
                onClick={() => onNavigate(s.id)}
                className="border-border/30 hover:bg-secondary/60 hover:border-aura/20 flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors"
              >
                <div className="text-aura">{s.icon}</div>
                <span className="text-foreground flex-1 text-xs font-medium">{s.title}</span>
                <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}

/* ── Detail router ── */

function HelpDetail({ sectionId, onBack }: { sectionId: SectionId; onBack: () => void }) {
  const section = sections.find((s) => s.id === sectionId)!
  const tagLabel = section.subcategory ?? section.category
  const tagColor = section.subcategory
    ? subcatConfig[section.subcategory]?.color ?? "text-aura"
    : "text-aura"

  const contentMap: Record<SectionId, React.ReactNode> = {
    cpa: <CPAHelp />,
    semaforo: <SemaforoHelp />,
    optimizer: <OptimizerHelp />,
    scheduling: <SchedulingHelp />,
    diagnostico: <DiagnosticoHelp />,
    copywriter: <CopywriterHelp />,
    "roas-trend": <ROASTrendHelp />,
    predictor: <PredictorHelp />,
    g1: <G1Help />,
    g2: <G2Help />,
    g3: <G3Help />,
    g4: <G4Help />,
    g5: <G5Help />,
    g6: <G6Help />,
    g7: <G7Help />,
    "config-estrategia": <ConfigEstrategiaHelp />,
    "config-boveda": <ConfigBovedaHelp />,
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-aura flex w-fit items-center gap-1 text-xs transition-colors">
          <ChevronRight className="h-3 w-3 rotate-180" />
          Volver al indice
        </button>
        <div className="flex items-center gap-2.5">
          <div className="bg-aura/10 flex h-8 w-8 items-center justify-center rounded-lg">
            <span className="text-aura">{section.icon}</span>
          </div>
          <div>
            <h3 className="text-foreground text-sm font-semibold">{section.title}</h3>
            <span className={`text-[11px] ${tagColor}`}>{tagLabel}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4">{contentMap[sectionId]}</div>
    </div>
  )
}

/* ═══════════════════════════════════════
   DESCRIPTIVOS
   ═══════════════════════════════════════ */

function CPAHelp() {
  return (
    <>
      <HelpBlock title="Que muestra">
        <p>Gasto vs. conversiones de Meta y Google <strong className="text-foreground">minuto a minuto</strong>. Es la foto instantanea de si el dinero invertido esta generando resultados ahora.</p>
      </HelpBlock>
      <HelpBlock title="Como leerlo">
        <LegendItem color="bg-info" label="Azul solida" desc="Gasto en Meta cada 10 minutos." />
        <LegendItem color="bg-warning" label="Amarilla solida" desc="Gasto en Google cada 10 minutos." />
        <LegendItem color="bg-aura" label="Violeta punteada" desc="Conversiones de Meta." />
        <LegendItem color="bg-rescue" label="Verde punteada" desc="Conversiones de Google." />
      </HelpBlock>
      <HelpBlock title="Badge CPA">
        <p>Gasto Total / Conversiones Totales. Mas bajo = mejor. Se actualiza cada 4 seg.</p>
      </HelpBlock>
      <HelpTip>Si las lineas solidas suben pero las punteadas bajan, el CPA se dispara. Activa G2 para pausar campanas ineficientes automaticamente.</HelpTip>
    </>
  )
}

function SemaforoHelp() {
  return (
    <>
      <HelpBlock title="Que muestra">
        <p>Cada lead pendiente de contacto con un <strong className="text-foreground">cronometro vivo</strong> que mide cuanto tiempo lleva sin recibir respuesta.</p>
      </HelpBlock>
      <HelpBlock title="Semaforo de colores">
        <LegendItem color="bg-alert" label="Rojo" desc="Mas de 10 min sin respuesta. Critico: la probabilidad de cierre cae drasticamente." />
        <LegendItem color="bg-warning" label="Naranja" desc="Entre 5 y 10 min. Urgente: hay que actuar ya." />
        <LegendItem color="bg-rescue" label="Verde" desc="Menos de 5 min. OK: aun a tiempo." />
      </HelpBlock>
      <HelpBlock title="Tiempo de Agonia">
        <p>Cronometro que avanza segundo a segundo. Cada segundo extra reduce la probabilidad de cierre.</p>
      </HelpBlock>
      <HelpTip>Este panel alimenta a G1 (Guardian de Leads). Cuando un lead pasa a rojo, G1 interviene automaticamente.</HelpTip>
    </>
  )
}

function OptimizerHelp() {
  return (
    <>
      <HelpBlock title="Que muestra">
        <p>El <strong className="text-foreground">Costo Por Lead (CPL)</strong> de cada anuncio activo. Identifica ganadores y perdedores en tiempo real.</p>
      </HelpBlock>
      <HelpBlock title="Grafico de barras">
        <LegendItem color="bg-rescue" label="Verde" desc="Anuncio ganador: CPL bajo y estable." />
        <LegendItem color="bg-alert" label="Rojo" desc="Anuncio perdedor: CPL alto o subiendo." />
        <LegendItem color="bg-muted-foreground" label="Gris" desc="Anuncio pausado por G2." />
      </HelpBlock>
      <HelpBlock title="Tabla de redistribucion">
        <p><strong className="text-foreground">Trend:</strong> Flecha verde = CPL baja (bueno). Roja = sube (malo). Amarilla = estable.</p>
        <p><strong className="text-foreground">Sugerido:</strong> Presupuesto que G6 recomienda. Verde = aumentar, rojo = reducir.</p>
      </HelpBlock>
      <HelpTip>El badge muestra el dinero reasignable: capital que puede moverse de perdedores a ganadores sin tocar el presupuesto total.</HelpTip>
    </>
  )
}

function SchedulingHelp() {
  return (
    <>
      <HelpBlock title="Que muestra">
        <p>Las <strong className="text-foreground">citas del dia</strong> agendadas automaticamente por G7. Muestra estado de confirmacion en tiempo real.</p>
      </HelpBlock>
      <HelpBlock title="Estados">
        <LegendItem color="bg-rescue" label="Confirmada" desc="El lead confirmo por WhatsApp o correo." />
        <LegendItem color="bg-warning" label="En curso" desc="La cita esta sucediendo ahora mismo." />
        <LegendItem color="bg-muted-foreground" label="Pendiente" desc="Agendada pero sin confirmacion aun." />
      </HelpBlock>
      <HelpBlock title="Canal">
        <p>Icono de telefono = cita cerrada por voz IA. Icono de video = cerrada por WhatsApp.</p>
      </HelpBlock>
      <HelpTip>G7 envia recordatorio automatico 30 min antes. Las pendientes se van confirmando solas conforme los leads responden.</HelpTip>
    </>
  )
}

/* ═══════════════════════════════════════
   DIAGNOSTICOS
   ═══════════════════════════════════════ */

function DiagnosticoHelp() {
  return (
    <>
      <HelpBlock title="Que muestra">
        <p>Clasifica los <strong className="text-foreground">motivos de no contacto</strong> para entender por que los leads no se convierten.</p>
      </HelpBlock>
      <HelpBlock title="Grafico de burbujas">
        <p><strong className="text-foreground">Eje X:</strong> Frecuencia (%). Mas a la derecha = ocurre mas seguido.</p>
        <p><strong className="text-foreground">Eje Y:</strong> Impacto (0-100). Mas arriba = mas danino para el negocio.</p>
        <p><strong className="text-foreground">Tamano:</strong> Volumen de leads afectados por ese motivo.</p>
      </HelpBlock>
      <HelpBlock title="Zona critica">
        <p>Esquina superior derecha = problemas frecuentes Y de alto impacto. Resolver estos primero da el mayor retorno.</p>
      </HelpBlock>
      <HelpTip>G5 (Auditor de Fugas) alimenta este panel automaticamente leyendo notas del CRM.</HelpTip>
    </>
  )
}

function CopywriterHelp() {
  return (
    <>
      <HelpBlock title="Que muestra">
        <p>Analiza <strong className="text-foreground">que angulo de venta fallo</strong> en los anuncios pausados y propone variaciones creativas.</p>
      </HelpBlock>
      <HelpBlock title="Hooks generados">
        <p>Cada hook tiene un <strong className="text-foreground">score</strong> (0-100%) que estima la probabilidad de conectar con la audiencia, y un <strong className="text-foreground">angulo</strong> (Dolor, Urgencia, Frustracion, etc.).</p>
      </HelpBlock>
      <HelpBlock title="Brief de Diseno">
        <p>Tono visual, paleta, formato (video/carrusel) y CTA sugerido para que el disenador sepa exactamente que crear.</p>
      </HelpBlock>
      <HelpTip>Cuando G3 esta activo, genera copys automaticamente cada vez que G2 pausa una campana.</HelpTip>
    </>
  )
}

function ROASTrendHelp() {
  return (
    <>
      <HelpBlock title="Que muestra">
        <p>La <strong className="text-foreground">tendencia semanal del ROAS</strong> (Return on Ad Spend) de Meta y Google. Muestra si la inversion publicitaria esta rindiendo o deteriorandose.</p>
      </HelpBlock>
      <HelpBlock title="Como leerlo">
        <LegendItem color="bg-info" label="Azul" desc="ROAS de Meta durante la semana." />
        <LegendItem color="bg-warning" label="Amarilla" desc="ROAS de Google durante la semana." />
        <p><strong className="text-foreground">Linea roja punteada:</strong> Umbral de 1.5x. Por debajo, la campana pierde dinero.</p>
      </HelpBlock>
      <HelpBlock title="Metricas actuales">
        <p>Los valores grandes al fondo muestran el ROAS de hoy: verde si esta sobre 1.5x, rojo si esta debajo.</p>
      </HelpBlock>
      <HelpTip>Este panel es el dato que G2 usa para decidir si pausar una campana. Si ambas lineas cruzan el umbral, G2 actua.</HelpTip>
    </>
  )
}

/* ═══════════════════════════════════════
   PREDICTIVOS
   ═══════════════════════════════════════ */

function PredictorHelp() {
  return (
    <>
      <HelpBlock title="Que muestra">
        <p>Usa <strong className="text-foreground">regresion lineal</strong> sobre datos reales para proyectar si se alcanzara la meta mensual de ventas.</p>
      </HelpBlock>
      <HelpBlock title="Como leerlo">
        <LegendItem color="bg-aura" label="Violeta solida" desc="Ventas reales acumuladas hasta hoy." />
        <LegendItem color="bg-rescue" label="Verde punteada" desc="Proyeccion IA (forecasting) hacia fin de mes." />
        <LegendItem color="bg-alert/50" label="Roja horizontal" desc="Meta del mes. Si la proyeccion queda debajo, hay riesgo." />
      </HelpBlock>
      <HelpBlock title="Badge de cobertura">
        <p>Porcentaje proyectado de la meta: verde = se alcanza, rojo = faltan ventas. Es la metrica mas importante del panel.</p>
      </HelpBlock>
      <HelpTip>G4 (Analista Predictivo) usa estos datos para emitir alertas tempranas cuando la proyeccion cae debajo del 100%.</HelpTip>
    </>
  )
}

/* ═══════════════════════════════════════
   GUARDIANES G1-G7
   ═══════════════════════════════════════ */

function G1Help() {
  return (
    <>
      <HelpBlock title="Que hace">
        <p><strong className="text-foreground">Rescata leads abandonados.</strong> Cuando un vendedor no responde dentro del SLA, Rol.IA toma el control con una secuencia omnicanal automatica.</p>
      </HelpBlock>
      <HelpBlock title="Secuencia de 5 pasos">
        <StepItem n={1} label="CRM Check" desc="Verifica estado del lead en Clientify." />
        <StepItem n={2} label="WhatsApp" desc="Envia mensaje personalizado." />
        <StepItem n={3} label="Doble Toque" desc="Espera X min configurados para dar chance de respuesta." />
        <StepItem n={4} label="Llamada IA" desc="Asistente de voz llama al lead." />
        <StepItem n={5} label="Agenda" desc="Si hay interes, G7 agenda la cita automaticamente." />
      </HelpBlock>
      <HelpBlock title="Barra de progreso">
        <p><span className="text-muted-foreground">Gris</span> = ventana humana. <span className="text-aura">Violeta</span> = IA interviniendo. <span className="text-rescue">Verde</span> = rescate completado.</p>
      </HelpBlock>
      <HelpBlock title="Reporte conectado">
        <p>El Semaforo de Abandono (Descriptivo) muestra en tiempo real los leads que G1 esta vigilando.</p>
      </HelpBlock>
      <HelpTip>Usa Modo Demo para comprimir la simulacion de 7 min a 15 segundos durante presentaciones.</HelpTip>
    </>
  )
}

function G2Help() {
  return (
    <>
      <HelpBlock title="Que hace">
        <p><strong className="text-foreground">Pausa campanas ineficientes.</strong> Cuando el ROAS cae debajo de 1.5x, detiene la campana para evitar quemar presupuesto.</p>
      </HelpBlock>
      <HelpBlock title="Como actua">
        <StepItem n={1} label="Monitoreo" desc="Revisa ROAS cada hora en Meta y Google." />
        <StepItem n={2} label="Deteccion" desc="Si ROAS < 1.5x por 2 periodos consecutivos, marca como critico." />
        <StepItem n={3} label="Pausa" desc="Detiene la campana via API y notifica al equipo." />
      </HelpBlock>
      <HelpBlock title="Reportes conectados">
        <p>Tendencia ROAS (Diagnostico) muestra los datos que G2 analiza. CPA Real-Time (Descriptivo) refleja el impacto inmediato.</p>
      </HelpBlock>
      <HelpBlock title="Cadena de reaccion">
        <p>Cuando G2 pausa: G3 genera copys alternativos y G6 redistribuye el presupuesto liberado.</p>
      </HelpBlock>
      <HelpTip>En Modo Observador detecta ROAS bajo pero no pausa. Util para entender patrones antes de activar.</HelpTip>
    </>
  )
}

function G3Help() {
  return (
    <>
      <HelpBlock title="Que hace">
        <p><strong className="text-foreground">No solo detecta el problema, propone la solucion creativa.</strong> Genera copys alternativos y briefs de diseno para reactivar anuncios pausados.</p>
      </HelpBlock>
      <HelpBlock title="Secuencia">
        <StepItem n={1} label="Analisis de Angulo" desc="Toma el reporte de G2 y analiza que angulo de venta fallo." />
        <StepItem n={2} label="Creacion de Hooks" desc="Genera 3 ganchos basados en psicologia de ventas y datos del CRM." />
        <StepItem n={3} label="Briefing de Diseno" desc="Crea un brief para el disenador con imagen, tono y formato sugerido." />
      </HelpBlock>
      <HelpBlock title="Reporte conectado">
        <p>Copywriter IA (Diagnostico) muestra los hooks y briefs que G3 genera.</p>
      </HelpBlock>
      <HelpTip>{'Trabaja en cadena con G2: pausa -> analisis -> nueva propuesta creativa. El ciclo completo toma segundos.'}</HelpTip>
    </>
  )
}

function G4Help() {
  return (
    <>
      <HelpBlock title="Que hace">
        <p><strong className="text-foreground">Evita sorpresas de fin de mes.</strong> Proyecta si se cubriran los gastos fijos al ritmo actual de ventas y alerta tempranamente.</p>
      </HelpBlock>
      <HelpBlock title="Secuencia">
        <StepItem n={1} label="Entrenamiento" desc="Usa datos de 30 dias para entrenar modelo de regresion." />
        <StepItem n={2} label="Proyeccion" desc="Calcula si se cubriran los $8M COP de gastos fijos." />
        <StepItem n={3} label="Alerta Temprana" desc="Si proyeccion < 100%, emite alerta de 'Ajuste Requerido'." />
      </HelpBlock>
      <HelpBlock title="Reporte conectado">
        <p>Predictor de Metas (Predictivo) muestra la grafica que G4 analiza con la linea de forecasting.</p>
      </HelpBlock>
      <HelpTip>La alerta temprana permite reaccionar a medio mes en vez de descubrir el deficit al cierre.</HelpTip>
    </>
  )
}

function G5Help() {
  return (
    <>
      <HelpBlock title="Que hace">
        <p><strong className="text-foreground">Analisis forense de por que no se compra.</strong> Lee notas del CRM, clasifica motivos y genera el mapa de calor.</p>
      </HelpBlock>
      <HelpBlock title="Secuencia">
        <StepItem n={1} label="Lectura de Notas" desc="Lee las notas que dejan vendedores en el CRM." />
        <StepItem n={2} label="Clasificacion" desc="Determina si fue 'basura' (mala pauta) o 'error de cierre' (falla del vendedor)." />
        <StepItem n={3} label="Mapa de Calor" desc="Genera el grafico de burbujas con motivos reales de perdida." />
      </HelpBlock>
      <HelpBlock title="Reporte conectado">
        <p>Diagnostico de Fuga (Diagnostico) muestra los resultados que G5 clasifica automaticamente.</p>
      </HelpBlock>
      <HelpTip>Sin G5, los motivos de perdida son anecdotas. Con G5 activo, se convierten en datos accionables.</HelpTip>
    </>
  )
}

function G6Help() {
  return (
    <>
      <HelpBlock title="Que hace">
        <p><strong className="text-foreground">Decide donde meter mas dinero.</strong> Identifica anuncios ganadores y redistribuye presupuesto automaticamente via API.</p>
      </HelpBlock>
      <HelpBlock title="Secuencia">
        <StepItem n={1} label="Deteccion" desc="Identifica anuncios con CPL bajo y estable." />
        <StepItem n={2} label="Sugerencia" desc="Recomienda mover presupuesto de pausados a ganadores." />
        <StepItem n={3} label="Escalado" desc="Si activo, ejecuta redistribucion via API de Meta/Google." />
      </HelpBlock>
      <HelpBlock title="Reporte conectado">
        <p>Optimizador de Conversion (Descriptivo) muestra los datos que G6 usa para redistribuir.</p>
      </HelpBlock>
      <HelpTip>G2 pausa, G6 redistribuye: el presupuesto liberado fluye automaticamente a los anuncios que si funcionan.</HelpTip>
    </>
  )
}

function G7Help() {
  return (
    <>
      <HelpBlock title="Que hace">
        <p><strong className="text-foreground">Pone la cara (la voz) por la agencia.</strong> Cierra citas por telefono y confirma por todos los canales disponibles.</p>
      </HelpBlock>
      <HelpBlock title="Secuencia">
        <StepItem n={1} label="Cierre de Cita" desc="Confirma disponibilidad en Google Calendar durante la llamada de voz." />
        <StepItem n={2} label="Agendamiento" desc="Reserva el slot y genera enlace de Google Meet automaticamente." />
        <StepItem n={3} label="Confirmacion" desc="Envia correo + WhatsApp con link de reunion y detalles." />
      </HelpBlock>
      <HelpBlock title="Reporte conectado">
        <p>Agenda en Vivo (Descriptivo) muestra las citas del dia con su estado de confirmacion.</p>
      </HelpBlock>
      <HelpBlock title="Conexion con G1">
        <p>G7 es el paso final de G1: cuando el lead responde a la llamada IA, G7 cierra la cita sin intervencion humana.</p>
      </HelpBlock>
      <HelpTip>Con G7 activo, el lead recibe confirmacion instantanea y recordatorio 30 min antes. Reduce no-shows significativamente.</HelpTip>
    </>
  )
}

/* ═══════════════════════════════════════
   CONFIGURACION
   ═══════════════════════════════════════ */

function ConfigEstrategiaHelp() {
  return (
    <>
      <HelpBlock title="SLA de Respuesta Humana">
        <p>Minutos que Rol.IA espera antes de intervenir. Si el vendedor no responde en ese tiempo, G1 toma el control.</p>
        <p>Rango: 1-30 min. Recomendado: 5-7 min.</p>
      </HelpBlock>
      <HelpBlock title="Estado Critico">
        <p>Estado del CRM que se considera &quot;No Atendido&quot;. Ejemplo: &quot;cold-lead&quot;, &quot;sin-respuesta&quot;.</p>
      </HelpBlock>
      <HelpBlock title="Doble Toque">
        <p>Tiempo entre el WhatsApp y la llamada de voz. Permite que el lead responda antes de escalar.</p>
        <p>Rango: 1-10 min. Recomendado: 2-3 min.</p>
      </HelpBlock>
      <HelpTip>Cambiar el SLA afecta G1 y el Semaforo de Abandono. SLA mas corto = intervencion mas rapida pero menos margen para el vendedor.</HelpTip>
    </>
  )
}

function ConfigBovedaHelp() {
  return (
    <>
      <HelpBlock title="Que es">
        <p>Almacen protegido por contrasena con <strong className="text-foreground">credenciales de todo el ecosistema</strong>.</p>
      </HelpBlock>
      <HelpBlock title="Modulos">
        <p><strong className="text-foreground">Mensajeria:</strong> Credenciales de WhatsApp (ID, dispositivo, numero, token).</p>
        <p><strong className="text-foreground">Voz:</strong> Asistente de voz IA (ID asistente, linea, token).</p>
        <p><strong className="text-foreground">Telefonia:</strong> Servicio de llamadas (SID, numero, token).</p>
        <p><strong className="text-foreground">CRM:</strong> Token de integracion con Clientify.</p>
      </HelpBlock>
      <HelpTip>Solo usuarios con la clave de acceso pueden ver/editar credenciales. Los nombres reales se mantienen cifrados.</HelpTip>
    </>
  )
}

/* ═══════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════ */

export function HelpPanel() {
  const [currentSection, setCurrentSection] = useState<SectionId | null>(null)

  return (
    <Sheet onOpenChange={(open) => { if (!open) setCurrentSection(null) }}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-border/50 text-muted-foreground hover:text-aura hover:border-aura/30 gap-1.5"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Ayuda</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="border-border/40 bg-card w-full sm:max-w-md" side="right">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-foreground flex items-center gap-2 text-sm">
            <HelpCircle className="text-aura h-4 w-4" />
            Guia de Uso - Rol.IA
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-100px)] pr-4">
          <AnimatePresence mode="wait">
            {currentSection === null ? (
              <motion.div
                key="home"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <HelpHome onNavigate={setCurrentSection} />
              </motion.div>
            ) : (
              <motion.div
                key={currentSection}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
              >
                <HelpDetail sectionId={currentSection} onBack={() => setCurrentSection(null)} />
              </motion.div>
            )}
          </AnimatePresence>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
