perfecto! segun el analisis y gaps, haremos implementaciones de algunos puntos en esta misma sesion, otros los documentaremos, y para otros, se ajustara puntualmente en el plan inicial sistema-leads.md. analiza cada punto y antes hacer cambios, dime como haras la ejecucion de cada punto segmentando por accion (implementar, ajustar/incorporar al plan, documentar).

1. estoy viendo en LeadTracking tiene lead_id para el externalId este campo nos serviria. ajusta plan sistema-leads.md con esta indicacion puntual.
flowStatus se debe implementar complementando la tabla leads_event_history. ajusta plan sistema-leads.md con esta indicacion puntual.
se deben crear los campos telefono, email, flowJobId. implementalo en esta sesion.

2. Ajusta el plan para implementar Cloud Tasks (GCP) de manera optima.

3. crear modulo de envio de email, en integration_platforms se debe crear una nueva plataforma Envio Emails con los campos necesarios para configurar smtp. implementa en esta sesion.
toma en cuenta la estructura que se debe implementar para los modulos del plan inicial. y ajusta el plan para tomar en cuenta el uso de este modulo.

4. registrar google_calendar como IntegrationPlatform con su campo calendar_url para que cada tenant configure su URL iCal. implementar en esta sesion y modificar el plan para que sea usado este IntegrationPlatform.

5. no implementar, modifica el plan para implementar el modulo del webhook de whatsapp con todo el feature. el archivo del plan es sistema-leads.md

6. ajusta el plan para implementar maquina de estados de manera optima.

7. agrega las validaciones al plan, tomando en cuenta que externalId es leads_tracking.lead_id. ajusta el plan inicial con este tema puntual.

8. ignorar.

9. ajustar el plan para dar respuesta rapida a clientify. 

10. implementar tiempo de respuesta bd y vista en pantalla de configuracion del tenant Seccion estrategia de Guardianes, con text helper indicando funcionalidad. implementa en esta sesion.

11. investiga sobre el payload de clientify para tener plan claro. y ajusta el plan para esta implementacion puntual.

12. ajusta el plant para que se valide el id de la empresa, y un nivel minimo de seguridad que soporte clientify como firma o token.

13. ignorar. documentar en CLAUDE.md para futura implementacion.

14. ajusta plan para implementar: 
- TTL máximo por flujo si después de 12h no se resolvió, marcar como timeout y cerrar
- Job de limpieza periódico para detectar leads en timer_active por más de 12 tiempo

15. ignorar. documentar en CLAUDE.md para futura implementacion.


SEGUNDOS AJUSTES

explica esta parte:
- **Selección automática**: via variable de entorno `TASK_SCHEDULER=cloudtasks|memory`.

con respecto a las 6 inconsistencias.
1. cual es la manera mas optima de mantener el id del lead para consumir facilmente el api en clientify al momento de hacer las consultas, toma en cuenta que se puden usar otros CRMs a futuro o plataformas que alimentan el sistema.

2. has el ajuste al plan para usar el phone_number_id como identificador del tenant.

3. ya lo ajuste, validalo.

4. Evento de Timeout usa tipo "Lead ingreso": explicame no entiendo.

5. ajusta plan para que las rutas se monten antes del middleware, esto garantiza el funcionamiento o pueden surgir fallas?

6. donde estas persistidos los estados ingreso, whatsapp_enviado, completado? entendiendo que es para control del sistema y para no generar confusion se debe llamar consulta_estado, ya que se puede hacer a los diferentes crms y plataformas fuentes del lead.