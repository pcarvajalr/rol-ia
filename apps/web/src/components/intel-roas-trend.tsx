
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Radio, Shield, Eye, TrendingDown } from "lucide-react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
} from "recharts"
import { useIntelFetch } from "@/hooks/use-intel-fetch"
import { IntelEmptyState } from "./intel-empty-state"
import { Skeleton } from "@/components/ui/skeleton"

interface ROASPoint {
  day: string
  meta: number
  google: number
  threshold: number
}

interface ROASData {
  points: ROASPoint[]
}

export function IntelROASTrend() {
  const { data, loading } = useIntelFetch<ROASData>("/api/intel/roas-trend", { points: [] })
  const [guardianActive, setGuardianActive] = useState(false)

  if (loading) return <Skeleton className="h-[380px] rounded-xl" />
  if (data.points.length === 0) return <IntelEmptyState />

  const points = data.points
  const latestMeta = points[points.length - 1].meta
  const latestGoogle = points[points.length - 1].google
  const anyBelow = latestMeta < 1.5 || latestGoogle < 1.5

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <div className="bg-alert/10 flex h-7 w-7 items-center justify-center rounded-lg">
              <Radio className="text-alert h-4 w-4" />
            </div>
            Tendencia ROAS Semanal
          </CardTitle>
          <div className="flex items-center gap-3">
            {anyBelow && (
              <Badge variant="outline" className="border-alert/30 text-alert text-xs">
                <TrendingDown className="mr-1 h-3 w-3" />
                Bajo umbral
              </Badge>
            )}
            <button
              onClick={() => setGuardianActive(!guardianActive)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                guardianActive
                  ? "bg-aura/10 text-aura border-aura/20 border"
                  : "bg-secondary text-muted-foreground border-border/50 border"
              }`}
            >
              {guardianActive ? <Shield className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {guardianActive ? "G2 Activo" : "Activar G2"}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="bg-info h-2 w-2 rounded-full" />
            <span className="text-muted-foreground text-[11px]">ROAS Meta</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-warning h-2 w-2 rounded-full" />
            <span className="text-muted-foreground text-[11px]">ROAS Google</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-alert/50 h-px w-4" />
            <span className="text-muted-foreground text-[11px]">Corte 1.5x</span>
          </div>
        </div>

        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points}>
              <defs>
                <linearGradient id="roasMetaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="roasGoogleGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} domain={[0, 4]} tickFormatter={(v) => `${v}x`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f0f13", border: "1px solid #1e1e24", borderRadius: "8px", fontSize: "11px", color: "#fafafa" }}
                formatter={(v: number) => [`${v.toFixed(1)}x`, ""]}
              />
              <ReferenceLine y={1.5} stroke="#ef4444" strokeDasharray="6 3" strokeOpacity={0.5} />
              <Area type="monotone" dataKey="meta" stroke="#6366f1" fill="url(#roasMetaGrad)" strokeWidth={2} dot={{ fill: "#6366f1", r: 3, strokeWidth: 0 }} />
              <Area type="monotone" dataKey="google" stroke="#f59e0b" fill="url(#roasGoogleGrad)" strokeWidth={2} dot={{ fill: "#f59e0b", r: 3, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-secondary/50 grid grid-cols-2 gap-4 rounded-lg px-4 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[10px] uppercase tracking-wider">ROAS Meta hoy</span>
            <span className={`font-mono text-lg font-bold ${latestMeta < 1.5 ? "text-alert" : "text-rescue"}`}>{latestMeta.toFixed(1)}x</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[10px] uppercase tracking-wider">ROAS Google hoy</span>
            <span className={`font-mono text-lg font-bold ${latestGoogle < 1.5 ? "text-alert" : "text-rescue"}`}>{latestGoogle.toFixed(1)}x</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
