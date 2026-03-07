
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Clock, Zap, AlertTriangle } from "lucide-react"

function AnimatedClock({ time, color }: { time: string; color: string }) {
  return (
    <motion.span
      className="font-mono text-4xl font-bold tracking-tighter"
      style={{ color }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {time}
    </motion.span>
  )
}

function PulsingValue({ value, color }: { value: string; color: string }) {
  return (
    <motion.span
      className="font-mono text-4xl font-bold tracking-tighter"
      style={{ color }}
      animate={{ opacity: [1, 0.5, 1] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
    >
      {value}
    </motion.span>
  )
}

export function KPICards() {
  const [capitalAtRisk, setCapitalAtRisk] = useState(42850)

  useEffect(() => {
    const interval = setInterval(() => {
      setCapitalAtRisk((prev) => prev + Math.floor(Math.random() * 200 + 50))
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0 }}
      >
        <Card className="border-alert/20 bg-card relative overflow-hidden">
          <div className="bg-alert/5 absolute inset-0" />
          <CardContent className="relative flex flex-col gap-3 p-6">
            <div className="flex items-center gap-2">
              <div className="bg-alert/10 flex h-8 w-8 items-center justify-center rounded-lg">
                <Clock className="text-alert h-4 w-4" />
              </div>
              <span className="text-muted-foreground text-sm font-medium uppercase tracking-wider">
                Resp. Humana Promedio
              </span>
            </div>
            <AnimatedClock time="45:00" color="var(--alert)" />
            <span className="text-alert/70 text-xs">min. de espera</span>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card className="border-rescue/20 bg-card relative overflow-hidden">
          <div className="bg-rescue/5 absolute inset-0" />
          <CardContent className="relative flex flex-col gap-3 p-6">
            <div className="flex items-center gap-2">
              <div className="bg-rescue/10 flex h-8 w-8 items-center justify-center rounded-lg">
                <Zap className="text-rescue h-4 w-4" />
              </div>
              <span className="text-muted-foreground text-sm font-medium uppercase tracking-wider">
                Resp. Rol.IA Promedio
              </span>
            </div>
            <AnimatedClock time="07:02" color="var(--rescue)" />
            <span className="text-rescue/70 text-xs">min. de respuesta</span>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Card className="border-alert/20 bg-card relative overflow-hidden">
          <div className="bg-alert/5 absolute inset-0" />
          <CardContent className="relative flex flex-col gap-3 p-6">
            <div className="flex items-center gap-2">
              <div className="bg-alert/10 flex h-8 w-8 items-center justify-center rounded-lg">
                <AlertTriangle className="text-alert h-4 w-4" />
              </div>
              <span className="text-muted-foreground text-sm font-medium uppercase tracking-wider">
                Capital en Riesgo
              </span>
            </div>
            <PulsingValue
              value={`$${capitalAtRisk.toLocaleString("en-US")}`}
              color="var(--alert)"
            />
            <span className="text-alert/70 text-xs">leads sin atender</span>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
