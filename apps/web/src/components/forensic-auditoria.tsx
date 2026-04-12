import { useState } from "react"
import { motion } from "framer-motion"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Search,
  AlertTriangle,
  Users,
  TrendingDown,
  Zap,
  ScanLine,
  Filter,
  Target,
  ShieldAlert,
  RefreshCw,
  CheckCircle,
} from "lucide-react"
import { useIntelFetch } from "@/hooks/use-intel-fetch"
import { useAuthStore } from "@/stores/auth-store"
import { toast } from "sonner"

interface AsesorData {
  id: string
  nombre: string
  tiempoMedioSeg: number
  leadsSemaforoRojo: number
  rescatesPorIA: number
  accionSugerida: string
  accionTipo: "reasignacion" | "capacitacion" | "mantener"
}

interface AuditoriaData {
  asesores: AsesorData[]
  resumen: {
    pctFallaComercial: number
    causaPrincipal: string
    totalLeadsRojos: number
    totalRescatesIA: number
    tiempoMedioGeneral: number
  }
}

const accionConfig = {
  reasignacion: { color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30", icon: <ShieldAlert className="h-3 w-3" /> },
  capacitacion: { color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30", icon: <Target className="h-3 w-3" /> },
  mantener: { color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/30", icon: <CheckCircle className="h-3 w-3" /> },
}

export function ForensicAuditoria() {
  const { data, loading } = useIntelFetch<AuditoriaData>("/api/intel/forensic-auditoria", {
    asesores: [],
    resumen: { pctFallaComercial: 0, causaPrincipal: "N/A", totalLeadsRojos: 0, totalRescatesIA: 0, tiempoMedioGeneral: 0 },
  })

  const token = useAuthStore((s) => s.token)

  const [filterTiempo, setFilterTiempo] = useState<string>("all")
  const [filterAccion, setFilterAccion] = useState<string>("all")
  const [showVerdicto, setShowVerdicto] = useState(false)
  const [showPrediccion, setShowPrediccion] = useState(false)
  const [verdictText, setVerdictText] = useState("")
  const [prediccionText, setPrediccionText] = useState("")
  const [isTypingVerdict, setIsTypingVerdict] = useState(false)
  const [isTypingPrediccion, setIsTypingPrediccion] = useState(false)

  // Reasignación
  const [reasignarOpen, setReasignarOpen] = useState(false)
  const [vendedorOrigenId, setVendedorOrigenId] = useState("")
  const [vendedorDestinoId, setVendedorDestinoId] = useState("")
  const [reasignando, setReasignando] = useState(false)

  const { asesores, resumen } = data

  // Textos template con datos reales
  const verdictG5 = `El ${resumen.pctFallaComercial}% de las oportunidades perdidas este mes se deben a ${resumen.causaPrincipal}. El equipo de ventas no está respondiendo en la "Ventana de Oro" (primeros 5 min). Se recomienda activar reasignación automática para los asesores críticos.`
  const prediccionG4 = `De continuar con este ritmo de respuesta humana (${resumen.tiempoMedioGeneral} min promedio), la meta de ventas del mes se verá afectada. ROL.IA ha compensado mediante ${resumen.totalRescatesIA} rescates automáticos.`

  const filteredAsesores = asesores.filter((a) => {
    const tiempoMin = Math.round(a.tiempoMedioSeg / 60)
    if (filterTiempo === "critico" && tiempoMin < 10) return false
    if (filterTiempo === "moderado" && (tiempoMin < 5 || tiempoMin >= 10)) return false
    if (filterTiempo === "optimo" && tiempoMin >= 5) return false
    if (filterAccion !== "all" && a.accionTipo !== filterAccion) return false
    return true
  })

  const handleScanVerdicto = () => {
    setShowVerdicto(true)
    setIsTypingVerdict(true)
    setVerdictText("")
    let i = 0
    const interval = setInterval(() => {
      if (i < verdictG5.length) {
        setVerdictText(verdictG5.slice(0, i + 1))
        i++
      } else {
        clearInterval(interval)
        setIsTypingVerdict(false)
      }
    }, 12)
  }

  const handleScanPrediccion = () => {
    setShowPrediccion(true)
    setIsTypingPrediccion(true)
    setPrediccionText("")
    let i = 0
    const interval = setInterval(() => {
      if (i < prediccionG4.length) {
        setPrediccionText(prediccionG4.slice(0, i + 1))
        i++
      } else {
        clearInterval(interval)
        setIsTypingPrediccion(false)
      }
    }, 12)
  }

  const getTiempoStatus = (tiempoSeg: number) => {
    const min = Math.round(tiempoSeg / 60)
    if (min >= 10) return { color: "text-destructive", label: `${min} min` }
    if (min >= 5) return { color: "text-yellow-500", label: `${min} min` }
    return { color: "text-green-500", label: `${min} min` }
  }

  const handleReasignar = async () => {
    if (!vendedorOrigenId || !vendedorDestinoId) return
    setReasignando(true)
    try {
      const API_URL = import.meta.env.VITE_API_URL || ""
      const res = await fetch(`${API_URL}/api/intel/forensic-auditoria/reasignar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          vendedorOrigenId,
          vendedorDestinoId,
          soloLeadsCriticos: true,
        }),
      })
      const result = await res.json()
      if (res.ok) {
        toast.success(`${result.leadsReasignados} leads reasignados a ${result.vendedorDestino}`)
        setReasignarOpen(false)
      } else {
        toast.error(result.error || "Error al reasignar")
      }
    } catch {
      toast.error("Error de conexión")
    } finally {
      setReasignando(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-muted-foreground text-sm">Cargando auditoría...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-destructive/10 flex h-10 w-10 items-center justify-center rounded-xl">
                <Search className="text-destructive h-5 w-5" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2 font-mono text-sm font-bold tracking-tight">
                  <span className="text-destructive">[</span>AUDITORIA_G5<span className="text-destructive">]</span>
                </CardTitle>
                <p className="text-muted-foreground text-[10px] uppercase tracking-widest">
                  DETECCION_DE_FALLA_RAIZ_Y_FUGA_DE_CAPITAL
                </p>
              </div>
            </div>
            <Badge variant="outline" className="border-destructive/30 text-destructive w-fit">
              <AlertTriangle className="mr-1.5 h-3 w-3" />
              {asesores.filter((a) => a.accionTipo === "reasignacion").length} Asesores Criticos
            </Badge>
          </div>

          {/* Filters */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="text-muted-foreground flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wider">Filtros:</span>
            </div>
            <Select value={filterTiempo} onValueChange={setFilterTiempo}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue placeholder="Tiempo Resp." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="critico">Critico (&gt;10 min)</SelectItem>
                <SelectItem value="moderado">Moderado (5-10 min)</SelectItem>
                <SelectItem value="optimo">Optimo (&lt;5 min)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterAccion} onValueChange={setFilterAccion}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Accion Sugerida" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las acciones</SelectItem>
                <SelectItem value="reasignacion">Reasignacion</SelectItem>
                <SelectItem value="capacitacion">Capacitacion</SelectItem>
                <SelectItem value="mantener">Mantener</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setFilterTiempo("all"); setFilterAccion("all") }}
              className="h-8 text-xs"
            >
              <RefreshCw className="mr-1.5 h-3 w-3" />
              Reset
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Table Header */}
          <div className="bg-muted/50 grid grid-cols-[1fr_120px_140px_120px_200px] gap-2 border-b px-4 py-3">
            <span className="text-muted-foreground font-mono text-[9px] font-bold uppercase tracking-widest">Asesor Comercial</span>
            <span className="text-muted-foreground font-mono text-[9px] font-bold uppercase tracking-widest">Tiempo Medio</span>
            <span className="text-muted-foreground font-mono text-[9px] font-bold uppercase tracking-widest">Semaforo Rojo</span>
            <span className="text-muted-foreground font-mono text-[9px] font-bold uppercase tracking-widest">Rescates IA</span>
            <span className="text-muted-foreground font-mono text-[9px] font-bold uppercase tracking-widest">Accion Sugerida</span>
          </div>

          {/* Table Rows */}
          <div className="max-h-[280px] overflow-y-auto">
            {filteredAsesores.map((asesor, idx) => {
              const tiempoStatus = getTiempoStatus(asesor.tiempoMedioSeg)
              const accion = accionConfig[asesor.accionTipo]

              return (
                <motion.div
                  key={asesor.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.08 }}
                  className={`grid grid-cols-[1fr_120px_140px_120px_200px] items-center gap-2 border-b px-4 py-3.5 transition-colors hover:bg-muted/30 ${
                    asesor.accionTipo === "reasignacion" ? "bg-destructive/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${accion.bg}`}>
                      <Users className={`h-3.5 w-3.5 ${accion.color}`} />
                    </div>
                    <span className="text-sm font-medium">{asesor.nombre}</span>
                  </div>
                  <span className={`font-mono text-sm font-bold ${tiempoStatus.color}`}>
                    {tiempoStatus.label}
                  </span>
                  <div>
                    {asesor.leadsSemaforoRojo > 0 ? (
                      <Badge variant="outline" className="border-destructive/30 text-destructive font-mono text-[11px]">
                        {asesor.leadsSemaforoRojo} Leads
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">0 Leads</span>
                    )}
                  </div>
                  <div>
                    {asesor.rescatesPorIA > 0 ? (
                      <Badge variant="outline" className="border-purple-500/30 text-purple-500 font-mono text-[11px]">
                        {asesor.rescatesPorIA}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">0</span>
                    )}
                  </div>
                  <Badge variant="outline" className={`${accion.bg} ${accion.border} ${accion.color} gap-1.5 font-mono text-[10px]`}>
                    {accion.icon}
                    {asesor.accionSugerida}
                  </Badge>
                </motion.div>
              )
            })}

            {filteredAsesores.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="text-muted-foreground/30 mb-3 h-8 w-8" />
                <p className="text-muted-foreground text-sm">No hay asesores que coincidan con los filtros</p>
              </div>
            )}
          </div>

          {/* Veredicto + Predicción */}
          <div className="bg-muted/30 grid gap-4 border-t p-4 lg:grid-cols-2">
            <div className="border-destructive/30 rounded-xl border-2 border-dashed p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ScanLine className="text-destructive h-4 w-4" />
                  <span className="text-destructive font-mono text-[10px] uppercase tracking-widest">
                    Veredicto del Auditor G5
                  </span>
                </div>
                {!showVerdicto && (
                  <Button size="sm" variant="destructive" onClick={handleScanVerdicto} className="h-7 px-3 font-mono text-[10px]">
                    <Zap className="mr-1 h-3 w-3" />
                    ANALIZAR
                  </Button>
                )}
              </div>
              {showVerdicto && (
                <div className="min-h-[60px]">
                  <p className="text-muted-foreground font-mono text-xs leading-relaxed">
                    "{verdictText}"
                    {isTypingVerdict && <span className="bg-destructive ml-0.5 inline-block h-4 w-1.5 animate-pulse" />}
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-xl border-2 border-dashed border-blue-500/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-blue-500" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-blue-500">
                    Prediccion de Impacto G4
                  </span>
                </div>
                {!showPrediccion && (
                  <Button size="sm" onClick={handleScanPrediccion} className="h-7 bg-blue-500 px-3 font-mono text-[10px] hover:bg-blue-600">
                    <Zap className="mr-1 h-3 w-3" />
                    PROYECTAR
                  </Button>
                )}
              </div>
              {showPrediccion && (
                <div className="min-h-[60px]">
                  <p className="text-muted-foreground font-mono text-xs leading-relaxed">
                    "{prediccionText}"
                    {isTypingPrediccion && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-blue-500" />}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Botón reasignar */}
          {showVerdicto && !isTypingVerdict && asesores.some((a) => a.accionTipo === "reasignacion") && (
            <div className="border-t p-4">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Button
                  className="w-full bg-green-500 font-mono text-xs hover:bg-green-600"
                  onClick={() => {
                    const critico = asesores.find((a) => a.accionTipo === "reasignacion")
                    if (critico) {
                      setVendedorOrigenId(critico.id)
                      setVendedorDestinoId("")
                      setReasignarOpen(true)
                    }
                  }}
                >
                  <Zap className="mr-2 h-3.5 w-3.5" />
                  EJECUTAR REASIGNACION AUTOMATICA DE LEADS CRITICOS
                </Button>
              </motion.div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de reasignación */}
      <Dialog open={reasignarOpen} onOpenChange={setReasignarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reasignar Leads Criticos</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium">Vendedor Origen</label>
              <Select value={vendedorOrigenId} onValueChange={setVendedorOrigenId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Seleccionar origen" />
                </SelectTrigger>
                <SelectContent>
                  {asesores.filter((a) => a.accionTipo === "reasignacion").map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nombre} ({a.leadsSemaforoRojo} leads rojos)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-muted-foreground mb-1.5 block text-xs font-medium">Vendedor Destino</label>
              <Select value={vendedorDestinoId} onValueChange={setVendedorDestinoId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Seleccionar destino" />
                </SelectTrigger>
                <SelectContent>
                  {asesores.filter((a) => a.id !== vendedorOrigenId).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nombre} ({a.accionSugerida})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasignarOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleReasignar}
              disabled={!vendedorDestinoId || reasignando}
              className="bg-green-500 hover:bg-green-600"
            >
              {reasignando ? "Reasignando..." : "Confirmar Reasignacion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
