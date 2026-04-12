
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { XCircle, CheckCircle2, User, Zap, Shield } from "lucide-react"
import { useIntelFetch } from "@/hooks/use-intel-fetch"
import { IntelEmptyState } from "./intel-empty-state"
import { Skeleton } from "@/components/ui/skeleton"

interface HistoryItem {
  time: string
  leadNombre: string
  vendedor: string
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4 text-blue-500" />
          Registro de Rescates por Vendedor
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {/* Header */}
          <div className="grid grid-cols-[50px_120px_100px_1fr_1fr] items-center gap-3 px-3 pb-2">
            <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Hora</span>
            <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Lead</span>
            <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Vendedor</span>
            <div className="text-destructive flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
              <User className="h-3 w-3" />
              Falla Humana
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-green-500">
              <Zap className="h-3 w-3" />
              Rescate ROL.IA
            </div>
          </div>

          {data.items.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
              className="grid grid-cols-[50px_120px_100px_1fr_1fr] items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/30"
            >
              <span className="text-muted-foreground font-mono text-xs">
                {item.time}
              </span>
              <span className="truncate text-xs font-medium">
                {item.leadNombre}
              </span>
              <Badge variant="outline" className="w-fit text-[10px] font-normal">
                {item.vendedor}
              </Badge>
              <div className="text-destructive/80 flex items-start gap-2 text-xs">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{item.human}</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-green-500/90">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{item.aura}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
