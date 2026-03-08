import { createMiddleware } from "hono/factory"
import { prisma } from "../db/client"
import type { AuthUser } from "./auth"

export interface TenantUser {
  id: string
  tenantId: string | null
  firebaseUid: string
  email: string
  name: string | null
  role: "owner" | "admin" | "analyst" | "viewer" | "superadmin"
  approved: boolean
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

  if (!user.approved && user.role !== "superadmin") {
    return c.json({ error: "PENDING_APPROVAL" }, 403)
  }

  c.set("user", {
    id: user.id,
    tenantId: user.tenantId,
    firebaseUid: user.firebaseUid,
    email: user.email,
    name: user.name,
    role: user.role as TenantUser["role"],
    approved: user.approved,
    permissions: user.permissions as Record<string, boolean>,
  })
  c.set("tenantId", user.tenantId ?? "")

  await next()
})
