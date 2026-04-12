-- Agregar campo guardian a leads_event_history
ALTER TABLE "leads_event_history" ADD COLUMN "guardian" TEXT;

-- Agregar tipos de evento granulares para reportes forenses
INSERT INTO cat_tipos_evento (nombre) VALUES ('Semáforo verde');
INSERT INTO cat_tipos_evento (nombre) VALUES ('Semáforo amarillo');
INSERT INTO cat_tipos_evento (nombre) VALUES ('Semáforo rojo');
INSERT INTO cat_tipos_evento (nombre) VALUES ('Rescate WhatsApp');
INSERT INTO cat_tipos_evento (nombre) VALUES ('Preferencia llamada');
INSERT INTO cat_tipos_evento (nombre) VALUES ('Preferencia agendamiento');
INSERT INTO cat_tipos_evento (nombre) VALUES ('Preferencia chat');
INSERT INTO cat_tipos_evento (nombre) VALUES ('Opt-out');
INSERT INTO cat_tipos_evento (nombre) VALUES ('Llamada rescate');
