
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Zap } from "lucide-react"

interface DemoToggleProps {
  enabled: boolean
  onToggle: (value: boolean) => void
}

export function DemoToggle({ enabled, onToggle }: DemoToggleProps) {
  return (
    <div className="bg-secondary/50 border-aura/10 flex items-center gap-3 rounded-lg border px-4 py-2">
      <Zap className="text-aura h-4 w-4" />
      <span className="text-foreground text-sm font-medium">Demo Mode</span>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        className="data-[state=checked]:bg-aura"
      />
      {enabled && (
        <Badge variant="outline" className="border-aura/30 text-aura text-xs">
          7min = 15s
        </Badge>
      )}
    </div>
  )
}
