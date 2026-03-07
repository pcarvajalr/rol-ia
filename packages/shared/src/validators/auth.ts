import { z } from "zod"

export const loginSchema = z.object({
  email: z.string().email("Email invalido"),
  password: z.string().min(6, "Minimo 6 caracteres"),
})

export const inviteUserSchema = z.object({
  email: z.string().email("Email invalido"),
  role: z.enum(["admin", "analyst", "viewer"]),
})

export type LoginInput = z.infer<typeof loginSchema>
export type InviteUserInput = z.infer<typeof inviteUserSchema>
