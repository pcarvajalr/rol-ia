-- AlterTable
ALTER TABLE "leads_tracking" ADD COLUMN     "call_retries_remaining" INTEGER;

-- New event types for Vapi call results and retry tracking
INSERT INTO cat_tipos_evento (nombre) VALUES ('Llamada contestada');
INSERT INTO cat_tipos_evento (nombre) VALUES ('Llamada no contestada');
INSERT INTO cat_tipos_evento (nombre) VALUES ('Reintento programado');
INSERT INTO cat_tipos_evento (nombre) VALUES ('Reintentos agotados');
