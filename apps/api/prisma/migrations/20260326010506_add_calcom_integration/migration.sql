-- AlterTable
ALTER TABLE "citas_agendadas" ADD COLUMN     "calcom_booking_uid" TEXT,
ADD COLUMN     "reminder_task_id" TEXT;

-- Nueva plataforma Cal.com
INSERT INTO integration_platforms (id, name, slug, icon, category, is_active, sort_order, created_at, updated_at)
VALUES (gen_random_uuid(), 'Cal.com', 'calcom', 'calendar', 'scheduling', true, 5, NOW(), NOW());

-- Campos de Cal.com
INSERT INTO integration_fields (id, platform_id, label, field_key, field_type, required, sort_order)
SELECT gen_random_uuid(), p.id, 'Booking URL', 'booking_url', 'text', true, 1
FROM integration_platforms p WHERE p.slug = 'calcom';

INSERT INTO integration_fields (id, platform_id, label, field_key, field_type, required, sort_order)
SELECT gen_random_uuid(), p.id, 'Webhook Secret', 'webhook_secret', 'secret', true, 2
FROM integration_platforms p WHERE p.slug = 'calcom';
