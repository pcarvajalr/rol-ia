import { Card, CardContent } from "@/components/ui/card"
import { InboxIcon } from "lucide-react"

export function IntelEmptyState() {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
        <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-xl">
          <InboxIcon className="text-muted-foreground h-6 w-6" />
        </div>
        <p className="text-muted-foreground text-sm">No hay datos disponibles</p>
      </CardContent>
    </Card>
  )
}
