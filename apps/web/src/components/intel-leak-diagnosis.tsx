
import { useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Brain, Shield, Eye } from "lucide-react"
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from "recharts"

interface LeakReason {
  name: string
  frequency: number
  impact: number
  size: number
  color: string
}

const reasons: LeakReason[] = [
  { name: "Vendedor saturado", frequency: 38, impact: 85, size: 420, color: "#ef4444" },
  { name: "Horario inhabil", frequency: 27, impact: 60, size: 310, color: "#f59e0b" },
  { name: "Lead de baja calidad", frequency: 22, impact: 35, size: 250, color: "#6366f1" },
  { name: "Sin numero valido", frequency: 15, impact: 70, size: 180, color: "#a855f7" },
  { name: "CRM desactualizado", frequency: 12, impact: 50, size: 150, color: "#f59e0b" },
  { name: "Canal equivocado", frequency: 9, impact: 40, size: 120, color: "#6366f1" },
  { name: "Respuesta generica", frequency: 18, impact: 55, size: 200, color: "#ef4444" },
  { name: "Doble asignacion", frequency: 8, impact: 30, size: 100, color: "#22c55e" },
]

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: LeakReason }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="border-border/60 bg-card rounded-lg border px-3 py-2 shadow-xl">
      <p className="text-foreground mb-1 text-xs font-semibold">{d.name}</p>
      <p className="text-muted-foreground text-[11px]">Frecuencia: {d.frequency}%</p>
      <p className="text-muted-foreground text-[11px]">Impacto: {d.impact}/100</p>
    </div>
  )
}

export function IntelLeakDiagnosis() {
  const [guardianActive, setGuardianActive] = useState(false)

  const topReason = reasons.reduce((a, b) => (a.frequency > b.frequency ? a : b))

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
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-alert/30 text-alert text-xs">
              #{topReason.name}
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
          <span className="text-muted-foreground text-[11px]">X: Frecuencia (%) | Y: Impacto (0-100) | Tamano: Volumen</span>
        </div>

        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <XAxis
                type="number"
                dataKey="frequency"
                name="Frecuencia"
                unit="%"
                stroke="#71717a"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                domain={[0, 50]}
              />
              <YAxis
                type="number"
                dataKey="impact"
                name="Impacto"
                stroke="#71717a"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
              />
              <ZAxis type="number" dataKey="size" range={[60, 400]} />
              <Tooltip content={<CustomTooltip />} />
              <Scatter data={reasons}>
                {reasons.map((r, i) => (
                  <Cell key={i} fill={r.color} fillOpacity={0.7} stroke={r.color} strokeWidth={1} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Word-cloud-style tags */}
        <div className="flex flex-wrap gap-2">
          {reasons
            .sort((a, b) => b.frequency - a.frequency)
            .map((r) => {
              const scale = 0.7 + (r.frequency / 40) * 0.6
              return (
                <motion.div
                  key={r.name}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-lg border px-2.5 py-1.5"
                  style={{
                    fontSize: `${Math.round(10 * scale)}px`,
                    borderColor: `${r.color}33`,
                    color: r.color,
                    backgroundColor: `${r.color}0a`,
                  }}
                >
                  {r.name}
                  <span className="ml-1.5 opacity-60">{r.frequency}%</span>
                </motion.div>
              )
            })}
        </div>
      </CardContent>
    </Card>
  )
}
