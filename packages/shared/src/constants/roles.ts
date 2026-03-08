import type { UserRole } from "../types/user"

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  superadmin: 5,
  owner: 4,
  admin: 3,
  analyst: 2,
  viewer: 1,
}

export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}
