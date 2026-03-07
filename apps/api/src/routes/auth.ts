import { Hono } from "hono"
import { prisma } from "../db/client"
import admin from "firebase-admin"

const auth = new Hono()

// POST /auth/register - Create tenant + owner user
// Called after user is already created in Firebase Auth
auth.post("/register", async (c) => {
  const header = c.req.header("Authorization")
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Token requerido" }, 401)
  }

  const token = header.slice(7)

  let decoded
  try {
    decoded = await admin.auth().verifyIdToken(token)
  } catch {
    return c.json({ error: "Token invalido" }, 401)
  }

  // Check if user already exists
  const existing = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
  })
  if (existing) {
    return c.json({ error: "Usuario ya registrado" }, 409)
  }

  const body = await c.req.json<{ tenantName: string; tenantSlug: string }>()

  if (!body.tenantName || !body.tenantSlug) {
    return c.json({ error: "tenantName y tenantSlug son requeridos" }, 400)
  }

  // Check slug is unique
  const existingTenant = await prisma.tenant.findUnique({
    where: { slug: body.tenantSlug.toLowerCase().replace(/[^a-z0-9-]/g, "") },
  })
  if (existingTenant) {
    return c.json({ error: "El slug ya esta en uso" }, 409)
  }

  // Create tenant + owner in a transaction
  const result = await prisma.$transaction(async (tx: any) => {
    const tenant = await tx.tenant.create({
      data: {
        name: body.tenantName,
        slug: body.tenantSlug.toLowerCase().replace(/[^a-z0-9-]/g, ""),
        plan: "free",
      },
    })

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        firebaseUid: decoded.uid,
        email: decoded.email ?? "",
        role: "owner",
      },
    })

    return { tenant, user }
  })

  return c.json({
    tenant: { id: result.tenant.id, name: result.tenant.name, slug: result.tenant.slug },
    user: { id: result.user.id, email: result.user.email, role: result.user.role },
  }, 201)
})

export { auth as authRoutes }
