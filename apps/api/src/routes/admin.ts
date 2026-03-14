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

// =============================================
// Integration Platforms CRUD (superadmin only)
// =============================================

// GET /admin/platforms - List all platforms with fields
adminRouter.get("/platforms", async (c) => {
  const platforms = await prisma.integrationPlatform.findMany({
    include: { fields: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  })
  return c.json({ platforms })
})

// POST /admin/platforms - Create a platform with fields
adminRouter.post("/platforms", async (c) => {
  const body = await c.req.json()
  const { name, slug, icon, category, fields } = body

  if (!name || !slug || !category) {
    return c.json({ error: "name, slug y category son requeridos" }, 400)
  }

  const existing = await prisma.integrationPlatform.findUnique({ where: { slug } })
  if (existing) {
    return c.json({ error: "Ya existe una plataforma con ese slug" }, 409)
  }

  const maxSort = await prisma.integrationPlatform.aggregate({ _max: { sortOrder: true } })
  const nextSort = (maxSort._max.sortOrder ?? 0) + 1

  const platform = await prisma.integrationPlatform.create({
    data: {
      name,
      slug,
      icon: icon || null,
      category,
      sortOrder: nextSort,
      fields: {
        create: (fields || []).map((f: any, i: number) => ({
          label: f.label,
          fieldKey: f.fieldKey,
          fieldType: f.fieldType || "secret",
          required: f.required !== false,
          sortOrder: i + 1,
        })),
      },
    },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  })

  return c.json({ platform }, 201)
})

// PUT /admin/platforms/:id - Update platform metadata
adminRouter.put("/platforms/:id", async (c) => {
  const id = c.req.param("id")
  const body = await c.req.json()
  const { name, icon, category, isActive } = body

  const platform = await prisma.integrationPlatform.findUnique({ where: { id } })
  if (!platform) {
    return c.json({ error: "Plataforma no encontrada" }, 404)
  }

  const updated = await prisma.integrationPlatform.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(icon !== undefined && { icon }),
      ...(category !== undefined && { category }),
      ...(isActive !== undefined && { isActive }),
    },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  })

  return c.json({ platform: updated })
})

// DELETE /admin/platforms/:id - Delete platform (cascade fields + clean tenant integrations)
adminRouter.delete("/platforms/:id", async (c) => {
  const id = c.req.param("id")

  const platform = await prisma.integrationPlatform.findUnique({ where: { id } })
  if (!platform) {
    return c.json({ error: "Plataforma no encontrada" }, 404)
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.tenantIntegration.deleteMany({ where: { platformId: id } })
    await tx.integrationPlatform.delete({ where: { id } })
  })

  return c.json({ success: true })
})

// POST /admin/platforms/:id/fields - Add field to platform
adminRouter.post("/platforms/:id/fields", async (c) => {
  const platformId = c.req.param("id")
  const body = await c.req.json()
  const { label, fieldKey, fieldType, required } = body

  if (!label || !fieldKey) {
    return c.json({ error: "label y fieldKey son requeridos" }, 400)
  }

  const platform = await prisma.integrationPlatform.findUnique({ where: { id: platformId } })
  if (!platform) {
    return c.json({ error: "Plataforma no encontrada" }, 404)
  }

  const maxSort = await prisma.integrationField.aggregate({
    where: { platformId },
    _max: { sortOrder: true },
  })

  const field = await prisma.integrationField.create({
    data: {
      platformId,
      label,
      fieldKey,
      fieldType: fieldType || "secret",
      required: required !== false,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
  })

  return c.json({ field }, 201)
})

// PUT /admin/fields/:id - Update field metadata
adminRouter.put("/fields/:id", async (c) => {
  const id = c.req.param("id")
  const body = await c.req.json()
  const { label, fieldType, required, sortOrder } = body

  const field = await prisma.integrationField.findUnique({ where: { id } })
  if (!field) {
    return c.json({ error: "Campo no encontrado" }, 404)
  }

  const updated = await prisma.integrationField.update({
    where: { id },
    data: {
      ...(label !== undefined && { label }),
      ...(fieldType !== undefined && { fieldType }),
      ...(required !== undefined && { required }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  })

  return c.json({ field: updated })
})

// DELETE /admin/fields/:id - Delete field
adminRouter.delete("/fields/:id", async (c) => {
  const id = c.req.param("id")

  const field = await prisma.integrationField.findUnique({ where: { id } })
  if (!field) {
    return c.json({ error: "Campo no encontrado" }, 404)
  }

  await prisma.integrationField.delete({ where: { id } })

  return c.json({ success: true })
})

// =============================================
// Vault PIN (per-tenant, managed via /api routes)
// =============================================

// POST /admin/tenants/:id/reset-vault-pin - Superadmin can reset a tenant's vault PIN
adminRouter.post("/tenants/:id/reset-vault-pin", async (c) => {
  const tenantId = c.req.param("id")

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) {
    return c.json({ error: "Tenant no encontrado" }, 404)
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { vaultPinHash: null },
  })

  return c.json({ success: true })
})

export { adminRouter as adminRoutes }
