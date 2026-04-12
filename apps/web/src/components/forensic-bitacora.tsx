import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Shield,
  Phone,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle,
  PhoneCall,
  PhoneOff,
  CalendarCheck,
  MessageSquare,
  MessageCircle,
  XCircle,
  Zap,
  Target,
  BarChart3,
  User,
} from "lucide-react"
import { useIntelFetch } from "@/hooks/use-intel-fetch"

type AccionType =
  | "ALERTA_SEMAFORO_VERDE"
  | "ALERTA_SEMAFORO_AMARILLO"
  | "ALERTA_SEMAFORO_ROJO"
  | "DISPARO_RESCATE_G1"
  | "PREF_LLAMADA_IA"
  | "PREF_AGENDAMIENTO"
  | "PREF_CONTINUAR_CHAT"
  | "PREF_OPT_OUT"
  | "EJECUCION_LLAMADA_RESCATE"
  | "INTENTO_REMARCADO"
  | "ESTADO_LLAMADA_CONTESTADA"
  | "ESTADO_BUZON_NO_CONTESTA"
  | "REINTENTOS_AGOTADOS"
  | "SISTEMA"

interface TimelineEvent {
  id: string
  timestamp: string
  leadId: string
  leadNombre: string
  telefono: string
  fuente: string
  accion: AccionType
  guardian: "G1" | "G7" | null
  tipoEvento: "alerta" | "accion" | "respuesta" | "estado"
  resultado: string
  vendedorAsignado: string
  tiempoRespuestaSeg: number | null
}

interface BitacoraData {
  events: TimelineEvent[]
  stats: {
    total: number
    exitosos: number
    alertasRojas: number
    optOuts: number
  }
}

