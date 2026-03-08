
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, Shield, Eye } from "lucide-react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { useIntelFetch } from "@/hooks/use-intel-fetch"
import { IntelEmptyState } from "./intel-empty-state"
import { Skeleton } from "@/components/ui/skeleton"

interface CPAPoint {
  time: string
  metaSpend: number
  googleSpend: number
  metaConv: number
  googleConv: number
}

interface CPAData {
  points: CPAPoint[]
}

export function IntelCPARealtime() {
  const { data: fetched, loading } = useIntelFetch<CPAData>("/api/intel/cpa-realtime", { points: [] })
  const [data, setData] = useState<CPAPoint[]>([])
  const [guardianActive, setGuardianActive] = useState(false)

  useEffect(() => {
    if (fetched.points.length > 0) setData(fetched.points)
  }, [fetched.points])

  const addPoint = useCallback(() => {
    setData((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      const parts = last.time.split(":")
      let h = parseInt(parts[0])
      let m = parseInt(parts[1]) + 10
      if (m >= 60) { m = 0; h++ }
      const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      const next = {
        time: label,
        metaSpend: Math.round(15 + Math.random() * 35),
        googleSpend: Math.round(10 + Math.random() * 25),
        metaConv: Math.round(1 + Math.random() * 6),
        googleConv: Math.round(0.5 + Math.random() * 4),
      }
      return [...prev.slice(1), next]
    })
  }, [])

  useEffect(() => {
    if (data.length === 0) return
    const id = setInterval(addPoint, 4000)
    return () => clearInterval(id)
  }, [addPoint, data.length > 0])

  if (loading) return <Skeleton className="h-[350px] rounded-xl" />
  if (data.length === 0) return <IntelEmptyState />

  const totalSpend = data.reduce((s, d) => s + d.metaSpend + d.googleSpend, 0)
  const totalConv = data.reduce((s, d) => s + d.metaConv + d.googleConv, 0)
  const avgCPA = totalConv > 0 ? (totalSpend / totalConv).toFixed(0) : "---"

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <div className="bg-aura/10 flex h-7 w-7 items-center justify-center rounded-lg">
              <Activity className="text-aura h-4 w-4" />
            </div>
            CPA Real-Time
          </CardTitle>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-border/50 text-muted-foreground font-mono text-xs">
              CPA ${avgCPA}
            </Badge>
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
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="bg-info h-2 w-2 rounded-full" />
            <span className="text-muted-foreground text-[11px]">Meta Gasto</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-warning h-2 w-2 rounded-full" />
            <span className="text-muted-foreground text-[11px]">Google Gasto</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-aura h-2 w-2 rounded-full" />
            <span className="text-muted-foreground text-[11px]">Meta Conv.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-rescue h-2 w-2 rounded-full" />
            <span className="text-muted-foreground text-[11px]">Google Conv.</span>
          </div>
        </div>

        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="metaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="googleGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} interval={4} />
              <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f0f13",
                  border: "1px solid #1e1e24",
                  borderRadius: "8px",
                  fontSize: "11px",
                  color: "#fafafa",
                }}
              />
              <Area type="monotone" dataKey="metaSpend" stroke="#6366f1" fill="url(#metaGrad)" strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="googleSpend" stroke="#f59e0b" fill="url(#googleGrad)" strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="metaConv" stroke="#a855f7" fill="none" strokeWidth={2} strokeDasharray="4 2" dot={false} />
              <Area type="monotone" dataKey="googleConv" stroke="#22c55e" fill="none" strokeWidth={2} strokeDasharray="4 2" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
