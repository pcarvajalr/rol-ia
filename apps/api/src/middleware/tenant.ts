import { createMiddleware } from "hono/factory"
import { prisma } from "../db/client"
import type { AuthUser } from "./auth"

export interface TenantUser {
  id: string
  tenantId: string
  firebaseUid: string
  email: string
  role: "owner" | "admin" | "analyst" | "viewer"
  permissions: Record<string, boolean>
}

export const tenantMiddleware = createMiddleware<{
  Variables: {
    authUser: AuthUser
    user: TenantUser
    tenantId: string
  }
}>(async (c, next) => {
  const authUser = c.get("authUser")

  const user = await prisma.user.findUnique({
    where: { firebaseUid: authUser.firebaseUid },
  })

  if (!user) {
    return c.json({ error: "Usuario no registrado" }, 403)
  }

  c.set("user", {
    id: user.id,
    tenantId: user.tenantId,
    firebaseUid: user.firebaseUid,
    email: user.email,
    role: user.role as TenantUser["role"],
    permissions: user.permissions as Record<string, boolean>,
  })
  c.set("tenantId", user.tenantId)

  await next()
})