const accionConfig: Record<string, {
  label: string
  icon: React.ReactNode
  color: string
  bg: string
  border: string
}> = {
  ALERTA_SEMAFORO_VERDE: { label: "Semaforo Verde", icon: <div className="h-2.5 w-2.5 rounded-full bg-green-500" />, color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/30" },
  ALERTA_SEMAFORO_AMARILLO: { label: "Semaforo Amarillo", icon: <div className="h-2.5 w-2.5 rounded-full bg-yellow-500" />, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
  ALERTA_SEMAFORO_ROJO: { label: "Semaforo Rojo", icon: <AlertTriangle className="h-3 w-3 text-destructive" />, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30" },
  DISPARO_RESCATE_G1: { label: "Rescate WhatsApp", icon: <MessageCircle className="h-3 w-3 text-blue-500" />, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  PREF_LLAMADA_IA: { label: "Pref: Llamada IA", icon: <PhoneCall className="h-3 w-3 text-purple-500" />, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  PREF_AGENDAMIENTO: { label: "Pref: Agendamiento", icon: <CalendarCheck className="h-3 w-3 text-cyan-500" />, color: "text-cyan-500", bg: "bg-cyan-500/10", border: "border-cyan-500/30" },
  PREF_CONTINUAR_CHAT: { label: "Pref: Chat", icon: <MessageSquare className="h-3 w-3 text-green-500" />, color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/30" },
  PREF_OPT_OUT: { label: "Opt-Out", icon: <XCircle className="h-3 w-3 text-muted-foreground" />, color: "text-muted-foreground", bg: "bg-muted/30", border: "border-muted" },
  EJECUCION_LLAMADA_RESCATE: { label: "Llamada Rescate", icon: <Phone className="h-3 w-3 text-orange-500" />, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  INTENTO_REMARCADO: { label: "Remarcado", icon: <Phone className="h-3 w-3 text-yellow-500" />, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
  ESTADO_LLAMADA_CONTESTADA: { label: "Llamada Contestada", icon: <CheckCircle className="h-3 w-3 text-green-500" />, color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/30" },
  ESTADO_BUZON_NO_CONTESTA: { label: "Buzon / No Contesta", icon: <PhoneOff className="h-3 w-3 text-destructive" />, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30" },
  REINTENTOS_AGOTADOS: { label: "Reintentos Agotados", icon: <XCircle className="h-3 w-3 text-destructive" />, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30" },
  SISTEMA: { label: "Sistema", icon: <Zap className="h-3 w-3 text-muted-foreground" />, color: "text-muted-foreground", bg: "bg-muted/30", border: "border-muted" },
}

const ACCIONES_EXITO = ["ESTADO_LLAMADA_CONTESTADA", "PREF_AGENDAMIENTO", "PREF_CONTINUAR_CHAT"]
const ACCIONES_FRACASO = ["ESTADO_BUZON_NO_CONTESTA", "PREF_OPT_OUT", "REINTENTOS_AGOTADOS"]
const ACCIONES_EN_PROCESO = ["ALERTA_SEMAFORO_VERDE", "ALERTA_SEMAFORO_AMARILLO", "DISPARO_RESCATE_G1", "EJECUCION_LLAMADA_RESCATE"]

export function ForensicBitacora() {
  const { data, loading } = useIntelFetch<BitacoraData>("/api/intel/forensic-bitacora", {
    events: [],
    stats: { total: 0, exitosos: 0, alertasRojas: 0, optOuts: 0 },
  })

  const [vistaActiva, setVistaActiva] = useState<"masivo" | "puntual">("masivo")

  // Filtros masivos
  const [filterGuardian, setFilterGuardian] = useState<string>("all")
  const [filterAccion, setFilterAccion] = useState<string>("all")
  const [filterTipoEvento, setFilterTipoEvento] = useState<string>("all")
  const [filterCanal, setFilterCanal] = useState<string>("all")
  const [filterVendedor, setFilterVendedor] = useState<string>("all")
  const [filterResultado, setFilterResultado] = useState<string>("all")

  // Filtros puntuales
  const [searchLeadId, setSearchLeadId] = useState("")
  const [searchTelefono, setSearchTelefono] = useState("")
  const [searchNombre, setSearchNombre] = useState("")

  const events = data.events

  const vendedoresUnicos = useMemo(() => [...new Set(events.map((e) => e.vendedorAsignado))], [events])
  const canalesUnicos = useMemo(() => [...new Set(events.map((e) => e.fuente))], [events])

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filterGuardian !== "all" && e.guardian !== filterGuardian) return false
      if (filterAccion !== "all" && e.accion !== filterAccion) return false
      if (filterTipoEvento !== "all" && e.tipoEvento !== filterTipoEvento) return false
      if (filterCanal !== "all" && e.fuente !== filterCanal) return false
      if (filterVendedor !== "all" && e.vendedorAsignado !== filterVendedor) return false

      if (filterResultado === "exito" && !ACCIONES_EXITO.includes(e.accion)) return false
      if (filterResultado === "fracaso" && !ACCIONES_FRACASO.includes(e.accion)) return false
      if (filterResultado === "en_proceso" && !ACCIONES_EN_PROCESO.includes(e.accion)) return false

      if (searchLeadId && !e.leadId.toLowerCase().includes(searchLeadId.toLowerCase())) return false
      if (searchTelefono && !e.telefono.includes(searchTelefono)) return false
      if (searchNombre && !e.leadNombre.toLowerCase().includes(searchNombre.toLowerCase())) return false

      return true
    })
  }, [events, filterGuardian, filterAccion, filterTipoEvento, filterCanal, filterVendedor, filterResultado, searchLeadId, searchTelefono, searchNombre])

  const stats = data.stats

  const resetFilters = () => {
    setFilterGuardian("all")
    setFilterAccion("all")
    setFilterTipoEvento("all")
    setFilterCanal("all")
    setFilterVendedor("all")
    setFilterResultado("all")
    setSearchLeadId("")
    setSearchTelefono("")
    setSearchNombre("")
  }

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp)
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-muted-foreground text-sm">Cargando bitacora...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <Shield className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2 font-mono text-sm font-bold tracking-tight">
                  <span className="text-blue-500">[</span>BITACORA_INTERVENCION_CRITICA<span className="text-blue-500">]</span>
                </CardTitle>
                <p className="text-muted-foreground text-[10px] uppercase tracking-widest">
                  REPORTE OPERATIVO G1 + G7
                </p>
              </div>
            </div>
          </div>

          {/* Vista Toggle */}
          <Tabs value={vistaActiva} onValueChange={(v) => setVistaActiva(v as "masivo" | "puntual")} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="masivo" className="gap-1.5 text-xs">
                <BarChart3 className="h-3 w-3" />
                Analisis Masivo
              </TabsTrigger>
              <TabsTrigger value="puntual" className="gap-1.5 text-xs">
                <Target className="h-3 w-3" />
                Busqueda Puntual
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Filtros Masivos */}
          {vistaActiva === "masivo" && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-muted-foreground flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-wider">Filtros:</span>
              </div>
              <Select value={filterGuardian} onValueChange={setFilterGuardian}>
                <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue placeholder="Guardian" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Guardian</SelectItem>
                  <SelectItem value="G1">G1 Rescatista</SelectItem>
                  <SelectItem value="G7">G7 Cerrador</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterAccion} onValueChange={setFilterAccion}>
                <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Accion" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="ALERTA_SEMAFORO_VERDE">Semaforo Verde</SelectItem>
                  <SelectItem value="ALERTA_SEMAFORO_AMARILLO">Semaforo Amarillo</SelectItem>
                  <SelectItem value="ALERTA_SEMAFORO_ROJO">Semaforo Rojo</SelectItem>
                  <SelectItem value="DISPARO_RESCATE_G1">Rescate G1</SelectItem>
                  <SelectItem value="PREF_LLAMADA_IA">Pref: Llamada</SelectItem>
                  <SelectItem value="PREF_AGENDAMIENTO">Pref: Agenda</SelectItem>
                  <SelectItem value="PREF_CONTINUAR_CHAT">Pref: Chat</SelectItem>
                  <SelectItem value="PREF_OPT_OUT">Opt-Out</SelectItem>
                  <SelectItem value="EJECUCION_LLAMADA_RESCATE">Llamada Rescate</SelectItem>
                  <SelectItem value="ESTADO_LLAMADA_CONTESTADA">Contestada</SelectItem>
                  <SelectItem value="ESTADO_BUZON_NO_CONTESTA">No Contesta</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterTipoEvento} onValueChange={setFilterTipoEvento}>
                <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tipo</SelectItem>
                  <SelectItem value="alerta">Alertas</SelectItem>
                  <SelectItem value="accion">Acciones</SelectItem>
                  <SelectItem value="respuesta">Respuestas</SelectItem>
                  <SelectItem value="estado">Estados</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCanal} onValueChange={setFilterCanal}>
                <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue placeholder="Canal" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Canal</SelectItem>
                  {canalesUnicos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterVendedor} onValueChange={setFilterVendedor}>
                <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Vendedor</SelectItem>
                  {vendedoresUnicos.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterResultado} onValueChange={setFilterResultado}>
                <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="Resultado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Resultado</SelectItem>
                  <SelectItem value="exito">Exitosos</SelectItem>
                  <SelectItem value="fracaso">Fracasos</SelectItem>
                  <SelectItem value="en_proceso">En Proceso</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={resetFilters} className="text-muted-foreground h-8 text-xs hover:text-foreground">
                Limpiar
              </Button>
            </div>
          )}

          {/* Filtros Puntuales */}
          {vistaActiva === "puntual" && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[140px] flex-1">
                <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                <Input placeholder="ID Lead" value={searchLeadId} onChange={(e) => setSearchLeadId(e.target.value)} className="h-8 pl-8 text-xs" />
              </div>
              <div className="relative min-w-[140px] flex-1">
                <Phone className="text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                <Input placeholder="Telefono" value={searchTelefono} onChange={(e) => setSearchTelefono(e.target.value)} className="h-8 pl-8 text-xs" />
              </div>
              <div className="relative min-w-[140px] flex-1">
                <User className="text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                <Input placeholder="Nombre cliente" value={searchNombre} onChange={(e) => setSearchNombre(e.target.value)} className="h-8 pl-8 text-xs" />
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setSearchLeadId(""); setSearchTelefono(""); setSearchNombre("") }} className="text-muted-foreground h-8 text-xs">
                Limpiar
              </Button>
            </div>
          )}

          {/* Quick Stats */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
              <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Total:</span>
              <span className="font-mono text-sm font-bold">{stats.total}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-1.5">
              <CheckCircle className="h-3 w-3 text-green-500" />
              <span className="font-mono text-sm font-bold text-green-500">{stats.exitosos}</span>
              <span className="text-[10px] text-green-500/70">exitosos</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-1.5">
              <AlertTriangle className="text-destructive h-3 w-3" />
              <span className="text-destructive font-mono text-sm font-bold">{stats.alertasRojas}</span>
              <span className="text-destructive/70 text-[10px]">criticos</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
              <XCircle className="text-muted-foreground h-3 w-3" />
              <span className="text-muted-foreground font-mono text-sm font-bold">{stats.optOuts}</span>
              <span className="text-muted-foreground/70 text-[10px]">opt-outs</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Table Header */}
        <div className="bg-muted/50 grid grid-cols-[70px_130px_180px_70px_1fr] gap-2 border-b px-4 py-3">
          <span className="text-muted-foreground font-mono text-[9px] font-bold uppercase tracking-widest">Hora</span>
          <span className="text-muted-foreground font-mono text-[9px] font-bold uppercase tracking-widest">Lead / Cliente</span>
          <span className="text-muted-foreground font-mono text-[9px] font-bold uppercase tracking-widest">Accion</span>
          <span className="text-muted-foreground font-mono text-[9px] font-bold uppercase tracking-widest">Guardian</span>
          <span className="text-muted-foreground font-mono text-[9px] font-bold uppercase tracking-widest">Resultado</span>
        </div>

        {/* Table Rows */}
        <div className="max-h-[420px] overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {filteredEvents.map((event) => {
              const config = accionConfig[event.accion] || accionConfig.SISTEMA
              const isCritical = event.accion === "ALERTA_SEMAFORO_ROJO"

              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`grid grid-cols-[70px_130px_180px_70px_1fr] items-center gap-2 border-b px-4 py-2.5 transition-colors hover:bg-muted/30 ${isCritical ? "bg-destructive/5" : ""}`}
                >
                  <span className="text-muted-foreground font-mono text-xs">{formatTime(event.timestamp)}</span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{event.leadNombre}</div>
                    <div className="text-muted-foreground truncate text-[10px]">{event.vendedorAsignado}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {config.icon}
                    <span className={`text-[11px] font-medium ${config.color}`}>{config.label}</span>
                  </div>
                  <div>
                    {event.guardian && (
                      <Badge variant="outline" className="font-mono text-[9px]">{event.guardian}</Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground min-w-0 truncate text-[11px]">{event.resultado}</div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {filteredEvents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Shield className="text-muted-foreground/30 mb-3 h-8 w-8" />
              <p className="text-muted-foreground text-sm">No hay eventos que coincidan con los filtros</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
