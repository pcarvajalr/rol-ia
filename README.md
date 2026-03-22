# Rol.IA — Inteligencia Comercial Autónoma

Plataforma de inteligencia comercial que monitorea leads en tiempo real, interviene automáticamente cuando un asesor humano no responde a tiempo, y proporciona análisis de rendimiento publicitario con proyecciones de ventas.

---

## Tabla de Contenidos

- [Acceso a la Plataforma](#acceso-a-la-plataforma)
- [Centro de Comando (Dashboard)](#centro-de-comando-dashboard)
- [Flujo Automatizado de Leads (G1)](#flujo-automatizado-de-leads-g1)
- [Semáforo de Abandono](#semáforo-de-abandono)
- [Sistema de Guardianes](#sistema-de-guardianes)
- [Reportes de Inteligencia](#reportes-de-inteligencia)
- [Bóveda de Seguridad](#bóveda-de-seguridad)
- [Configuración](#configuración)
- [Panel de Administración](#panel-de-administración)

---

## Acceso a la Plataforma

Cada usuario nuevo debe pasar por un proceso de registro con verificación en dos pasos antes de acceder.

```mermaid
flowchart TD
    A[Usuario ingresa a la plataforma] --> B{¿Tiene cuenta?}
    B -- No --> C[Registro]
    C --> C1[Ingresa email, contraseña y nombre de empresa]
    C1 --> C2[Se genera un identificador único para la empresa]
    C2 --> D[Verificación de correo electrónico]
    B -- Sí --> E[Inicio de sesión]
    E --> F{¿Correo verificado?}
    F -- No --> D
    D --> D1[Recibe correo de verificación]
    D1 --> D2[Confirma verificación en la plataforma]
    D2 --> G{¿Cuenta aprobada?}
    F -- Sí --> G
    G -- No --> H[Sala de espera]
    H --> H1[El sistema verifica automáticamente cada 10 segundos]
    H1 --> H2{¿Un administrador aprobó la cuenta?}
    H2 -- No --> H1
    H2 -- Sí --> I[Acceso al Centro de Comando]
    G -- Sí --> I

    style A fill:#1e293b,color:#fff
    style I fill:#166534,color:#fff
    style H fill:#92400e,color:#fff
```

**Roles disponibles:**
| Rol | Acceso |
|-----|--------|
| **Dueño** | Todo el panel de su empresa + bóveda de seguridad |
| **Admin** | Dashboard + configuración + bóveda |
| **Analista** | Dashboard + reportes (solo lectura) |
| **Viewer** | Dashboard (solo lectura) |
| **Superadmin** | Todo + panel de administración global |

---

## Centro de Comando (Dashboard)

La vista principal se organiza en tres secciones con indicadores clave siempre visibles en la parte superior.

```mermaid
flowchart LR
    subgraph KPIs["Indicadores Clave (siempre visibles)"]
        K1["⏱ Resp. Humana Promedio\n(tiempo que tarda un asesor)"]
        K2["⚡ Resp. Rol.IA Promedio\n(tiempo que tarda la IA)"]
        K3["💰 Capital en Riesgo\n(inversión en leads no atendidos)"]
    end

    subgraph Tabs["Pestañas del Dashboard"]
        T1["📊 Reportes\nAnálisis en vivo, diagnósticos\ny predicciones"]
        T2["🤖 Guardianes\nAutomatizaciones activas\ny su estado"]
        T3["⚙️ Configuración\nTimers, bóveda\ny mapeo CRM"]
    end

    KPIs --> Tabs
```

---

## Flujo Automatizado de Leads (G1)

El flujo principal de la plataforma. Cuando un lead nuevo ingresa desde el CRM, se inicia un proceso automatizado que busca rescatar al lead si ningún asesor humano lo atiende a tiempo.

### Flujo completo paso a paso

```mermaid
flowchart TD
    START([Lead ingresa desde el CRM]) --> CHECK_CRM{¿El estado del lead\nen el CRM ya indica\nque fue atendido?}

    CHECK_CRM -- Sí --> MAPPED[Se registra con el\nestado correspondiente]
    MAPPED --> SEMAPHORE_GREEN["🟢 Semáforo: Verde instantáneo"]
    SEMAPHORE_GREEN --> FIN_OK([Fin — Lead ya gestionado])

    CHECK_CRM -- No --> HAS_PHONE{¿Tiene\nteléfono?}
    HAS_PHONE -- No --> NOTIFY_OWNER[Se notifica al dueño\npor email]
    NOTIFY_OWNER --> FIN_NO_PHONE([Fin — Sin teléfono])

    HAS_PHONE -- Sí --> TIMER1["⏳ Timer 1: Ventana de acción humana\n(configurable, por defecto 15 seg)"]

    TIMER1 --> HUMAN_CHECK{¿Un asesor atendió\nel lead durante\nel timer?}

    HUMAN_CHECK -- Sí --> STOP_FLOW["Se detiene el flujo automático"]
    STOP_FLOW --> SEMAPHORE_CALC["Se calcula el semáforo\nsegún tiempo transcurrido"]
    SEMAPHORE_CALC --> FIN_HUMAN([Fin — Atendido por humano])

    HUMAN_CHECK -- No --> CRM_GATE{"🔍 Verificación CRM\n¿El estado del lead\ncambió en el CRM?"}

    CRM_GATE -- "Sí (asesor ya intervino)" --> STOP_FLOW

    CRM_GATE -- "No (sigue sin atender)" --> WHATSAPP["📱 Enviar mensaje WhatsApp\nautomático al lead"]

    WHATSAPP --> INVALID{¿Número\ninválido?}
    INVALID -- Sí --> NOTIFY_INVALID[Notifica al dueño\nnúmero inválido]
    NOTIFY_INVALID --> FIN_INVALID([Fin — Número inválido])

    INVALID -- No --> TIMER2["⏳ Timer 2: Espera respuesta del lead"]

    TIMER2 --> RESPONSE{¿El lead\nrespondió?}

    RESPONSE -- "Presionó: Llamar Ahora" --> VAPI_CALL["📞 Llamada de voz automática\n(asistente IA)"]
    VAPI_CALL --> FIN_CALL([Fin — Llamada realizada])

    RESPONSE -- "Presionó: Agendar Cita" --> CALENDAR["📅 Se envía enlace\nde calendario"]
    CALENDAR --> CITA["Se registra cita pendiente"]
    CITA --> FIN_CITA([Fin — Cita agendada])

    RESPONSE -- "Presionó: No Contactar" --> NO_CONTACT["Se notifica al dueño\ny se respeta la decisión"]
    NO_CONTACT --> FIN_NC([Fin — Lead descartado])

    RESPONSE -- "No respondió (timeout)" --> VAPI_AUTO["📞 Llamada de voz automática\n(último intento)"]
    VAPI_AUTO --> FIN_AUTO([Lead en seguimiento])

    style START fill:#1e293b,color:#fff
    style WHATSAPP fill:#25d366,color:#fff
    style VAPI_CALL fill:#6366f1,color:#fff
    style VAPI_AUTO fill:#6366f1,color:#fff
    style CALENDAR fill:#2563eb,color:#fff
    style FIN_OK fill:#166534,color:#fff
    style FIN_HUMAN fill:#166534,color:#fff
    style FIN_CITA fill:#166534,color:#fff
    style FIN_CALL fill:#166534,color:#fff
    style CRM_GATE fill:#d97706,color:#fff
```

### Detalle del mensaje WhatsApp

El lead recibe un mensaje de plantilla con tres botones de acción rápida:

```
┌─────────────────────────────────────────┐
│  Hola {nombre},                         │
│                                         │
│  Queremos ayudarte con tu consulta.     │
│  ¿Cómo prefieres que te contactemos?    │
│                                         │
│  ┌─────────────┐ ┌──────────────┐       │
│  │ Llamar Ahora│ │ Agendar Cita │       │
│  └─────────────┘ └──────────────┘       │
│  ┌───────────────┐                      │
│  │ No Contactar  │                      │
│  └───────────────┘                      │
└─────────────────────────────────────────┘
```

### Limpieza automática

Los leads que permanecen en flujo activo por más de **12 horas** sin resolución son cerrados automáticamente con un evento de timeout.

---

## Semáforo de Abandono

Sistema visual que monitorea en tiempo real cuánto tiempo llevan los leads sin ser atendidos. Funciona como un indicador de urgencia para el equipo comercial.

```mermaid
flowchart LR
    subgraph Configuración
        V["🟢 Verde\n(OK)\n1-30 min"]
        AM["🟡 Amarillo\n(En riesgo)\n1-30 min"]
        R["🔴 Rojo\n(Crítico)\nauto-calculado"]
    end

    subgraph Ejemplo["Ejemplo: Verde=5min, Amarillo=5min"]
        E1["0 a 5 min → 🟢"]
        E2["5 a 10 min → 🟡"]
        E3["+10 min → 🔴"]
    end

    V --> E1
    AM --> E2
    R --> E3
```

**Cómo se detiene el semáforo:**
- Cuando el CRM reporta un cambio de estado (un asesor atendió al lead)
- El tiempo transcurrido se registra y se asigna el color correspondiente
- Los leads ya atendidos aparecen en el historial con su color final

**Vista en el dashboard:**

```
┌──────────────────────────────────────────────────┐
│  Semáforo de Abandono              2🔴  3🟡      │
├──────────────────────────────────────────────────┤
│  Lead          Fuente      Estado      Tiempo    │
│  ─────────────────────────────────────────────── │
│  Juan Pérez    Meta Ads    🔴 Crítico  12:34     │
│  Ana López     Google      🟡 Riesgo    7:21     │
│  Carlos R.     Clientify   🟢 OK        2:15     │
│  María G.      Meta Ads    🟢 OK        0:45     │
└──────────────────────────────────────────────────┘
```

Los tiempos se actualizan en vivo cada segundo para los leads activos.

---

## Sistema de Guardianes

La plataforma cuenta con 7 guardianes autónomos, cada uno especializado en un aspecto del proceso comercial. Cada guardián puede estar en modo **Activo** (interviene automáticamente) u **Observador** (solo registra datos sin actuar).

```mermaid
flowchart TD
    subgraph Operativos["Guardianes Operativos (funcionando)"]
        G1["G1 — Guardián de Leads\nRescata leads no atendidos\nvía WhatsApp + llamada IA"]
        G2["G2 — Guardián de Pauta\nMonitorea ROAS y pausa\ncampañas ineficientes"]
    end

    subgraph Estratégicos["Guardianes Estratégicos (en desarrollo)"]
        G3["G3 — Copywriter Estratégico\nGenera variaciones de copy\npara anuncios"]
        G4["G4 — Analista Predictivo\nProyecta ventas y genera\nalertas tempranas"]
        G5["G5 — Auditor de Fugas\nClasifica razones de\npérdida de leads"]
        G6["G6 — Optimizador de Conversión\nRedistribuye presupuesto\nentre campañas"]
        G7["G7 — Agente de Agendamiento\nCierra citas y confirma\npor múltiples canales"]
    end

    G1 --> |"Rescata lead"| G7
    G2 --> |"Pausa campaña"| G3

    style G1 fill:#166534,color:#fff
    style G2 fill:#166534,color:#fff
    style G3 fill:#1e40af,color:#fff
    style G4 fill:#1e40af,color:#fff
    style G5 fill:#1e40af,color:#fff
    style G6 fill:#1e40af,color:#fff
    style G7 fill:#1e40af,color:#fff
```

### G1 — Guardián de Leads (Detalle)

El G1 muestra su progreso en un stepper visual de 5 pasos:

```
  ●──────────●──────────●──────────●──────────●
  CRM        Mensaje    Espera     Llamada    Cita
  Check      Enviado    N min      de Voz     Agendada
  ✅          ✅          ⏳
```

Incluye la **Bitácora Rol.IA**: un registro en tiempo real de cada acción tomada por el sistema (webhooks recibidos, mensajes enviados, llamadas realizadas, citas agendadas).

### G2 — Guardián de Pauta (Detalle)

Monitorea el ROAS (retorno sobre inversión publicitaria) en tiempo real:

```mermaid
flowchart LR
    A["ROAS actual\nde la campaña"] --> B{¿Está por encima\ndel umbral?}
    B -- Sí --> C["🟢 ROAS Estable\nCampaña activa"]
    B -- No --> D{¿Modo activo?}
    D -- Sí --> E["🔴 Campaña Pausada\nSugiriendo nuevo copy"]
    D -- No --> F["🟡 ROAS Bajo\nSolo observando"]
```

### Historial de Rescates

Comparación forense entre la acción (o inacción) del equipo humano vs la intervención automática de Rol.IA:

```
┌─────────────────────────────────────────────────┐
│  Bitácora Forense                               │
├─────────┬───────────────────┬───────────────────┤
│  Hora   │  Humano           │  Rol.IA           │
├─────────┼───────────────────┼───────────────────┤
│  10:32  │  ✗ Sin respuesta  │  ✓ WhatsApp auto  │
│  10:47  │  ✗ Sin respuesta  │  ✓ Llamada VAPI   │
│  11:15  │  ✗ Sin respuesta  │  ✓ Cita agendada  │
└─────────┴───────────────────┴───────────────────┘
```

---

## Reportes de Inteligencia

Organizados en tres categorías según su naturaleza temporal.

### Reportes en Vivo (tiempo real)

```mermaid
flowchart TD
    subgraph EnVivo["En Vivo — Datos actualizándose"]
        CPA["CPA Real-Time\nCosto por adquisición por\nplataforma (Meta/Google)\nactualizado cada 4 seg"]
        SEM["Semáforo de Abandono\nLeads activos con timer\nen vivo cada segundo"]
        OPT["Optimizador de Conversión\nCPL por campaña con\nsugerencias de presupuesto"]
        AGE["Agenda en Vivo\nCitas del día con\nestado de confirmación"]
    end
```

| Reporte | Qué muestra | Actualización |
|---------|-------------|---------------|
| **CPA Real-Time** | Gasto e inversión por plataforma publicitaria en intervalos de 10 minutos | Cada 4 segundos |
| **Semáforo de Abandono** | Leads activos ordenados por tiempo de espera con colores de urgencia | Cada 15 segundos + timer local |
| **Optimizador de Conversión** | Costo por lead de cada campaña, tendencia y presupuesto sugerido | Bajo demanda |
| **Agenda en Vivo** | Citas agendadas hoy con canal, estado y agente asignado | Bajo demanda |

### Reportes de Diagnóstico (análisis)

| Reporte | Qué muestra |
|---------|-------------|
| **Diagnóstico de Fuga** | Mapa de burbujas con las razones por las que se pierden leads (frecuencia vs impacto) |
| **Copywriter IA** | Variaciones de copy generadas por IA con puntaje de engagement y brief visual para el diseñador |
| **Tendencia ROAS Semanal** | Comparativa de retorno publicitario Meta vs Google en los últimos 7 días con línea de corte |

### Reporte Predictivo (forecasting)

| Reporte | Qué muestra |
|---------|-------------|
| **Predictor de Metas** | Ventas reales vs proyección IA vs meta mensual. Indica si se alcanzará el objetivo |

```mermaid
flowchart LR
    subgraph Predictor["Predictor de Metas"]
        direction TB
        REAL["── Ventas reales (línea sólida)"]
        PROJ["--- Proyección IA (línea punteada)"]
        META["─── Meta mensual (línea de referencia)"]

        RESULT{¿La proyección\nalcanza la meta?}
        RESULT -- Sí --> OK["🟢 En camino\nSe proyecta alcanzar la meta"]
        RESULT -- No --> RISK["🔴 En riesgo\nX ventas por debajo,\nse recomienda ajustar"]
    end
```

---

## Bóveda de Seguridad

Sistema protegido por PIN donde cada empresa almacena las credenciales de sus integraciones externas.

```mermaid
flowchart TD
    START([Acceder a Bóveda]) --> HAS_PIN{¿Tiene PIN\nconfigurado?}

    HAS_PIN -- No --> SETUP["Configurar PIN\n(4-8 caracteres)"]
    SETUP --> CONFIRM[Confirmar PIN]
    CONFIRM --> UNLOCKED

    HAS_PIN -- Sí --> LOCKED["🔒 Bóveda Bloqueada\nIngresar PIN"]
    LOCKED --> VERIFY{¿PIN correcto?}
    VERIFY -- No --> ERROR[Error — Reintentar]
    ERROR --> LOCKED
    VERIFY -- Sí --> UNLOCKED

    UNLOCKED["🔓 Bóveda Desbloqueada"] --> PLATFORMS

    subgraph PLATFORMS["Plataformas Disponibles"]
        WA["WhatsApp / Meta\nphone_number_id, access_token,\naccount_id, app_secret"]
        CL["Clientify (CRM)\napi_token"]
        VA["VAPI (Llamadas IA)\nassistant_id, auth_token"]
        GC["Google Calendar\ncalendar_url"]
        EM["Email (SMTP)\nhost, puerto, usuario, contraseña"]
    end

    PLATFORMS --> SAVE["Guardar credenciales\n(encriptadas AES-256)"]

    style LOCKED fill:#dc2626,color:#fff
    style UNLOCKED fill:#166534,color:#fff
    style SAVE fill:#1e40af,color:#fff
```

**Características:**
- Las credenciales se muestran enmascaradas (solo últimos 4 caracteres visibles)
- Botón para revelar/ocultar cada campo
- Solo usuarios con rol Dueño, Admin o Superadmin pueden modificar credenciales
- El Superadmin puede resetear el PIN de cualquier empresa

---

## Configuración

### Estrategia de Guardianes

Parámetros que controlan el comportamiento del flujo automatizado:

```mermaid
flowchart TD
    subgraph Config["Parámetros Configurables"]
        T1["⏱ Tiempo de respuesta del lead\n(15 a 300 segundos)\nTiempo de espera antes de que\nla IA intervenga"]

        T2["🏷 Estado CRM 'No Atendido'\nEl estado del CRM que indica\nque nadie ha contactado al lead"]

        subgraph Semaforo["Semáforo"]
            SV["🟢 Verde: 1-30 min"]
            SA["🟡 Amarillo: 1-30 min"]
            SR["🔴 Rojo: automático\n(todo lo que exceda\nverde + amarillo)"]
        end
    end
```

### Mapeo de Estados CRM

Permite traducir los estados del CRM externo a los estados internos de la plataforma:

```mermaid
flowchart LR
    subgraph CRM["CRM Externo (ej: Clientify)"]
        C1["cold-lead"]
        C2["contacted"]
        C3["opportunity"]
        C4["customer"]
    end

    subgraph ROLIA["Estados Rol.IA"]
        R1["Nuevo"]
        R2["Contactado"]
        R3["En proceso"]
        R4["Cerrado"]
    end

    C1 --> R1
    C2 --> R2
    C3 --> R3
    C4 --> R4
```

Cada empresa configura su propio mapeo según los estados que use su CRM.

### Historial de Webhooks

Registro auditable de todos los webhooks recibidos con filtros por fuente (Clientify, Meta) y paginación. Muestra fecha, fuente, estado CRM recibido y acción tomada (creado, actualizado, ignorado, error).

---

## Panel de Administración

Accesible solo para el Superadmin. Gestiona usuarios, empresas y plataformas de integración.

```mermaid
flowchart TD
    ADMIN([Panel de Administración]) --> TAB1 & TAB2 & TAB3

    subgraph TAB1["Usuarios Pendientes"]
        UP1["Lista de usuarios que completaron\nregistro y verificación de email"]
        UP2["Acciones: Aprobar ✅ o Rechazar ❌"]
        UP3["Al aprobar: el usuario accede\ninmediatamente al dashboard"]
        UP4["Al rechazar: se elimina el usuario\ny se desactiva su empresa"]
    end

    subgraph TAB2["Empresas"]
        TE1["Lista de todas las empresas registradas"]
        TE2["Muestra: nombre, plan, # usuarios,\nestado activo/inactivo"]
        TE3["Resetear PIN de bóveda"]
    end

    subgraph TAB3["Plataformas"]
        PL1["Define qué integraciones están\ndisponibles para todas las empresas"]
        PL2["Crear/editar/eliminar plataformas"]
        PL3["Definir campos requeridos\npor plataforma"]
        PL4["Activar/desactivar plataformas\nglobalmente"]
    end

    style ADMIN fill:#7c3aed,color:#fff
```

### Flujo de gestión de plataformas

```mermaid
flowchart LR
    A["Superadmin crea\nplataforma\n(ej: WhatsApp)"] --> B["Define campos\n(access_token,\nphone_number_id...)"]
    B --> C["Activa la\nplataforma"]
    C --> D["Aparece en la\nbóveda de todas\nlas empresas"]
    D --> E["Cada empresa\ningresa sus propias\ncredenciales"]
```

---

## Flujo General de la Plataforma

Vista consolidada de cómo interactúan todos los componentes:

```mermaid
flowchart TD
    subgraph Entrada["Entrada de Leads"]
        WH_CL["Webhook\nClientify"]
        WH_META["Webhook\nMeta/WhatsApp"]
    end

    subgraph Procesamiento["Procesamiento Automático"]
        LEAD["Lead registrado\nen el sistema"]
        SEM["Semáforo activado\n(contando tiempo)"]
        FLOW["Flujo G1 iniciado"]
    end

    subgraph Acciones["Acciones Automáticas"]
        CRM_CHECK["Verificación\nen CRM"]
        WA_MSG["Mensaje\nWhatsApp"]
        VAPI["Llamada\nde voz IA"]
        CITA["Agendamiento\nde cita"]
    end

    subgraph Monitoreo["Dashboard en Tiempo Real"]
        KPI["KPIs"]
        REPORTS["Reportes"]
        GUARDS["Guardianes"]
        BITACORA["Bitácora"]
    end

    WH_CL --> LEAD
    WH_META --> LEAD
    LEAD --> SEM
    LEAD --> FLOW
    FLOW --> CRM_CHECK
    CRM_CHECK --> WA_MSG
    WA_MSG --> VAPI
    WA_MSG --> CITA

    SEM --> KPI
    FLOW --> BITACORA
    LEAD --> REPORTS
    FLOW --> GUARDS

    style WH_CL fill:#1e293b,color:#fff
    style WH_META fill:#25d366,color:#fff
    style WA_MSG fill:#25d366,color:#fff
    style VAPI fill:#6366f1,color:#fff
    style CITA fill:#2563eb,color:#fff
```
