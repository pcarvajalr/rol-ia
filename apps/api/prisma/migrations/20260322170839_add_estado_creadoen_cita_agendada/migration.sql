-- AlterTable
ALTER TABLE "citas_agendadas" ADD COLUMN     "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'pendiente',
ALTER COLUMN "hora_agenda" DROP NOT NULL;
