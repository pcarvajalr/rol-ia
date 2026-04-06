
import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Shield, Eye, Clock } from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"
import { IntelEmptyState } from "./intel-empty-state"
import { Skeleton } from "@/components/ui/skeleton"

const API_URL = import.meta.env.VITE_API_URL || ""

interface Lead {
  id: string
  name: string
  source: string
  waitMs: number
  isFlowActive: boolean
  semaphoreTimeMs: number | null
  semaphoreColor: string | null
  crmStatusInicial: string | null
  estadoGestion: string | null
}

interface Thresholds {
  tiempoVerdeMins: number
  tiempoAmarilloMins: number
}

interface AbandonmentData {
  leads: Lead[]
  thresholds: Thresholds
}

function getStatus(
  ms: number,
  thresholds: Thresholds
): { label: string; color: string; bg: string; border: string } {
  const verdeMs = thresholds.tiempoVerdeMins * 60000
  const amarilloMs = thresholds.tiempoAmarilloMins * 60000
  if (ms > verdeMs + amarilloMs)
    return { label: "Critico", color: "text-alert", bg: "bg-alert", border: "border-alert/20" }
  if (ms > verdeMs)
    return { label: "En riesgo", color: "text-warning", bg: "bg-warning", border: "border-warning/20" }
  return { label: "OK", color: "text-rescue", bg: "bg-rescue", border: "border-rescue/20" }
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const totalMinutes = Math.floor(totalSeconds / 60)
  const totalHours = Math.floor(totalMinutes / 60)
  const totalDays = Math.floor(totalHours / 24)

  if (totalDays >= 1) {
    const remainingHours = totalHours - totalDays * 24
    return `${totalDays}d ${remainingHours}h`
  }
  if (totalHours >= 1) {
    const remainingMinutes = totalMinutes - totalHours * 60
    return `${totalHours}h ${remainingMinutes}m`
  }
  const minutes = totalMinutes
  const seconds = totalSeconds - minutes * 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

const ESTADO_COLORS: Record<string, string> = {
  "Frío": "border-blue-400/50 text-blue-400",
  "En proceso": "border-emerald-400/50 text-emerald-400",
  "En negociación": "border-amber-400/50 text-amber-400",
  "Cerrado": "border-violet-400/50 text-violet-400",
  "Perdido": "border-rose-400/50 text-rose-400",
  "Eliminado": "border-zinc-400/50 text-zinc-400",
}

export function IntelAbandonment() {
  const token = useAuthStore((s) => s.token)
  const [guardianActive, setGuardianActive] = useState(false)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [thresholds, setThresholds] = useState<Thresholds>({ tiempoVerdeMins: 5, tiempoAmarilloMins: 5 })

  // Fetch con polling cada 15s — aislado del hook compartido
  const fetchLeads = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/intel/abandonment`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const json = (await res.json()) as AbandonmentData
      if (json.thresholds) setThresholds(json.thresholds)
      if (json.leads.length > 0) {
        setLeads(json.leads)
      } else {
        setLeads([])
      }
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchLeads()
    const id = setInterval(fetchLeads, 15000)
    return () => clearInterval(id)
  }, [fetchLeads])

  // Timer local: incrementa waitMs cada segundo
  useEffect(() => {
    if (leads.length === 0) return
    const id = setInterval(() => {
      setLeads((prev) =>
        prev.map((l) =>
          l.isFlowActive
            ? { ...l, waitMs: l.waitMs + 1000 }
            : l
        )
      )
    }, 1000)
    return () => clearInterval(id)
  }, [leads.length])

  if (loading) return <Skeleton className="h-[400px] rounded-xl" />
  if (leads.length === 0) return <IntelEmptyState />

  const sorted = [...leads].sort((a, b) => b.waitMs - a.waitMs)
  const verdeMs = thresholds.tiempoVerdeMins * 60000
  const rojoMs = (thresholds.tiempoVerdeMins + thresholds.tiempoAmarilloMins) * 60000
  const getDisplayMs = (l: Lead) => l.isFlowActive ? l.waitMs : (l.semaphoreTimeMs || 0)
  const critical = sorted.filter((l) => getDisplayMs(l) > rojoMs).length
  const atRisk = sorted.filter((l) => {
    const ms = getDisplayMs(l)
    return ms > verdeMs && ms <= rojoMs
  }).length

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <div className="bg-alert/10 flex h-7 w-7 items-center justify-center rounded-lg">
              <Users className="text-alert h-4 w-4" />
            </div>
            Semaforo de Abandono
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {critical > 0 && (
                <Badge variant="outline" className="border-alert/30 text-alert text-xs">
                  {critical} criticos
                </Badge>
              )}
              {atRisk > 0 && (
                <Badge variant="outline" className="border-warning/30 text-warning text-xs">
                  {atRisk} en riesgo
                </Badge>
              )}
            </div>
            <button
              onClick={() => setGuardianActive(!guardianActive)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                guardianActive
                  ? "bg-aura/10 text-aura border-aura/20 border"
                  : "bg-secondary text-muted-foreground border-border/50 border"
              }`}
            >
              {guardianActive ? <Shield className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {guardianActive ? "Activo" : "Activar Guardian"}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Legend */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="bg-alert h-2.5 w-2.5 rounded-full" />
            <span className="text-muted-foreground text-[11px]">{`> ${thresholds.tiempoVerdeMins + thresholds.tiempoAmarilloMins} min`}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="bg-warning h-2.5 w-2.5 rounded-full" />
            <span className="text-muted-foreground text-[11px]">{`> ${thresholds.tiempoVerdeMins} min`}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="bg-rescue h-2.5 w-2.5 rounded-full" />
            <span className="text-muted-foreground text-[11px]">OK</span>
          </div>
        </div>

        {/* Lead rows */}
        <div className="flex flex-col gap-1.5">
          <div className="text-muted-foreground grid grid-cols-[1fr_80px_70px_90px_80px] items-center gap-2 px-3 text-[10px] font-medium uppercase tracking-wider">
            <span>Lead</span>
            <span>Fuente</span>
            <span>Estado</span>
            <span className="text-right">Tiempo Agonia</span>
            <span className="text-right">Progreso</span>
          </div>
          <AnimatePresence>
            {sorted.map((lead) => {
              const displayMs = lead.isFlowActive ? lead.waitMs : (lead.semaphoreTimeMs || 0)
              const status = getStatus(displayMs, thresholds)
              const redThresholdMs = (thresholds.tiempoVerdeMins + thresholds.tiempoAmarilloMins) * 60000
              const pct = Math.min((displayMs / redThresholdMs) * 100, 100)
              return (
                <motion.div
                  key={lead.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`grid grid-cols-[1fr_80px_70px_90px_80px] items-center gap-2 rounded-lg px-3 py-2.5 ${status.border} border bg-secondary/30`}
                >
                  <div className="flex flex-col">
                    <span className="text-foreground text-xs font-medium">{lead.name}</span>
                    <Badge variant="outline" className={`mt-0.5 w-fit text-[10px] ${ESTADO_COLORS[lead.estadoGestion ?? ""] ?? "border-border/40 text-muted-foreground"}`}>
                      {lead.estadoGestion ?? "Sin estado"}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground text-xs">{lead.source}</span>
                  <Badge
                    variant="outline"
                    className={`${status.color} ${status.border} w-fit text-[10px]`}
                  >
                    {status.label}
                  </Badge>
                  <div className={`flex items-center justify-end gap-1 font-mono text-xs ${status.color}`}>
                    <Clock className="h-3 w-3" />
                    {formatTime(displayMs)}
                  </div>
                  <div className="flex items-center justify-end">
                    <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
                      <motion.div
                        className={`h-full rounded-full ${status.bg}`}
                        style={{ width: `${pct}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  )
}
