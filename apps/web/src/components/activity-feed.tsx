
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
  Lock,
} from "lucide-react"
import { useIntelFetch } from "@/hooks/use-intel-fetch"
import { IntelEmptyState } from "./intel-empty-state"
import { Skeleton } from "@/components/ui/skeleton"

interface LogEntry {
  id: number
  time: string
  message: string
  type: "webhook" | "alert" | "whatsapp" | "vapi" | "success" | "info" | "config"
}

// slaMinutes disponible en tenant.settings.guardian si se necesita en el futuro

interface ActivityFeedData {
  logs: LogEntry[]
}

const iconMap = {
  webhook: <Webhook className="h-3.5 w-3.5" />,
  alert: <AlertTriangle className="h-3.5 w-3.5" />,
  whatsapp: <MessageCircle className="h-3.5 w-3.5" />,
  vapi: <PhoneCall className="h-3.5 w-3.5" />,
  success: <CalendarCheck className="h-3.5 w-3.5" />,
  info: <CircleDot className="h-3.5 w-3.5" />,
  config: <CircleDot className="h-3.5 w-3.5" />,
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

export function ActivityFeed() {
  const { data, loading } = useIntelFetch<ActivityFeedData>("/api/intel/activity-feed", { logs: [] })

  if (loading) return <Skeleton className="h-[520px] rounded-xl" />
  if (data.logs.length === 0) return <IntelEmptyState />

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
              {data.logs.map((log) => (
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
