import { z } from "zod"

export const loginSchema = z.object({
  email: z.string().email("Email invalido"),
  password: z.string().min(6, "Minimo 6 caracteres"),
})

export const inviteUserSchema = z.object({
  email: z.string().email("Email invalido"),
  role: z.enum(["admin", "analyst", "viewer"]),
})

export const registerSchema = z.object({
  email: z.string().email("Email invalido"),
  password: z.string().min(6, "Minimo 6 caracteres"),
  tenantName: z.string().min(2, "Minimo 2 caracteres"),
  tenantSlug: z.string().min(2, "Minimo 2 caracteres").regex(/^[a-z0-9-]+$/, "Solo letras minusculas, numeros y guiones"),
})

export type LoginInput = z.infer<typeof loginSchema>
export type InviteUserInput = z.infer<typeof inviteUserSchema>
export type RegisterInput = z.infer<typeof registerSchema>
