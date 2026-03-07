
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Rocket, Shield, Eye, ArrowUpRight, ArrowDownRight, Minus, DollarSign } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from "recharts"

interface AdPerformance {
  name: string
  cpl: number
  trend: "up" | "down" | "stable"
  status: "winner" | "loser" | "paused"
  budget: number
  suggestedBudget: number
}

const ads: AdPerformance[] = [
  { name: "Carrusel Urgencia", cpl: 4200, trend: "down", status: "winner", budget: 50000, suggestedBudget: 80000 },
  { name: "Video Testimonial", cpl: 5100, trend: "down", status: "winner", budget: 35000, suggestedBudget: 55000 },
  { name: "Story Lead Form", cpl: 8900, trend: "up", status: "loser", budget: 40000, suggestedBudget: 15000 },
  { name: "Banner Estatico", cpl: 12300, trend: "up", status: "paused", budget: 30000, suggestedBudget: 0 },
  { name: "Reel Educativo", cpl: 6200, trend: "stable", status: "winner", budget: 25000, suggestedBudget: 40000 },
]

const chartData = ads.map((a) => ({
  name: a.name.length > 12 ? a.name.slice(0, 12) + "..." : a.name,
  cpl: a.cpl,
  status: a.status,
}))

const trendIcon = {
  up: <ArrowUpRight className="h-3 w-3" />,
  down: <ArrowDownRight className="h-3 w-3" />,
  stable: <Minus className="h-3 w-3" />,
}

const trendColor = {
  up: "text-alert",
  down: "text-rescue",
  stable: "text-warning",
}

const statusColor = {
  winner: "border-rescue/20 text-rescue bg-rescue/10",
  loser: "border-alert/20 text-alert bg-alert/10",
  paused: "border-muted-foreground/20 text-muted-foreground bg-secondary",
}

const barColor = {
  winner: "#22c55e",
  loser: "#ef4444",
  paused: "#71717a",
}

function formatMoney(n: number) {
  return "$" + (n / 1000).toFixed(0) + "k"
}

export function IntelOptimizer() {
  const [guardianActive, setGuardianActive] = useState(false)

  const totalSaved = ads.reduce((acc, a) => {
    const diff = a.budget - a.suggestedBudget
    return diff > 0 ? acc + diff : acc
  }, 0)

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <div className="bg-rescue/10 flex h-7 w-7 items-center justify-center rounded-lg">
              <Rocket className="text-rescue h-4 w-4" />
            </div>
            Optimizador de Conversion
          </CardTitle>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-rescue/30 text-rescue text-xs">
              <DollarSign className="mr-0.5 h-3 w-3" />
              {formatMoney(totalSaved)} reasignable
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
        {/* CPL bar chart */}
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barSize={28}>
              <XAxis dataKey="name" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f0f13", border: "1px solid #1e1e24", borderRadius: "8px", fontSize: "11px", color: "#fafafa" }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, "CPL"]}
              />
              <Bar dataKey="cpl" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={barColor[entry.status as keyof typeof barColor]} fillOpacity={0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Ad rows */}
        <div className="flex flex-col gap-1.5">
          <div className="text-muted-foreground grid grid-cols-[1fr_70px_60px_80px_80px] items-center gap-2 px-2 text-[10px] font-medium uppercase tracking-wider">
            <span>Anuncio</span>
            <span>CPL</span>
            <span>Trend</span>
            <span className="text-right">Actual</span>
            <span className="text-right">Sugerido</span>
          </div>
          {ads.map((ad) => (
            <div
              key={ad.name}
              className="border-border/30 bg-secondary/30 grid grid-cols-[1fr_70px_60px_80px_80px] items-center gap-2 rounded-lg border px-2 py-2"
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[10px] ${statusColor[ad.status]}`}>
                  {ad.status === "winner" ? "Ganador" : ad.status === "loser" ? "Perdedor" : "Pausado"}
                </Badge>
                <span className="text-foreground truncate text-xs">{ad.name}</span>
              </div>
              <span className="text-foreground font-mono text-xs">${(ad.cpl / 1000).toFixed(1)}k</span>
              <span className={`flex items-center gap-0.5 text-xs ${trendColor[ad.trend]}`}>
                {trendIcon[ad.trend]}
                {ad.trend === "up" ? "Sube" : ad.trend === "down" ? "Baja" : "Est."}
              </span>
              <span className="text-muted-foreground text-right font-mono text-xs">{formatMoney(ad.budget)}</span>
              <span className={`text-right font-mono text-xs ${ad.suggestedBudget > ad.budget ? "text-rescue" : ad.suggestedBudget < ad.budget ? "text-alert" : "text-muted-foreground"}`}>
                {formatMoney(ad.suggestedBudget)}
              </span>
            </div>
          ))}
        </div>

        <AnimatePresence>
          {guardianActive && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-aura/5 border-aura/15 flex items-start gap-2.5 rounded-lg border p-3"
            >
              <Rocket className="text-aura mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="text-muted-foreground text-xs leading-relaxed">
                Guardian activo: reasigna automaticamente presupuesto de anuncios pausados por G2 hacia los ganadores detectados.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
