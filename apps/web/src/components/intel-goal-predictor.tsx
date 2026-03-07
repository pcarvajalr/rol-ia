
import { useState, useMemo } from "react"
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

const MONTHLY_GOAL = 120

function buildSalesData() {
  const actual = [18, 29, 37, 48, 55, 63, 70, 78]
  const dayLabels = ["Dia 1", "Dia 4", "Dia 7", "Dia 10", "Dia 13", "Dia 16", "Dia 19", "Dia 22"]
  const data: { day: string; actual?: number; forecast?: number }[] = []

  for (let i = 0; i < actual.length; i++) {
    data.push({ day: dayLabels[i], actual: actual[i] })
  }

  // Simple linear regression for forecast
  const n = actual.length
  const xMean = (n - 1) / 2
  const yMean = actual.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (actual[i] - yMean)
    den += (i - xMean) * (i - xMean)
  }
  const slope = den !== 0 ? num / den : 0
  const intercept = yMean - slope * xMean

  const forecastDays = ["Dia 25", "Dia 28", "Dia 30"]
  const forecastIndices = [8, 9, 10]

  // Bridge point: last actual + first forecast
  data[data.length - 1].forecast = actual[actual.length - 1]

  for (let j = 0; j < forecastDays.length; j++) {
    const predicted = Math.round(intercept + slope * forecastIndices[j])
    data.push({ day: forecastDays[j], forecast: predicted })
  }

  return data
}

export function IntelGoalPredictor() {
  const [guardianActive, setGuardianActive] = useState(false)
  const data = useMemo(() => buildSalesData(), [])

  const lastForecast = data[data.length - 1].forecast ?? 0
  const willReach = lastForecast >= MONTHLY_GOAL
  const pct = Math.round((lastForecast / MONTHLY_GOAL) * 100)

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
            <span className="text-muted-foreground text-[11px]">Meta ({MONTHLY_GOAL})</span>
          </div>
        </div>

        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis dataKey="day" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} domain={[0, MONTHLY_GOAL + 20]} />
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
                y={MONTHLY_GOAL}
                stroke="#ef4444"
                strokeDasharray="6 3"
                strokeOpacity={0.5}
                label={{
                  value: `Meta ${MONTHLY_GOAL}`,
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
              <>Alerta: la proyeccion indica <span className="text-alert font-medium">{MONTHLY_GOAL - lastForecast} ventas por debajo</span> de la meta. Se recomienda aumentar inversion o activar campanas adicionales.</>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
