
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { XCircle, CheckCircle2, User, Zap } from "lucide-react"

const historyItems = [
  {
    human: "Sin actividad - 45 min sin respuesta",
    aura: "WhatsApp de cortesia enviado (Clientify Log)",
    time: "09:00",
  },
  {
    human: "Lead enfriandose - Sin seguimiento",
    aura: "Llamada de agendamiento exitosa (Vapi Log)",
    time: "09:10",
  },
  {
    human: "Perdida de oportunidad - Lead perdido",
    aura: "Cita agendada en Google Calendar",
    time: "09:15",
  },
  {
    human: "Sin actividad - Lead nocturno ignorado",
    aura: "Secuencia automatica a las 08:00 siguiente",
    time: "23:30",
  },
  {
    human: "Respuesta generica copiada/pegada",
    aura: "Mensaje personalizado basado en contexto CRM",
    time: "10:20",
  },
]

export function RescueHistory() {
  return (
    <Card className="border-aura/20 bg-card">
      <CardHeader>
        <CardTitle className="text-foreground text-base">
          Historial de Rescate - Bitacora Forense
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-4 px-2 pb-2">
            <span className="text-muted-foreground w-12 text-xs">Hora</span>
            <div className="text-alert flex items-center gap-1.5 text-xs font-medium">
              <User className="h-3 w-3" />
              Humano
            </div>
            <div className="text-rescue flex items-center gap-1.5 text-xs font-medium">
              <Zap className="h-3 w-3" />
              Rol.IA
            </div>
          </div>
          {historyItems.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1, duration: 0.3 }}
              className="bg-secondary/50 grid grid-cols-[auto_1fr_1fr] items-start gap-4 rounded-lg px-3 py-3"
            >
              <span className="text-muted-foreground font-mono text-xs leading-5">
                {item.time}
              </span>
              <div className="text-alert/80 flex items-start gap-2 text-xs leading-5">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {item.human}
              </div>
              <div className="text-rescue/90 flex items-start gap-2 text-xs leading-5">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {item.aura}
              </div>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
