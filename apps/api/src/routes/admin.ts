import { Hono } from "hono"
import { prisma } from "../db/client"
import admin from "firebase-admin"
import type { AuthUser } from "../middleware/auth"
import type { TenantUser } from "../middleware/tenant"

const adminRouter = new Hono<{
  Variables: {
    authUser: AuthUser
    user: TenantUser
    tenantId: string
  }
}>()

// GET /admin/pending-users - Users with approved: false that have verified emails
adminRouter.get("/pending-users", async (c) => {
  const pendingUsers = await prisma.user.findMany({
    where: { approved: false, role: { not: "superadmin" } },
    include: { tenant: true },
  })

  // Filter to only those with verified emails in Firebase
  const usersWithVerification = await Promise.all(
    pendingUsers.map(async (user) => {
      try {
        const firebaseUser = await admin.auth().getUser(user.firebaseUid)
        return { user, emailVerified: firebaseUser.emailVerified }
      } catch {
        return { user, emailVerified: false }
      }
    })
  )

  const verifiedPending = usersWithVerification
    .filter((u) => u.emailVerified)
    .map((u) => ({
      id: u.user.id,
      email: u.user.email,
      name: u.user.name,
      role: u.user.role,
      createdAt: u.user.createdAt,
      tenant: u.user.tenant
        ? { id: u.user.tenant.id, name: u.user.tenant.name, slug: u.user.tenant.slug }
        : null,
    }))

  return c.json({ users: verifiedPending })
})

// POST /admin/users/:id/approve - Approve a user
adminRouter.post("/users/:id/approve", async (c) => {
  const userId = c.req.param("id")
  const superadmin = c.get("user")

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    return c.json({ error: "Usuario no encontrado" }, 404)
  }

  if (user.approved) {
    return c.json({ error: "Usuario ya aprobado" }, 409)
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      approved: true,
      approvedAt: new Date(),
      approvedBy: superadmin.id,
    },
  })

  return c.json({
    user: { id: updated.id, email: updated.email, approved: updated.approved },
  })
})

// POST /admin/users/:id/reject - Reject a user (deactivate tenant + delete user)
adminRouter.post("/users/:id/reject", async (c) => {
  const userId = c.req.param("id")

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    return c.json({ error: "Usuario no encontrado" }, 404)
  }

  await prisma.$transaction(async (tx: any) => {
    if (user.tenantId) {
      await tx.tenant.update({
        where: { id: user.tenantId },
        data: { active: false },
      })
    }

    await tx.user.delete({ where: { id: userId } })
  })

  return c.json({ success: true })
})

// GET /admin/tenants - List all tenants with user count
adminRouter.get("/tenants", async (c) => {
  const tenants = await prisma.tenant.findMany({
    include: {
      _count: { select: { users: true } },
    },
  })

  return c.json({ tenants })
})

export { adminRouter as adminRoutes }
