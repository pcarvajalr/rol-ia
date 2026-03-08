
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Pencil, Shield, Eye, Sparkles, ThumbsUp, ThumbsDown, Minus } from "lucide-react"
import { useIntelFetch } from "@/hooks/use-intel-fetch"
import { IntelEmptyState } from "./intel-empty-state"
import { Skeleton } from "@/components/ui/skeleton"

interface HookVariation {
  id: number
  hook: string
  angle: string
  sentiment: "positive" | "neutral" | "negative"
  score: number
}

interface BriefItem {
  label: string
  value: string
}

interface CopywriterData {
  hooks: HookVariation[]
  designBrief: BriefItem[]
}

const sentimentIcon = {
  positive: <ThumbsUp className="h-3 w-3" />,
  neutral: <Minus className="h-3 w-3" />,
  negative: <ThumbsDown className="h-3 w-3" />,
}

const sentimentColor = {
  positive: "text-rescue border-rescue/20 bg-rescue/10",
  neutral: "text-warning border-warning/20 bg-warning/10",
  negative: "text-alert border-alert/20 bg-alert/10",
}

export function IntelCopywriter() {
  const { data, loading } = useIntelFetch<CopywriterData>("/api/intel/copywriter", { hooks: [], designBrief: [] })
  const [guardianActive, setGuardianActive] = useState(false)
  const [selectedHook, setSelectedHook] = useState<number | null>(null)

  if (loading) return <Skeleton className="h-[420px] rounded-xl" />
  if (data.hooks.length === 0) return <IntelEmptyState />

  const hooks = data.hooks as HookVariation[]
  const designBrief = data.designBrief as BriefItem[]

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <div className="bg-aura/10 flex h-7 w-7 items-center justify-center rounded-lg">
              <Pencil className="text-aura h-4 w-4" />
            </div>
            Copywriter IA
          </CardTitle>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-rescue/30 text-rescue text-xs">
              <Sparkles className="mr-1 h-3 w-3" />
              {hooks.length} hooks generados
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
        {/* Hooks list */}
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
            Variaciones de Hook
          </span>
          {hooks.map((h) => (
            <motion.button
              key={h.id}
              onClick={() => setSelectedHook(selectedHook === h.id ? null : h.id)}
              className={`border-border/40 hover:border-aura/20 flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors ${
                selectedHook === h.id ? "border-aura/30 bg-aura/5" : "bg-secondary/30"
              }`}
              whileTap={{ scale: 0.99 }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-foreground text-xs leading-relaxed">
                  &ldquo;{h.hook}&rdquo;
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium ${sentimentColor[h.sentiment]}`}>
                    {sentimentIcon[h.sentiment]}
                    {h.score}%
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-border/40 text-muted-foreground text-[10px]">
                  {h.angle}
                </Badge>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Design brief */}
        {designBrief.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
              Brief de Diseno
            </span>
            <div className="bg-secondary/30 border-border/40 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border p-3">
              {designBrief.map((item) => (
                <div key={item.label} className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground text-[10px] uppercase tracking-wider">{item.label}</span>
                  <span className="text-foreground text-xs">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence>
          {guardianActive && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-aura/5 border-aura/15 flex items-start gap-2.5 rounded-lg border p-3"
            >
              <Sparkles className="text-aura mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="text-muted-foreground text-xs leading-relaxed">
                Guardian activo: cuando G2 pause una campana, este guardian genera automaticamente 3 variaciones de copy y un brief de diseno para reactivar el anuncio.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
