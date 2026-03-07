import { PrismaClient } from "@prisma/client"

const globalPrisma = new PrismaClient()

export function createTenantClient(tenantId: string) {
  return globalPrisma.$extends({
    query: {
      $allOperations({ args, query, model }: { args: any; query: (args: any) => any; model?: string }) {
        // Global tables without tenant_id
        const globalTables = ["CatTipoEvento", "CatEstadoGestion", "Tenant"]
        if (model && globalTables.includes(model)) {
          return query(args)
        }

        // Inject tenant_id in WHERE for reads
        if ("where" in args) {
          args.where = { ...args.where, tenantId }
        }

        // Inject tenant_id in CREATE
        if ("data" in args) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d: Record<string, unknown>) => ({ ...d, tenantId }))
          } else {
            args.data = { ...args.data, tenantId }
          }
        }

        return query(args)
      },
    },
  })
}

export { globalPrisma as prisma }
