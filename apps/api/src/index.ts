import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { webhookRouter } from "./routes/webhook"
import { internalRouter } from "./routes/internal"
import { authMiddleware } from "./middleware/auth"
import { authRoutes } from "./routes/auth"
import { adminRoutes } from "./routes/admin"
import { intelRoutes } from "./routes/intel"
import { vaultRoutes } from "./routes/vault"
import { settingsRoutes } from "./routes/settings"
import { tenantMiddleware, type TenantUser } from "./middleware/tenant"
import { superadminMiddleware } from "./middleware/superadmin"
import type { AuthUser } from "./middleware/auth"

const app = new Hono()

app.use("*", logger())

// Webhooks + internals — SIN CORS (llamados por servicios externos)
app.route("/webhook", webhookRouter)
app.route("/internal", internalRouter)

app.use("*", cors({
  origin: ["http://localhost:5173", "https://rolia-92d5d.web.app", "https://rolia-92d5d.firebaseapp.com"],
  credentials: true,
}))

// Public routes
app.get("/health", (c) => c.json({ status: "healthy", timestamp: new Date().toISOString() }))

// Protected routes (auth + tenant)
const api = new Hono<{
  Variables: {
    authUser: AuthUser
    user: TenantUser
    tenantId: string
  }
}>()
api.use("*", authMiddleware)
api.use("*", tenantMiddleware)

api.get("/me", (c) => {
  const user = c.get("user")
  return c.json({ user })
})

api.route("/intel", intelRoutes)
api.route("/vault", vaultRoutes)
api.route("/settings", settingsRoutes)

// Admin routes (auth + tenant + superadmin)
const adminApi = new Hono<{
  Variables: {
    authUser: AuthUser
    user: TenantUser
    tenantId: string
  }
}>()
adminApi.use("*", authMiddleware)
adminApi.use("*", tenantMiddleware)
adminApi.use("*", superadminMiddleware)
adminApi.route("/", adminRoutes)

// Auth routes (register uses own token verification, status/verify-email use authMiddleware)
app.route("/auth", authRoutes)

app.route("/admin", adminApi)
app.route("/api", api)

const port = Number(process.env.PORT) || 3001
console.log(`API running on http://localhost:${port}`)

serve({ fetch: app.fetch, port })

export default app
