import { NavLink, Outlet } from "react-router"
import { motion } from "framer-motion"
import { ArrowLeft, Users, Building2 } from "lucide-react"
import { RolLogo } from "@/components/rol-logo"

const navItems = [
  { to: "/admin/pending-users", label: "Solicitudes", icon: Users },
  { to: "/admin/tenants", label: "Empresas", icon: Building2 },
]

export function AdminLayout() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="bg-background text-foreground flex min-h-screen flex-col"
    >
      {/* Header */}
      <header className="border-border/40 sticky top-0 z-50 border-b bg-[#09090b]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <RolLogo
              size="sm"
              showTagline={false}
              showIcon={true}
              animate={false}
            />
            <div className="bg-border/40 hidden h-6 w-px sm:block" />
            <span className="text-muted-foreground hidden text-[11px] sm:block">
              Panel de Administracion
            </span>
          </div>
          <NavLink
            to="/dashboard"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver al Dashboard
          </NavLink>
        </div>
      </header>

      {/* Navigation tabs */}
      <div className="border-border/40 border-b bg-[#09090b]/50">
        <div className="mx-auto flex max-w-[1440px] items-center gap-1 px-6">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-aura text-aura"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`
              }
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-6 py-6">
        <Outlet />
      </main>
    </motion.div>
  )
}
