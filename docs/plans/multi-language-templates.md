# Multi-lenguaje para plantillas WhatsApp

## Contexto

Actualmente `sendTemplate` consulta la estructura del template en Meta y usa el idioma exacto que tiene registrado. Si el template solo existe en un idioma (ej: `es`), funciona. Pero cuando se agreguen traducciones o se expanda a otros países, se necesita un mecanismo para seleccionar el idioma correcto.

## Estrategia de templates en Meta

Crear cada template con el **mismo nombre** y múltiples traducciones:
- `rol_primer_contacto` → `es` (español genérico — idioma principal)
- `rol_primer_contacto` → `en` (inglés)
- `rol_primer_contacto` → `pt_BR` (portugués Brasil)

No crear templates con nombres distintos por idioma.

## Detección de idioma del lead

### Dependencia: `libphonenumber-js`

Usar la librería `libphonenumber-js` (port de Google libphonenumber) para parsear números telefónicos de forma confiable. No intentar extraer el indicativo manualmente — hay demasiados casos ambiguos.

```bash
pnpm --filter api add libphonenumber-js
```

### Parsing del número telefónico

```typescript
import { parsePhoneNumber } from "libphonenumber-js"

function detectLeadCountry(phone: string, defaultCountry: string): string | null {
  // 1. Intentar parsear con el número tal cual (asume que tiene indicativo)
  try {
    const parsed = parsePhoneNumber(phone)
    if (parsed?.isValid()) return parsed.country ?? null
  } catch {
    // No se pudo parsear, intentar con país por defecto
  }

  // 2. Si no tiene indicativo, usar país del tenant como contexto
  try {
    const parsed = parsePhoneNumber(phone, defaultCountry as any)
    if (parsed?.isValid()) return parsed.country ?? null
  } catch {
    // Número inválido
  }

  return null
}
```

### Mapeo país → idioma

```typescript
const COUNTRY_TO_LANG: Record<string, string> = {
  // Español
  CO: "es", MX: "es", AR: "es", CL: "es", PE: "es",
  VE: "es", EC: "es", BO: "es", PY: "es", UY: "es",
  CR: "es", PA: "es", SV: "es", GT: "es", HN: "es",
  NI: "es", DO: "es", CU: "es", ES: "es", PR: "es",

  // Inglés
  US: "en", CA: "en", GB: "en", AU: "en", IE: "en",
  NZ: "en", ZA: "en",

  // Portugués
  BR: "pt_BR", PT: "pt_BR",
}

function detectLanguage(phone: string, tenantDefaultCountry: string): string {
  const country = detectLeadCountry(phone, tenantDefaultCountry)
  if (!country) return "es" // fallback global
  return COUNTRY_TO_LANG[country] ?? "es"
}
```

### Casos y cómo se resuelven

| Número recibido | Formato | Resultado |
|---|---|---|
| `+573209127734` | Con indicativo | `parsePhoneNumber("+573209127734")` → CO → `es` |
| `573209127734` | Sin `+` pero con indicativo | `parsePhoneNumber("573209127734")` → CO → `es` |
| `3209127734` | Local sin indicativo | Primer intento falla → `parsePhoneNumber("3209127734", "CO")` → CO → `es` |
| `+5511999887766` | Brasil | → BR → `pt_BR` |
| `+12025551234` | USA | → US → `en` |
| `57°3209127734` | Con caracteres raros | libphonenumber limpia y parsea → CO → `es` |
| `abc123` | Basura | Ambos intentos fallan → `null` → fallback a `"es"` |

### Dato clave: `defaultCountry` del tenant

El segundo parámetro de `parsePhoneNumber` es el país por defecto para resolver números locales. Este valor debe venir de la configuración del tenant (su país de operación). Sin esto, los números sin indicativo no se pueden resolver.

## Cadena de resolución del template

```
detectLanguage(lead.telefono, tenant.defaultCountry)  → ej: "es"
  ↓
buscar template en idioma exacto "es"                  → ¿existe y APPROVED?
  ↓ no
buscar cualquier variante "es_*"                       → ¿existe? (es_CO, es_MX, etc.)
  ↓ no
usar defaultLanguage del tenant                        → ej: "en"
  ↓ no existe en ese idioma
usar primer idioma disponible del template
  ↓ no hay template con ese nombre
fallback a mensaje de texto (ya implementado)
```

### Implementación sugerida

```typescript
async function resolveTemplateLanguage(
  tenantId: string,
  templateName: string,
  preferredLang: string
): Promise<string | null> {
  const credentials = await validateCredentials(tenantId, "whatsapp", ["account_id", "access_token"])

  // Consultar TODAS las traducciones del template
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${credentials.account_id}/message_templates?name=${templateName}&fields=language,status`,
    { headers: { Authorization: `Bearer ${credentials.access_token}` } }
  )
  const data = await response.json()
  const templates = (data.data || []).filter((t: any) => t.status === "APPROVED")

  if (!templates.length) return null

  const languages = templates.map((t: any) => t.language)
  const baseLang = preferredLang.split("_")[0] // "es_CO" → "es"

  // 1. Idioma exacto
  if (languages.includes(preferredLang)) return preferredLang

  // 2. Idioma base (si preferredLang era una variante)
  if (languages.includes(baseLang)) return baseLang

  // 3. Cualquier variante del mismo idioma base
  const variant = languages.find((l: string) => l.startsWith(baseLang + "_"))
  if (variant) return variant

  // 4. Primer idioma disponible
  return languages[0]
}
```

## Cambios necesarios en la DB

Agregar campos al modelo `Tenant`:

```prisma
model Tenant {
  // ... campos existentes
  defaultCountry  String @default("CO") @map("default_country")   // ISO 3166-1 alpha-2
  defaultLanguage String @default("es") @map("default_language")   // Código de idioma para templates
}
```

```sql
ALTER TABLE tenants ADD COLUMN default_country VARCHAR(2) DEFAULT 'CO';
ALTER TABLE tenants ADD COLUMN default_language VARCHAR(10) DEFAULT 'es';
```

## Cambios en frontend

- Agregar selector de país e idioma por defecto en la configuración del tenant (no en la bóveda — no son credenciales)
- El país determina cómo se parsean números locales
- El idioma es el fallback cuando no se puede detectar por número

## Orden de implementación

1. `pnpm --filter api add libphonenumber-js`
2. Agregar campos `defaultCountry` y `defaultLanguage` al modelo Tenant (migration)
3. Implementar `detectLeadCountry` y `detectLanguage` en un nuevo módulo `utils/phone.ts`
4. Implementar `resolveTemplateLanguage` en `modules/whatsapp.ts`
5. Modificar `sendTemplate` para usar la cadena de resolución completa
6. Agregar selector de país/idioma en configuración del tenant (frontend)
7. Tests con números de distintos países y templates con/sin traducciones

## Notas

- `libphonenumber-js` tiene versiones `min`, `mobile`, `max`. Usar `libphonenumber-js` (default) que es la más ligera y suficiente para detectar país
- Considerar normalizar los números telefónicos al momento de ingreso (webhook) al formato E.164 (`+573209127734`) para evitar ambigüedades downstream
- En segunda fase: detectar idioma por respuesta del lead o campo del CRM
