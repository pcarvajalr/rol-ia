export type UserRole = "owner" | "admin" | "analyst" | "viewer"

export interface User {
  id: string
  tenantId: string
  firebaseUid: string
  email: string
  role: UserRole
  permissions: Record<string, boolean>
}

export interface AuthContext {
  user: User
  tenantId: string
}
