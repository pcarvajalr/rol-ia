
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Brain, TrendingDown, BarChart3, Radar as RadarIcon } from "lucide-react"
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LabelList,
} from "recharts"
import { useIntelFetch } from "@/hooks/use-intel-fetch"
import { IntelEmptyState } from "./intel-empty-state"
import { Skeleton } from "@/components/ui/skeleton"

interface LeakReason {
  name: string
  frequency: number
  impact: number
  volume: number
}

interface LeakData {
  lossIndex: { lost: number; total: number; percentage: number }
  reasons: LeakReason[]
}

const EMPTY: LeakData = { lossIndex: { lost: 0, total: 0, percentage: 0 }, reasons: [] }

// --- Gauge (semicircle) ---

function GaugeChart({ percentage }: { percentage: number }) {
  const value = Math.min(Math.max(percentage, 0), 100)

  const getColor = (v: number) => {
    if (v < 33) return "#22c55e"
    if (v < 66) return "#f59e0b"
    return "#ef4444"
  }

  const getLabel = (v: number) => {
    if (v < 33) return "Saludable"
    if (v < 66) return "Precaucion"
    return "Critico"
  }

  const color = getColor(value)

  // Semicircle: filled portion + remaining
  const data = [
    { value, name: "lost" },
    { value: 100 - value, name: "remaining" },
  ]

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[130px] w-[220px]">
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="75%"
              startAngle={180}
              endAngle={0}
              innerRadius={70}
              outerRadius={95}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill="#27272a" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className="text-2xl font-bold" style={{ color }}>{value}%</span>
          <span className="text-muted-foreground text-[11px]">{getLabel(value)}</span>
        </div>
      </div>
      {/* Colored zones indicator */}
      <div className="mt-1 flex gap-3 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#22c55e]" /> &lt;33%
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#f59e0b]" /> 33-66%
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[#ef4444]" /> &gt;66%
        </span>
      </div>
    </div>
  )
}

// --- Horizontal bars tooltip ---

function BarTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: LeakReason }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="border-border/60 bg-card rounded-lg border px-3 py-2 shadow-xl">
      <p className="text-foreground mb-1 text-xs font-semibold">{d.name}</p>
      <p className="text-muted-foreground text-[11px]">Frecuencia: {d.frequency}%</p>
    </div>
  )
}

// --- Radar tooltip ---

function RadarTooltip({ active, payload, label, unit }: { active?: boolean; payload?: Array<{ value: number }>; label?: string; unit: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="border-border/60 bg-card rounded-lg border px-3 py-2 shadow-xl">
      <p className="text-foreground mb-1 text-xs font-semibold">{label}</p>
      <p className="text-muted-foreground text-[11px]">{payload[0].value.toLocaleString()} {unit}</p>
    </div>
  )
}

// --- Main component ---

export function IntelLeakDiagnosis() {
  const { data, loading } = useIntelFetch<LeakData>("/api/intel/leak-diagnosis", EMPTY)

  if (loading) return <Skeleton className="h-[520px] rounded-xl" />
  if (data.reasons.length === 0) return <IntelEmptyState />

  const { lossIndex, reasons } = data

  // Bar chart: first (highest frequency) is red, rest friendly blue
  const barData = [...reasons].sort((a, b) => b.frequency - a.frequency)
  const maxFrequency = Math.ceil((barData[0]?.frequency ?? 100) * 1.15)

  // Radar data
  const radarImpact = reasons.map((r) => ({ name: r.name, value: r.impact * 1000 }))
  const radarVolume = reasons.map((r) => ({ name: r.name, value: r.volume }))

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <div className="bg-warning/10 flex h-7 w-7 items-center justify-center rounded-lg">
              <Brain className="text-warning h-4 w-4" />
            </div>
            Diagnostico de Fuga
          </CardTitle>
          <Badge variant="outline" className="border-alert/30 text-alert text-xs">
            {lossIndex.lost} de {lossIndex.total} leads perdidos
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {/* ---- 1. Gauge: Indice Global Perdida ---- */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <TrendingDown className="text-muted-foreground h-3.5 w-3.5" />
            <span className="text-muted-foreground text-xs font-medium">Indice Global Perdida Leads</span>
          </div>
          <GaugeChart percentage={lossIndex.percentage} />
        </div>

        {/* ---- 2. Barras horizontales: Frecuencia por motivo ---- */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <BarChart3 className="text-muted-foreground h-3.5 w-3.5" />
            <span className="text-muted-foreground text-xs font-medium">Frecuencia por Motivo</span>
          </div>
          <div style={{ height: barData.length * 36 + 16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
                <XAxis type="number" domain={[0, maxFrequency]} unit="%" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={130} stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip content={<BarTooltip />} cursor={false} />
                <Bar dataKey="frequency" radius={[0, 4, 4, 0]} barSize={18}>
                  {barData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "#ef4444" : "#6366f1"} fillOpacity={i === 0 ? 0.85 : 0.6} />
                  ))}
                  <LabelList dataKey="frequency" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 10, fill: "#a1a1aa" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ---- 3. Dos Radares ---- */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <RadarIcon className="text-muted-foreground h-3.5 w-3.5" />
            <span className="text-muted-foreground text-xs font-medium">Impacto por Motivo</span>
          </div>
          <div className="flex flex-col gap-4">
            {/* Radar A: Impacto x 1000 (dinero) */}
            <div className="flex flex-col items-center">
              <span className="text-muted-foreground mb-1 text-[11px]">Perdida Estimada ($)</span>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarImpact} cx="50%" cy="50%" outerRadius="75%">
                    <PolarGrid stroke="#3f3f46" />
                    <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: "#a1a1aa" }} />
                    <PolarRadiusAxis tick={{ fontSize: 9, fill: "#71717a" }} axisLine={false} />
                    <Tooltip content={<RadarTooltip unit="$" />} />
                    <Radar dataKey="value" stroke="#ef4444" fill="#ef4444" fillOpacity={0.25} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Radar B: Volumen (leads) */}
            <div className="flex flex-col items-center">
              <span className="text-muted-foreground mb-1 text-[11px]">Leads Perdidos (cantidad)</span>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarVolume} cx="50%" cy="50%" outerRadius="75%">
                    <PolarGrid stroke="#3f3f46" />
                    <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: "#a1a1aa" }} />
                    <PolarRadiusAxis tick={{ fontSize: 9, fill: "#71717a" }} axisLine={false} />
                    <Tooltip content={<RadarTooltip unit="leads" />} />
                    <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
