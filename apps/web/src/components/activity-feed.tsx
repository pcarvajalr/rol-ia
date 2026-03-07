
import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Webhook,
  AlertTriangle,
  MessageCircle,
  PhoneCall,
  CalendarCheck,
  CircleDot,
  Settings2,
  Lock,
} from "lucide-react"

interface LogEntry {
  id: number
  time: string
  message: string
  type: "webhook" | "alert" | "whatsapp" | "vapi" | "success" | "info" | "config"
}

interface ActivityFeedProps {
  slaMinutes: number
}

function buildStaticLogs(slaMinutes: number): LogEntry[] {
  const baseHour = 9
  const baseMin = 0
  const triggerMin = baseMin + slaMinutes
  const triggerHourStr = String(baseHour + Math.floor(triggerMin / 60)).padStart(2, "0")
  const triggerMinStr = String(triggerMin % 60).padStart(2, "0")

  return [
    {
      id: 0,
      time: "08:59:50",
      message: `[Config] SLA definido en ${slaMinutes} min. Rol.IA intervenira a las ${triggerHourStr}:${triggerMinStr}:00.`,
      type: "config",
    },
    {
      id: 1,
      time: "09:00:01",
      message: 'Webhook recibido: Lead "Juan Perez" ingreso.',
      type: "webhook",
    },
    {
      id: 2,
      time: `${triggerHourStr}:${triggerMinStr}:00`,
      message: "Alerta: Humano no atendio. Iniciando secuencia Rol.IA.",
      type: "alert",
    },
    {
      id: 3,
      time: `${triggerHourStr}:${triggerMinStr}:05`,
      message: "Mensaje enviado via [MOD-MSG-ENCRYPTED].",
      type: "whatsapp",
    },
    {
      id: 4,
      time: `${triggerHourStr}:${String(parseInt(triggerMinStr) + 2).padStart(2, "0")}:05`,
      message: "Sin respuesta. Disparando llamada via [MOD-VOZ-ENCRYPTED].",
      type: "vapi",
    },
    {
      id: 5,
      time: `${triggerHourStr}:${String(parseInt(triggerMinStr) + 3).padStart(2, "0")}:30`,
      message: "EXITO! Cita agendada en Google Calendar.",
      type: "success",
    },
  ]
}

const additionalLogs: LogEntry[] = [
  {
    id: 6,
    time: "09:15:12",
    message: 'Webhook recibido: Lead "Maria Lopez" ingreso.',
    type: "webhook",
  },
  {
    id: 7,
    time: "09:15:15",
    message: "CRM enriquecido via [MOD-CRM-ENCRYPTED]: empresa Fintech SA.",
    type: "info",
  },
  {
    id: 8,
    time: "09:22:15",
    message: "Alerta: Humano no atendio. Secuencia Rol.IA activada.",
    type: "alert",
  },
  {
    id: 9,
    time: "09:22:20",
    message: "Mensaje personalizado enviado via [MOD-MSG-ENCRYPTED].",
    type: "whatsapp",
  },
  {
    id: 10,
    time: "09:23:45",
    message: "Respuesta recibida. Lead interesado.",
    type: "success",
  },
  {
    id: 11,
    time: "09:30:00",
    message: 'Webhook recibido: Lead "Carlos Ruiz" ingreso.',
    type: "webhook",
  },
  {
    id: 12,
    time: "09:37:00",
    message: "Alerta: Sin respuesta humana. IA interviniendo.",
    type: "alert",
  },
]

const iconMap = {
  webhook: <Webhook className="h-3.5 w-3.5" />,
  alert: <AlertTriangle className="h-3.5 w-3.5" />,
  whatsapp: <MessageCircle className="h-3.5 w-3.5" />,
  vapi: <PhoneCall className="h-3.5 w-3.5" />,
  success: <CalendarCheck className="h-3.5 w-3.5" />,
  info: <CircleDot className="h-3.5 w-3.5" />,
  config: <Settings2 className="h-3.5 w-3.5" />,
}

const colorMap = {
  webhook: "text-aura",
  alert: "text-alert",
  whatsapp: "text-rescue",
  vapi: "text-aura",
  success: "text-rescue",
  info: "text-muted-foreground",
  config: "text-aura",
}

const dotColorMap = {
  webhook: "bg-aura",
  alert: "bg-alert",
  whatsapp: "bg-rescue",
  vapi: "bg-aura",
  success: "bg-rescue",
  info: "bg-muted-foreground",
  config: "bg-aura",
}

export function ActivityFeed({ slaMinutes }: ActivityFeedProps) {
  const [logs, setLogs] = useState<LogEntry[]>(() => buildStaticLogs(slaMinutes))
  const addIndex = useRef(0)

  // Rebuild static logs when SLA changes
  useEffect(() => {
    setLogs(buildStaticLogs(slaMinutes))
    addIndex.current = 0
  }, [slaMinutes])

  useEffect(() => {
    const interval = setInterval(() => {
      if (addIndex.current < additionalLogs.length) {
        setLogs((prev) => [...prev, additionalLogs[addIndex.current]])
        addIndex.current++
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Card className="border-aura/20 bg-card flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-foreground flex items-center gap-2 text-base">
          <span className="bg-aura relative flex h-2 w-2">
            <span className="bg-aura absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
            <span className="bg-aura relative inline-flex h-2 w-2 rounded-full" />
          </span>
          Bitacora Rol.IA - Actividad en Vivo
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col overflow-hidden">
        <ScrollArea className="h-[480px]">
          <div className="flex flex-col gap-1 pr-3">
            <AnimatePresence initial={false}>
              {logs.map((log) => (
                <motion.div
                  key={`${log.id}-${log.time}`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex items-start gap-3 rounded-md px-2 py-2 hover:bg-secondary/30 ${
                    log.type === "config" ? "bg-aura/5" : ""
                  }`}
                >
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded ${dotColorMap[log.type]}/10 ${colorMap[log.type]}`}
                    >
                      {iconMap[log.type]}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {log.time}
                    </span>
                    <span
                      className={`text-xs leading-relaxed ${
                        log.type === "success"
                          ? "text-rescue font-medium"
                          : log.type === "alert"
                            ? "text-alert/90"
                            : log.type === "config"
                              ? "text-aura/90 font-mono"
                              : "text-foreground/80"
                      }`}
                    >
                      {log.message}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>

        {/* Encrypted tools legend */}
        <div className="border-border/30 mt-3 flex items-start gap-2 border-t pt-3">
          <Lock className="text-muted-foreground mt-0.5 h-3 w-3 shrink-0" />
          <p className="text-muted-foreground text-[10px] italic leading-relaxed">
            Los nombres de las herramientas se mantienen cifrados por seguridad
            del ecosistema. [MOD-MSG], [MOD-VOZ], [MOD-CRM] representan modulos
            protegidos.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
