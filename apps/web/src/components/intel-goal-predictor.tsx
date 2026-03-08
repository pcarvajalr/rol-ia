
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
} from "recharts"
import { TrendingUp, Shield, Eye, Target } from "lucide-react"
import { useIntelFetch } from "@/hooks/use-intel-fetch"
import { IntelEmptyState } from "./intel-empty-state"
import { Skeleton } from "@/components/ui/skeleton"

interface GoalPoint {
  day: string
  actual?: number
  forecast?: number
}

interface GoalData {
  monthlyGoal: number
  points: GoalPoint[]
}

export function IntelGoalPredictor() {
  const { data, loading } = useIntelFetch<GoalData>("/api/intel/goal-predictor", { monthlyGoal: 0, points: [] })
  const [guardianActive, setGuardianActive] = useState(false)

  if (loading) return <Skeleton className="h-[400px] rounded-xl" />
  if (data.points.length === 0) return <IntelEmptyState />

  const { monthlyGoal, points } = data
  const lastForecast = points[points.length - 1].forecast ?? points[points.length - 1].actual ?? 0
  const willReach = lastForecast >= monthlyGoal
  const pct = monthlyGoal > 0 ? Math.round((lastForecast / monthlyGoal) * 100) : 0

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <div className="bg-rescue/10 flex h-7 w-7 items-center justify-center rounded-lg">
              <TrendingUp className="text-rescue h-4 w-4" />
            </div>
            Predictor de Metas
          </CardTitle>
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className={`font-mono text-xs ${
                willReach
                  ? "border-rescue/30 text-rescue"
                  : "border-alert/30 text-alert"
              }`}
            >
              <Target className="mr-1 h-3 w-3" />
              {pct}% de meta
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
            <span className="bg-aura h-2 w-2 rounded-full" />
            <span className="text-muted-foreground text-[11px]">Ventas Reales</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="border-rescue h-2 w-2 rounded-full border border-dashed" />
            <span className="text-muted-foreground text-[11px]">Forecasting IA</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-alert/50 h-px w-4" />
            <span className="text-muted-foreground text-[11px]">Meta ({monthlyGoal})</span>
          </div>
        </div>

        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <XAxis dataKey="day" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} domain={[0, monthlyGoal + 20]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f0f13",
                  border: "1px solid #1e1e24",
                  borderRadius: "8px",
                  fontSize: "11px",
                  color: "#fafafa",
                }}
              />
              <ReferenceLine
                y={monthlyGoal}
                stroke="#ef4444"
                strokeDasharray="6 3"
                strokeOpacity={0.5}
                label={{
                  value: `Meta ${monthlyGoal}`,
                  position: "right",
                  fill: "#ef4444",
                  fontSize: 10,
                }}
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#a855f7"
                strokeWidth={2}
                dot={{ fill: "#a855f7", r: 3, strokeWidth: 0 }}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="forecast"
                stroke="#22c55e"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={{ fill: "#22c55e", r: 3, stroke: "#22c55e", strokeWidth: 1 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-secondary/50 rounded-lg px-4 py-3">
          <p className="text-muted-foreground text-xs leading-relaxed">
            {willReach ? (
              <>Basado en la tendencia actual, se proyecta <span className="text-rescue font-medium">alcanzar la meta</span> con {lastForecast} ventas estimadas al cierre del mes.</>
            ) : (
              <>Alerta: la proyeccion indica <span className="text-alert font-medium">{monthlyGoal - lastForecast} ventas por debajo</span> de la meta. Se recomienda aumentar inversion o activar campanas adicionales.</>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
