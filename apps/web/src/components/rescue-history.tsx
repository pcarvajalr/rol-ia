
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { XCircle, CheckCircle2, User, Zap } from "lucide-react"
import { useIntelFetch } from "@/hooks/use-intel-fetch"
import { IntelEmptyState } from "./intel-empty-state"
import { Skeleton } from "@/components/ui/skeleton"

interface HistoryItem {
  time: string
  human: string
  aura: string
}

interface RescueHistoryData {
  items: HistoryItem[]
}

export function RescueHistory() {
  const { data, loading } = useIntelFetch<RescueHistoryData>("/api/intel/rescue-history", { items: [] })

  if (loading) return <Skeleton className="h-[300px] rounded-xl" />
  if (data.items.length === 0) return <IntelEmptyState />

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
          {data.items.map((item, i) => (
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
