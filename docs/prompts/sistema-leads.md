la app es un sistema de monitoreo y seguimiento, fallback de atencion por parte de los asesores, si los asesores no atienden el lead, se hace una gestion inicial         
  contactando automaticamente. para ello se necesita, manteniendo la estructura actual de tablas, 
# Implementar sistema de captura y gestión de leads vía webhook

## Contexto
Sistema multi-tenant existente de seguimiento, con módulo de configuración "bóveda de seguridad" para
credenciales de integraciones por tenant. Se requiere agregar un flujo de captura y seguimiento automático
de leads desde CRMs/redes sociales, iniciando con Clientify.

## Archivos clave
- Módulo de configuración / bóveda de seguridad (credenciales por tenant) existente.
- Modelos/migraciones de tablas actuales (leads, empresas/tenants, procesos), tenant_integrations guarda los datos de cada tenant encriptados, integration_fields guarda el identificador de cada campo de la integracion en field_key. con este identificador se encuentra el dato que se necesita en cada proceso. integration_platforms guarda las plataformas y se identifican con slug:
clientify, vapi, whatsapp. tabla leads_event_history registra seguimientos del lead.

## Tareas

- Crear Módulo de WhatsApp (Meta API), 
- Crear Módulo de VAPI si existe
- Crear Sistema de colas/timers (workers, jobs, queues). Cada tenant configura un tiempo de respuesta, validar si existe la funcionalidad para configurar ese tiempo. y para cada lead se activa un temporizador.

1. **Webhook principal orquestador**
   - Crear endpoint `POST /webhook/{plataforma}/{id_empresa}`
   - Validar plataforma soportada y tenant existente
   - Delegar al módulo correspondiente según `{plataforma}`, inicialmente sera solo clientify.

2. **Módulo Clientify**
   - Validar modelo existentes para leads de Clientify
   - Mapear y persistir el lead recibido asociado al tenant

3. **Flujo principal del lead** (MVP)
   - Persistir el lead con estado Nuevo, iniciar temporizador configurable por tenant (tiempo de respuesta), se registra en leads_event_history con el id evento de "Lead ingreso".
   - Al vencer el timer: consultar estado actualizado del lead vía API de Clientify y actualizarlo en bd (si el estado no existe en base de datos dejarlo "Nuevo").
   - Enviar mensaje WhatsApp (para mvp se hace automaticamente, para prod en el futuro se valida si aun no ha sido atendido por estado de lead en clientify, si sigue pendiente se envia el mensaje)
    con plantilla de 3 botones configurada en meta por cada tenant, y reinicia temporizador. actualizar estado del lead a "Contactado" y registrar en leads_event_history con tipo evento "Whatsapp".
    Botones de plantilla:
     - **"Llamar Ahora"** → ejecutar llamada inmediata vía VAPI, solo consume el servicio vapi ya tiene configurado el proceso, y termina flujo. estado del lead continua "Contactado" y en leads_event_history se registra evento de tipo "Llamada".
     - **"Agendar Cita"** → enviar por whatsapp enlace/invitación Google Calendar (cada tenan configura su url formato iCal en la plataforma identificada con google_calendar) y termina flujo. Estado del lead continua "Contactado" y se registra en leads_event_history evento de tipo "Cita"
     - **"No Contactar"** → terminar flujo + enviar correo al owner del tenant con la novedad. El estado continua en "Contactado"
   - Si no hay respuesta; al vencer el tiempo del temporizador → llamar via VAPI y termina el flujo. estado del lead continua "Contactado" y en leads_event_history se registra evento de tipo "Llamada".
   - Al terminar flujo se mata el temporizador de ese lead. no dejar procesos corriendo indefinidamente o huerfanos.
   - Todos los eventos se registran con actor_intervencion = "IA"

4. **Validación de credenciales antes de cada proceso**
   - Verificar existencia y funcionamiento de credenciales en bóveda:
     de cada integracion Clientify API, Meta (WhatsApp), VAPI, con sus respectivos identificadores de la plataforma y del campo.
   - Si alguna falla: enviar correo al owner del tenant con detalle del error y
     detener el flujo, matar procesos de temporizador del lead si lo hay.

5. **Configuración por tenant en bóveda de seguridad**
   Ya esta implementada.

6. **Timers/Jobs**
   - Implementar mecanismo de temporizador configurable por tenant
     (verificar si ya existe campo y vista para que el tenant pueda configurarlo (tiempo de respuesta))
   - Por cada lead es un timer independiente, evaluar implementacion optima. evitando procesos perdidos o ejecucion infinita.

## Restricciones
- Solo implementar integración/modulo con Clientify en esta fase.
- Respetar la estructura de tablas existente; analizar para uso optimo y si es necesario agregar migraciones sin romper las actuales
- Toda credencial debe gestionarse exclusivamente desde la bóveda de seguridad existente
- El webhook debe ser extensible para futuras plataformas sin refactorización mayor, crear nuevos modulos.
- No hardcodear tiempos ni credenciales
- Garantizar cierra de flujo y que no se realice mas de una vez por lead.