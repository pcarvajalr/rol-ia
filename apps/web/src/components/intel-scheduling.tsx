
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CalendarCheck, Shield, Eye, Clock, CheckCircle2, PhoneCall, Video } from "lucide-react"
import { useIntelFetch } from "@/hooks/use-intel-fetch"
import { IntelEmptyState } from "./intel-empty-state"
import { Skeleton } from "@/components/ui/skeleton"

interface Appointment {
  id: string
  lead: string
  time: string
  date: string
  channel: "voz" | "whatsapp"
  status: "confirmada" | "pendiente" | "en-curso"
  notes: string
  agent: string
}

interface SchedulingData {
  appointments: Appointment[]
}

const statusConfig = {
  confirmada: { label: "Confirmada", color: "text-rescue", border: "border-rescue/20", bg: "bg-rescue/10", dot: "bg-rescue" },
  "en-curso": { label: "En curso", color: "text-warning", border: "border-warning/20", bg: "bg-warning/10", dot: "bg-warning" },
  pendiente: { label: "Pendiente", color: "text-muted-foreground", border: "border-border/40", bg: "bg-secondary/50", dot: "bg-muted-foreground" },
}

export function IntelScheduling() {
  const { data: fetched, loading } = useIntelFetch<SchedulingData>("/api/intel/scheduling", { appointments: [] })
  const [guardianActive, setGuardianActive] = useState(true)

  if (loading) return <Skeleton className="h-[380px] rounded-xl" />
  if (fetched.appointments.length === 0) return <IntelEmptyState />

  const appointments = fetched.appointments
  const confirmed = appointments.filter((a) => a.status === "confirmada").length
  const total = appointments.length

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <div className="bg-rescue/10 flex h-7 w-7 items-center justify-center rounded-lg">
              <CalendarCheck className="text-rescue h-4 w-4" />
            </div>
            Agenda en Vivo
          </CardTitle>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-rescue/30 text-rescue font-mono text-xs">
              {confirmed}/{total} confirmadas
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
              {guardianActive ? "G7 Activo" : "Activar G7"}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Header row */}
        <div className="text-muted-foreground grid grid-cols-[1fr_60px_80px_80px] items-center gap-2 px-3 text-[10px] font-medium uppercase tracking-wider">
          <span>Lead / Hora</span>
          <span>Canal</span>
          <span>Estado</span>
          <span className="text-right">Agente</span>
        </div>

        {/* Appointments */}
        <div className="flex flex-col gap-1.5">
          <AnimatePresence>
            {appointments.map((apt) => {
              const cfg = statusConfig[apt.status]
              return (
                <motion.div
                  key={apt.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`grid grid-cols-[1fr_60px_80px_80px] items-center gap-2 rounded-lg border px-3 py-2.5 ${cfg.border} ${cfg.bg}`}
                >
                  <div className="flex flex-col">
                    <span className="text-foreground text-xs font-medium">{apt.lead}</span>
                    <div className="text-muted-foreground flex items-center gap-1 text-[10px]">
                      <Clock className="h-2.5 w-2.5" />
                      {apt.date ? `${apt.date} · ${apt.time}` : apt.time}
                    </div>
                    {apt.notes && (
                      <span className="text-muted-foreground/70 mt-0.5 text-[9px] italic leading-tight line-clamp-1">
                        {apt.notes}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {apt.channel === "voz" ? (
                      <PhoneCall className="text-aura h-3 w-3" />
                    ) : (
                      <Video className="text-rescue h-3 w-3" />
                    )}
                    <span className="text-muted-foreground text-[10px] capitalize">{apt.channel}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                    <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <span className="text-aura text-right text-[10px] font-medium">{apt.agent}</span>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {guardianActive && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-aura/5 border-aura/15 flex items-start gap-2.5 rounded-lg border p-3"
            >
              <CheckCircle2 className="text-aura mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="text-muted-foreground text-xs leading-relaxed">
                G7 confirma citas automaticamente via WhatsApp + correo y actualiza Google Calendar en tiempo real.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
