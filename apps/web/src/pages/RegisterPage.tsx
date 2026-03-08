import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Loader2,
  AlertCircle,
  Mail,
  Lock,
  Building2,
  Link2,
} from "lucide-react"
import { useNavigate } from "react-router"
import { Input } from "@/components/ui/input"
import { RolLogo } from "@/components/rol-logo"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useAuthStore } from "@/stores/auth-store"

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function RegisterPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [tenantName, setTenantName] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)
  const [slug, setSlug] = useState("")
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState("")
  const [shake, setShake] = useState(false)

  const navigate = useNavigate()
  const register = useAuthStore((s) => s.register)
  const autoSlug = useMemo(() => slugify(tenantName), [tenantName])
  const finalSlug = slugEdited ? slug : autoSlug

  const error = localError

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError("")

    if (password !== confirmPassword) {
      setLocalError("Las claves no coinciden.")
      setShake(true)
      setTimeout(() => setShake(false), 600)
      return
    }

    if (password.length < 6) {
      setLocalError("La clave debe tener al menos 6 caracteres.")
      setShake(true)
      setTimeout(() => setShake(false), 600)
      return
    }

    if (!finalSlug) {
      setLocalError("El slug de empresa es obligatorio.")
      setShake(true)
      setTimeout(() => setShake(false), 600)
      return
    }

    setLoading(true)
    try {
      await register(email, password, tenantName, finalSlug)
      // authStatus will change to pending_verification, App.tsx handles routing
    } catch {
      setShake(true)
      setTimeout(() => setShake(false), 600)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      {/* Background subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(168,85,247,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
          x: shake ? [0, -8, 8, -6, 6, -3, 3, 0] : 0,
        }}
        transition={{
          opacity: { duration: 0.6 },
          y: { duration: 0.6 },
          scale: { duration: 0.6 },
          x: { duration: 0.5 },
        }}
        className="border-border/50 bg-card relative w-full max-w-sm overflow-hidden rounded-2xl border shadow-2xl"
      >
        {/* Top accent line */}
        <div className="bg-aura h-1 w-full" />

        <div className="flex flex-col gap-6 p-8">
          {/* Logo and title */}
          <div className="flex flex-col items-center gap-4">
            <motion.div
              className="bg-aura/5 border-aura/10 flex items-center justify-center rounded-2xl border px-8 py-5"
              animate={{
                boxShadow: [
                  "0 0 0 0 rgba(168,85,247,0)",
                  "0 0 40px 8px rgba(168,85,247,0.12)",
                  "0 0 0 0 rgba(168,85,247,0)",
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <RolLogo size="lg" showTagline showIcon={true} animate={false} />
            </motion.div>
            <div className="flex flex-col items-center gap-1">
              <p className="text-foreground text-sm font-medium">
                Crear cuenta
              </p>
              <p className="text-muted-foreground text-xs">
                Registra tu empresa para comenzar
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="reg-email"
                className="text-muted-foreground text-xs font-medium uppercase tracking-wider"
              >
                Email
              </Label>
              <div className="relative">
                <Mail className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="correo@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="border-border/60 bg-secondary/50 focus:border-aura/50 focus:ring-aura/20 h-11 pl-10 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label
                htmlFor="reg-password"
                className="text-muted-foreground text-xs font-medium uppercase tracking-wider"
              >
                Clave
              </Label>
              <div className="relative">
                <Lock className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="reg-password"
                  type="password"
                  placeholder="Minimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="border-border/60 bg-secondary/50 focus:border-aura/50 focus:ring-aura/20 h-11 pl-10 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label
                htmlFor="reg-confirm"
                className="text-muted-foreground text-xs font-medium uppercase tracking-wider"
              >
                Confirmar clave
              </Label>
              <div className="relative">
                <Lock className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="reg-confirm"
                  type="password"
                  placeholder="Repita su clave"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="border-border/60 bg-secondary/50 focus:border-aura/50 focus:ring-aura/20 h-11 pl-10 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label
                htmlFor="reg-tenant"
                className="text-muted-foreground text-xs font-medium uppercase tracking-wider"
              >
                Nombre de empresa
              </Label>
              <div className="relative">
                <Building2 className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="reg-tenant"
                  type="text"
                  placeholder="Mi Empresa S.A."
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  required
                  className="border-border/60 bg-secondary/50 focus:border-aura/50 focus:ring-aura/20 h-11 pl-10 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label
                htmlFor="reg-slug"
                className="text-muted-foreground text-xs font-medium uppercase tracking-wider"
              >
                Slug
              </Label>
              <div className="relative">
                <Link2 className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="reg-slug"
                  type="text"
                  placeholder="mi-empresa"
                  value={finalSlug}
                  onChange={(e) => {
                    setSlug(e.target.value)
                    setSlugEdited(true)
                  }}
                  required
                  className="border-border/60 bg-secondary/50 focus:border-aura/50 focus:ring-aura/20 h-11 pl-10 text-sm"
                />
              </div>
              <p className="text-muted-foreground/60 text-[11px]">
                Identificador unico de tu empresa (auto-generado)
              </p>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-alert/10 border-alert/20 flex items-center gap-2 rounded-lg border px-3 py-2.5"
                >
                  <AlertCircle className="text-alert h-4 w-4 shrink-0" />
                  <span className="text-alert text-xs">{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              disabled={loading}
              className="bg-aura hover:bg-aura/90 text-foreground h-11 w-full text-sm font-medium disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                "Crear cuenta"
              )}
            </Button>
          </form>

          {/* Footer */}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="text-aura hover:text-aura/80 text-xs font-medium transition-colors"
            >
              Ya tengo cuenta
            </button>
            <p className="text-muted-foreground/50 text-center text-[11px]">
              Acceso restringido. Solo personal autorizado.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
