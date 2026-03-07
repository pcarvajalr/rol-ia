
import { useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { TrendingDown, Pause, Eye, Shield } from "lucide-react"
import {
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
} from "recharts"

const roasData = [
  { day: "Lun", roas: 3.2 },
  { day: "Mar", roas: 2.8 },
  { day: "Mie", roas: 2.5 },
  { day: "Jue", roas: 2.1 },
  { day: "Vie", roas: 1.7 },
  { day: "Sab", roas: 1.3 },
  { day: "Dom", roas: 0.9 },
]

export function ROASGuardian() {
  const [guardianActive, setGuardianActive] = useState(true)

  return (
    <Card className="border-aura/20 bg-card">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-base">
            <span className="bg-alert/20 text-alert inline-flex h-6 w-6 items-center justify-center rounded-md text-xs">
              G2
            </span>
            Guardian de Pauta
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {guardianActive ? (
                <Shield className="text-aura h-3.5 w-3.5" />
              ) : (
                <Eye className="text-muted-foreground h-3.5 w-3.5" />
              )}
              <span
                className={`text-xs font-medium ${guardianActive ? "text-aura" : "text-muted-foreground"}`}
              >
                {guardianActive ? "Guardian Activo" : "Modo Observador"}
              </span>
              <Switch
                checked={guardianActive}
                onCheckedChange={setGuardianActive}
                className="data-[state=checked]:bg-aura"
              />
            </div>
            <Badge variant="outline" className="border-alert/30 text-alert">
              <Pause className="mr-1 h-3 w-3" />
              Campana Pausada
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!guardianActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="bg-secondary/50 border-border/50 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs"
          >
            <Eye className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="text-muted-foreground">
              Modo Observador activo. Rol.IA monitorea el ROAS pero no pausa
              campanas automaticamente.
            </span>
          </motion.div>
        )}

        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={roasData}>
              <defs>
                <linearGradient id="roasGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                stroke="#71717a"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#71717a"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={[0, 4]}
              />
              <ReferenceLine
                y={1.5}
                stroke="#a855f7"
                strokeDasharray="4 4"
                label={{
                  value: "Corte Rol.IA",
                  position: "right",
                  fill: "#a855f7",
                  fontSize: 10,
                }}
              />
              <Area
                type="monotone"
                dataKey="roas"
                stroke="#ef4444"
                fill="url(#roasGrad)"
                strokeWidth={2}
                dot={{ fill: "#ef4444", r: 3 }}
                activeDot={{ r: 5, fill: "#ef4444" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-aura/10 border-aura/20 flex items-start gap-3 rounded-lg border px-4 py-3"
        >
          <TrendingDown className="text-aura mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex flex-col gap-1">
            <span className="text-foreground text-sm font-medium">
              {guardianActive
                ? "Campana Pausada - Sugiriendo nuevo Copy"
                : "ROAS Bajo Detectado - Solo Observando"}
            </span>
            <span className="text-muted-foreground text-xs">
              {guardianActive
                ? "ROAS cayo debajo del umbral de 1.5x. Rol.IA pauso la campana automaticamente y genero 3 variaciones de copy alternativo."
                : "ROAS cayo debajo del umbral de 1.5x. Modo Observador activo - no se toman acciones automaticas."}
            </span>
          </div>
        </motion.div>
      </CardContent>
    </Card>
  )
}
