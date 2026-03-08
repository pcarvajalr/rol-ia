import { createMiddleware } from "hono/factory"
import type { AuthUser } from "./auth"
import type { TenantUser } from "./tenant"

export const superadminMiddleware = createMiddleware<{
  Variables: {
    authUser: AuthUser
    user: TenantUser
    tenantId: string
  }
}>(async (c, next) => {
  const user = c.get("user")

  if (user.role !== "superadmin") {
    return c.json({ error: "Acceso restringido a superadmin" }, 403)
  }

  await next()
})
