import { createMiddleware } from "hono/factory"
import admin from "firebase-admin"

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
  })
}

export interface AuthUser {
  firebaseUid: string
  email: string
}

export const authMiddleware = createMiddleware<{
  Variables: { authUser: AuthUser }
}>(async (c, next) => {
  const header = c.req.header("Authorization")
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Token requerido" }, 401)
  }

  const token = header.slice(7)

  try {
    const decoded = await admin.auth().verifyIdToken(token)
    c.set("authUser", {
      firebaseUid: decoded.uid,
      email: decoded.email ?? "",
    })
    await next()
  } catch {
    return c.json({ error: "Token invalido" }, 401)
  }
})
