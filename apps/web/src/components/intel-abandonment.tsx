
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
  maxMs: number
}

interface AbandonmentData {
  leads: Lead[]
}

function getStatus(ms: number): { label: string; color: string; bg: string; border: string } {
  const min = ms / 60000
  if (min > 10) return { label: "Critico", color: "text-alert", bg: "bg-alert", border: "border-alert/20" }
  if (min > 5) return { label: "En riesgo", color: "text-warning", bg: "bg-warning", border: "border-warning/20" }
  return { label: "OK", color: "text-rescue", bg: "bg-rescue", border: "border-rescue/20" }
}

function formatAgony(ms: number) {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function IntelAbandonment() {
  const token = useAuthStore((s) => s.token)
  const [guardianActive, setGuardianActive] = useState(false)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch con polling cada 15s — aislado del hook compartido
  const fetchLeads = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/intel/abandonment`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const json = (await res.json()) as AbandonmentData
      if (json.leads.length > 0) {
        setLeads(json.leads)
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
        prev.map((l) => ({
          ...l,
          waitMs: Math.min(l.waitMs + 1000, l.maxMs),
        }))
      )
    }, 1000)
    return () => clearInterval(id)
  }, [leads.length > 0])

  if (loading) return <Skeleton className="h-[400px] rounded-xl" />
  if (leads.length === 0) return <IntelEmptyState />

  const sorted = [...leads].sort((a, b) => b.waitMs - a.waitMs)
  const critical = sorted.filter((l) => l.waitMs / 60000 > 10).length
  const atRisk = sorted.filter((l) => { const m = l.waitMs / 60000; return m > 5 && m <= 10 }).length

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
            <span className="text-muted-foreground text-[11px]">{">"} 10 min</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="bg-warning h-2.5 w-2.5 rounded-full" />
            <span className="text-muted-foreground text-[11px]">{">"} 5 min</span>
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
              const status = getStatus(lead.waitMs)
              const pct = Math.min((lead.waitMs / lead.maxMs) * 100, 100)
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
                    <span className="text-muted-foreground text-[10px]">{lead.id}</span>
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
                    {formatAgony(lead.waitMs)}
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
