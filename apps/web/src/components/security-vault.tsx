
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Lock,
  Unlock,
  MessageSquare,
  Mic,
  Phone,
  Database,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react"

const VAULT_PASSWORD = "Tato123"

interface CredentialField {
  label: string
  placeholder: string
}

interface Module {
  id: string
  title: string
  icon: React.ReactNode
  fields: CredentialField[]
}

const modules: Module[] = [
  {
    id: "messaging",
    title: "Modulo de Mensajeria",
    icon: <MessageSquare className="h-4 w-4" />,
    fields: [
      { label: "ID Cuenta", placeholder: "••••••••" },
      { label: "ID Dispositivo", placeholder: "••••••••" },
      { label: "Numero de Envio", placeholder: "••••••••" },
      { label: "Token de Acceso", placeholder: "••••••••" },
    ],
  },
  {
    id: "voice",
    title: "Modulo de Voz",
    icon: <Mic className="h-4 w-4" />,
    fields: [
      { label: "ID de Asistente", placeholder: "••••••••" },
      { label: "ID de Linea", placeholder: "••••••••" },
      { label: "Token de Autorizacion", placeholder: "••••••••" },
    ],
  },
  {
    id: "telephony",
    title: "Modulo de Telefonia",
    icon: <Phone className="h-4 w-4" />,
    fields: [
      { label: "SID", placeholder: "••••••••" },
      { label: "Numero de Origen", placeholder: "••••••••" },
      { label: "Token Privado", placeholder: "••••••••" },
    ],
  },
  {
    id: "crm",
    title: "Modulo de CRM",
    icon: <Database className="h-4 w-4" />,
    fields: [
      { label: "Token de Integracion API", placeholder: "••••••••" },
    ],
  },
]

export function SecurityVault() {
  const [isLocked, setIsLocked] = useState(true)
  const [password, setPassword] = useState("")
  const [error, setError] = useState(false)
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})
  const [credentials, setCredentials] = useState<Record<string, Record<string, string>>>({})

  const handleUnlock = () => {
    if (password === VAULT_PASSWORD) {
      setIsLocked(false)
      setError(false)
      setPassword("")
    } else {
      setError(true)
      setTimeout(() => setError(false), 2000)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleUnlock()
  }

  const toggleFieldVisibility = (moduleId: string) => {
    setShowPasswords((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }))
  }

  const updateCredential = (moduleId: string, field: string, value: string) => {
    setCredentials((prev) => ({
      ...prev,
      [moduleId]: { ...prev[moduleId], [field]: value },
    }))
  }

  return (
    <Card className="border-aura/20 bg-card">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-base">
            <div className="bg-aura/10 flex h-6 w-6 items-center justify-center rounded-md">
              {isLocked ? (
                <Lock className="text-aura h-3.5 w-3.5" />
              ) : (
                <Unlock className="text-rescue h-3.5 w-3.5" />
              )}
            </div>
            Conectividad de Ecosistema
          </CardTitle>
          {!isLocked && (
            <Badge
              variant="outline"
              className="border-rescue/30 text-rescue text-xs"
            >
              <ShieldCheck className="mr-1 h-3 w-3" />
              Acceso Verificado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          {isLocked ? (
            <motion.div
              key="locked"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 py-6"
            >
              <div className="bg-aura/5 border-aura/10 flex h-16 w-16 items-center justify-center rounded-full border">
                <Lock className="text-aura h-7 w-7" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-foreground text-sm font-medium">
                  Boveda Protegida
                </span>
                <span className="text-muted-foreground text-center text-xs">
                  Ingrese la clave de acceso para ver las credenciales del
                  ecosistema.
                </span>
              </div>
              <div className="flex w-full max-w-xs items-center gap-2">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Clave de acceso"
                  className={`border-border/50 bg-secondary/50 text-foreground text-sm ${error ? "border-alert ring-alert/20 ring-2" : "focus-visible:border-aura focus-visible:ring-aura/30"}`}
                />
                <Button
                  onClick={handleUnlock}
                  size="sm"
                  className="bg-aura hover:bg-aura/90 text-foreground shrink-0"
                >
                  Acceder
                </Button>
              </div>
              <AnimatePresence>
                {error && (
                  <motion.span
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-alert text-xs"
                  >
                    Clave incorrecta. Intente nuevamente.
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              key="unlocked"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col gap-5"
            >
              {modules.map((mod, mi) => (
                <motion.div
                  key={mod.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: mi * 0.08 }}
                  className="bg-secondary/30 border-border/30 flex flex-col gap-3 rounded-lg border p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-aura">{mod.icon}</span>
                      <span className="text-foreground text-sm font-medium">
                        {mod.title}
                      </span>
                    </div>
                    <button
                      onClick={() => toggleFieldVisibility(mod.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={
                        showPasswords[mod.id]
                          ? "Ocultar credenciales"
                          : "Mostrar credenciales"
                      }
                    >
                      {showPasswords[mod.id] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {mod.fields.map((field) => (
                      <div key={field.label} className="flex flex-col gap-1">
                        <Label className="text-muted-foreground text-[11px]">
                          {field.label}
                        </Label>
                        <Input
                          type={showPasswords[mod.id] ? "text" : "password"}
                          value={credentials[mod.id]?.[field.label] ?? ""}
                          onChange={(e) =>
                            updateCredential(mod.id, field.label, e.target.value)
                          }
                          placeholder={field.placeholder}
                          className="border-border/30 bg-background/50 text-foreground h-8 font-mono text-xs focus-visible:border-aura focus-visible:ring-aura/30"
                        />
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}

              <p className="text-muted-foreground border-border/30 border-t pt-3 text-center text-[10px] italic">
                Los nombres de las herramientas se mantienen cifrados por
                seguridad del ecosistema.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
