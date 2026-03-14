import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  MessageSquare,
  Mic,
  Phone,
  Database,
  ChevronDown,
  ChevronRight,
  Plug,
  AlertTriangle,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuthStore } from "@/stores/auth-store"

const API_URL = import.meta.env.VITE_API_URL || ""

const ICON_MAP: Record<string, React.ReactNode> = {
  MessageSquare: <MessageSquare className="h-4 w-4" />,
  Mic: <Mic className="h-4 w-4" />,
  Phone: <Phone className="h-4 w-4" />,
  Database: <Database className="h-4 w-4" />,
  Plug: <Plug className="h-4 w-4" />,
}

const ICON_OPTIONS = ["MessageSquare", "Mic", "Phone", "Database", "Plug"]

const CATEGORY_LABELS: Record<string, string> = {
  messaging: "Mensajeria",
  voice: "Voz",
  telephony: "Telefonia",
  crm: "CRM",
}

const CATEGORY_OPTIONS = ["messaging", "voice", "telephony", "crm"]

const FIELD_TYPE_LABELS: Record<string, string> = {
  secret: "Secreto",
  text: "Texto",
  url: "URL",
}

interface Field {
  id: string
  label: string
  fieldKey: string
  fieldType: string
  required: boolean
  sortOrder: number
}

interface Platform {
  id: string
  name: string
  slug: string
  icon: string | null
  category: string
  isActive: boolean
  sortOrder: number
  fields: Field[]
}

// ---- New/Edit Field inline form ----
interface FieldFormData {
  label: string
  fieldKey: string
  fieldType: string
  required: boolean
}

function emptyField(): FieldFormData {
  return { label: "", fieldKey: "", fieldType: "secret", required: true }
}

export function PlatformsPage() {
  const token = useAuthStore((s) => s.token)
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Platform dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPlatform, setEditingPlatform] = useState<Platform | null>(null)
  const [formName, setFormName] = useState("")
  const [formSlug, setFormSlug] = useState("")
  const [formIcon, setFormIcon] = useState("Plug")
  const [formCategory, setFormCategory] = useState("crm")
  const [formFields, setFormFields] = useState<FieldFormData[]>([emptyField()])
  const [saving, setSaving] = useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Platform | null>(null)

  // Add field dialog
  const [addFieldPlatformId, setAddFieldPlatformId] = useState<string | null>(null)
  const [newFieldData, setNewFieldData] = useState<FieldFormData>(emptyField())
  const [savingField, setSavingField] = useState(false)

  // Edit field
  const [editingField, setEditingField] = useState<{ platformId: string; field: Field } | null>(null)
  const [editFieldLabel, setEditFieldLabel] = useState("")
  const [editFieldType, setEditFieldType] = useState("secret")
  const [editFieldRequired, setEditFieldRequired] = useState(true)

  // Delete field
  const [deleteFieldTarget, setDeleteFieldTarget] = useState<{ platformId: string; field: Field } | null>(null)

  const fetchPlatforms = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/admin/platforms`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setPlatforms(data.platforms ?? [])
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchPlatforms()
  }, [fetchPlatforms])

  // ---- Platform CRUD ----

  const openCreateDialog = () => {
    setEditingPlatform(null)
    setFormName("")
    setFormSlug("")
    setFormIcon("Plug")
    setFormCategory("crm")
    setFormFields([emptyField()])
    setDialogOpen(true)
  }

  const openEditDialog = (p: Platform) => {
    setEditingPlatform(p)
    setFormName(p.name)
    setFormSlug(p.slug)
    setFormIcon(p.icon || "Plug")
    setFormCategory(p.category)
    setFormFields([]) // not used for edit
    setDialogOpen(true)
  }

  const handleSavePlatform = async () => {
    if (!token || !formName.trim()) return
    setSaving(true)

    try {
      if (editingPlatform) {
        // Update
        await fetch(`${API_URL}/admin/platforms/${editingPlatform.id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName, icon: formIcon, category: formCategory }),
        })
      } else {
        // Create
        const slug = formSlug.trim() || formName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
        await fetch(`${API_URL}/admin/platforms`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName,
            slug,
            icon: formIcon,
            category: formCategory,
            fields: formFields.filter((f) => f.label && f.fieldKey),
          }),
        })
      }
      setDialogOpen(false)
      await fetchPlatforms()
    } catch {
      // silently fail
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (p: Platform) => {
    if (!token) return
    await fetch(`${API_URL}/admin/platforms/${p.id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    })
    await fetchPlatforms()
  }

  const handleDeletePlatform = async () => {
    if (!token || !deleteTarget) return
    await fetch(`${API_URL}/admin/platforms/${deleteTarget.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    setDeleteTarget(null)
    await fetchPlatforms()
  }

  // ---- Field CRUD ----

  const handleAddField = async () => {
    if (!token || !addFieldPlatformId || !newFieldData.label || !newFieldData.fieldKey) return
    setSavingField(true)
    try {
      await fetch(`${API_URL}/admin/platforms/${addFieldPlatformId}/fields`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(newFieldData),
      })
      setAddFieldPlatformId(null)
      setNewFieldData(emptyField())
      await fetchPlatforms()
    } catch {
      // silently fail
    } finally {
      setSavingField(false)
    }
  }

  const handleEditField = async () => {
    if (!token || !editingField) return
    await fetch(`${API_URL}/admin/fields/${editingField.field.id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ label: editFieldLabel, fieldType: editFieldType, required: editFieldRequired }),
    })
    setEditingField(null)
    await fetchPlatforms()
  }

  const handleDeleteField = async () => {
    if (!token || !deleteFieldTarget) return
    await fetch(`${API_URL}/admin/fields/${deleteFieldTarget.field.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    setDeleteFieldTarget(null)
    await fetchPlatforms()
  }

  // ---- Form field helpers for create platform ----
  const addFormField = () => setFormFields([...formFields, emptyField()])
  const removeFormField = (i: number) => setFormFields(formFields.filter((_, idx) => idx !== i))
  const updateFormField = (i: number, patch: Partial<FieldFormData>) => {
    setFormFields(formFields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }

  // ---- Render ----

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-foreground text-lg font-semibold">Plataformas de Integracion</h2>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-foreground text-lg font-semibold">Plataformas de Integracion</h2>
        <Button size="sm" className="bg-aura hover:bg-aura/90 text-foreground gap-1.5" onClick={openCreateDialog}>
          <Plus className="h-3.5 w-3.5" />
          Nueva Plataforma
        </Button>
      </div>

      {platforms.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="bg-aura/10 flex h-16 w-16 items-center justify-center rounded-full">
            <Plug className="text-aura h-8 w-8" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <h3 className="text-foreground text-sm font-medium">No hay plataformas configuradas</h3>
            <p className="text-muted-foreground text-xs">Crea una plataforma para que los tenants configuren sus integraciones.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {platforms.map((p, pi) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: pi * 0.05 }}
            >
              <Card className="border-border/40 bg-card">
                <CardContent className="p-0">
                  {/* Platform header */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {expandedId === p.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>

                    <div className="bg-aura/10 flex h-8 w-8 items-center justify-center rounded-lg">
                      <span className="text-aura">{ICON_MAP[p.icon || "Plug"] || ICON_MAP.Plug}</span>
                    </div>

                    <div className="flex flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground text-sm font-medium">{p.name}</span>
                        <Badge variant="outline" className="border-border/40 text-muted-foreground text-[10px]">
                          {p.slug}
                        </Badge>
                      </div>
                      <span className="text-muted-foreground text-[11px]">
                        {CATEGORY_LABELS[p.category] || p.category} · {p.fields.length} campo{p.fields.length !== 1 ? "s" : ""}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={p.isActive}
                        onCheckedChange={() => handleToggleActive(p)}
                        className="scale-75"
                      />
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDialog(p)}>
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded: fields */}
                  <AnimatePresence>
                    {expandedId === p.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-border/30 mx-4 mb-4 border-t pt-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-muted-foreground text-xs font-medium">Campos de credenciales</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-aura hover:text-aura/80 h-6 gap-1 px-2 text-[11px]"
                              onClick={() => {
                                setAddFieldPlatformId(p.id)
                                setNewFieldData(emptyField())
                              }}
                            >
                              <Plus className="h-3 w-3" />
                              Agregar campo
                            </Button>
                          </div>

                          {p.fields.length === 0 ? (
                            <p className="text-muted-foreground py-4 text-center text-xs">
                              No hay campos configurados
                            </p>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {p.fields.map((f) => (
                                <div
                                  key={f.id}
                                  className="bg-secondary/30 border-border/20 flex items-center gap-3 rounded-lg border px-3 py-2"
                                >
                                  <GripVertical className="text-muted-foreground/40 h-3.5 w-3.5 shrink-0" />
                                  <div className="flex flex-1 flex-col">
                                    <span className="text-foreground text-xs font-medium">{f.label}</span>
                                    <span className="text-muted-foreground font-mono text-[10px]">{f.fieldKey}</span>
                                  </div>
                                  <Badge variant="outline" className="border-border/30 text-muted-foreground text-[10px]">
                                    {FIELD_TYPE_LABELS[f.fieldType] || f.fieldType}
                                  </Badge>
                                  {f.required && (
                                    <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px]">
                                      Requerido
                                    </Badge>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => {
                                      setEditingField({ platformId: p.id, field: f })
                                      setEditFieldLabel(f.label)
                                      setEditFieldType(f.fieldType)
                                      setEditFieldRequired(f.required)
                                    }}
                                  >
                                    <Pencil className="h-3 w-3 text-muted-foreground" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => setDeleteFieldTarget({ platformId: p.id, field: f })}
                                  >
                                    <Trash2 className="h-3 w-3 text-red-400" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* ---- Create/Edit Platform Dialog ---- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-background border-border/40 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {editingPlatform ? "Editar Plataforma" : "Nueva Plataforma"}
            </DialogTitle>
            <DialogDescription>
              {editingPlatform
                ? "Modifica el nombre, icono o categoria."
                : "Define la plataforma y sus campos de credenciales."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-muted-foreground text-xs">Nombre</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ej: Telegram"
                  className="border-border/40 bg-secondary/30 text-foreground h-9 text-sm"
                />
              </div>
              {!editingPlatform && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-muted-foreground text-xs">Slug</Label>
                  <Input
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value)}
                    placeholder="telegram"
                    className="border-border/40 bg-secondary/30 text-foreground h-9 font-mono text-sm"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-muted-foreground text-xs">Icono</Label>
                <Select value={formIcon} onValueChange={setFormIcon}>
                  <SelectTrigger className="border-border/40 bg-secondary/30 text-foreground h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map((icon) => (
                      <SelectItem key={icon} value={icon}>
                        <span className="flex items-center gap-2">
                          {ICON_MAP[icon]}
                          {icon}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-muted-foreground text-xs">Categoria</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger className="border-border/40 bg-secondary/30 text-foreground h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fields — only for create */}
            {!editingPlatform && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground text-xs">Campos de credenciales</Label>
                  <Button variant="ghost" size="sm" className="text-aura h-6 gap-1 px-2 text-[11px]" onClick={addFormField}>
                    <Plus className="h-3 w-3" />
                    Agregar
                  </Button>
                </div>
                {formFields.map((f, i) => (
                  <div key={i} className="bg-secondary/20 border-border/20 flex items-end gap-2 rounded-lg border p-2">
                    <div className="flex flex-1 flex-col gap-1">
                      <Input
                        value={f.label}
                        onChange={(e) => updateFormField(i, { label: e.target.value })}
                        placeholder="Label (ej: Token API)"
                        className="border-border/30 bg-background/50 h-8 text-xs"
                      />
                    </div>
                    <div className="flex flex-1 flex-col gap-1">
                      <Input
                        value={f.fieldKey}
                        onChange={(e) => updateFormField(i, { fieldKey: e.target.value })}
                        placeholder="Key (ej: api_token)"
                        className="border-border/30 bg-background/50 h-8 font-mono text-xs"
                      />
                    </div>
                    <Select value={f.fieldType} onValueChange={(v) => updateFormField(i, { fieldType: v })}>
                      <SelectTrigger className="border-border/30 bg-background/50 h-8 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="secret">Secreto</SelectItem>
                        <SelectItem value="text">Texto</SelectItem>
                        <SelectItem value="url">URL</SelectItem>
                      </SelectContent>
                    </Select>
                    {formFields.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={() => removeFormField(i)}>
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-aura hover:bg-aura/90 text-foreground"
              onClick={handleSavePlatform}
              disabled={saving || !formName.trim()}
            >
              {saving ? "Guardando..." : editingPlatform ? "Guardar cambios" : "Crear plataforma"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Delete Platform Dialog ---- */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="bg-background border-border/40">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              Eliminar plataforma
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminara <strong>{deleteTarget?.name}</strong> con todos sus campos y las credenciales de todos los tenants conectados. Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeletePlatform}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---- Add Field Dialog ---- */}
      <Dialog open={!!addFieldPlatformId} onOpenChange={() => setAddFieldPlatformId(null)}>
        <DialogContent className="bg-background border-border/40 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Agregar campo</DialogTitle>
            <DialogDescription>Define un nuevo campo de credencial para esta plataforma.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-muted-foreground text-xs">Label</Label>
                <Input
                  value={newFieldData.label}
                  onChange={(e) => setNewFieldData({ ...newFieldData, label: e.target.value })}
                  placeholder="Ej: Token API"
                  className="border-border/40 bg-secondary/30 h-9 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-muted-foreground text-xs">Field Key</Label>
                <Input
                  value={newFieldData.fieldKey}
                  onChange={(e) => setNewFieldData({ ...newFieldData, fieldKey: e.target.value })}
                  placeholder="api_token"
                  className="border-border/40 bg-secondary/30 h-9 font-mono text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-muted-foreground text-xs">Tipo</Label>
                <Select value={newFieldData.fieldType} onValueChange={(v) => setNewFieldData({ ...newFieldData, fieldType: v })}>
                  <SelectTrigger className="border-border/40 bg-secondary/30 h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="secret">Secreto</SelectItem>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="url">URL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-muted-foreground text-xs">Requerido</Label>
                <div className="flex h-9 items-center">
                  <Switch
                    checked={newFieldData.required}
                    onCheckedChange={(v) => setNewFieldData({ ...newFieldData, required: v })}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddFieldPlatformId(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-aura hover:bg-aura/90 text-foreground"
              onClick={handleAddField}
              disabled={savingField || !newFieldData.label || !newFieldData.fieldKey}
            >
              {savingField ? "Guardando..." : "Agregar campo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Edit Field Dialog ---- */}
      <Dialog open={!!editingField} onOpenChange={() => setEditingField(null)}>
        <DialogContent className="bg-background border-border/40 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Editar campo</DialogTitle>
            <DialogDescription>
              Modifica el label, tipo o si es requerido. El field key no se puede cambiar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-muted-foreground text-xs">Label</Label>
              <Input
                value={editFieldLabel}
                onChange={(e) => setEditFieldLabel(e.target.value)}
                className="border-border/40 bg-secondary/30 h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-muted-foreground text-xs">Tipo</Label>
                <Select value={editFieldType} onValueChange={setEditFieldType}>
                  <SelectTrigger className="border-border/40 bg-secondary/30 h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="secret">Secreto</SelectItem>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="url">URL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-muted-foreground text-xs">Requerido</Label>
                <div className="flex h-9 items-center">
                  <Switch checked={editFieldRequired} onCheckedChange={setEditFieldRequired} />
                </div>
              </div>
            </div>
            {editingField && (
              <p className="text-muted-foreground text-[11px]">
                Field key: <code className="bg-secondary/50 rounded px-1">{editingField.field.fieldKey}</code> (no editable)
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setEditingField(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-aura hover:bg-aura/90 text-foreground"
              onClick={handleEditField}
              disabled={!editFieldLabel.trim()}
            >
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Delete Field Dialog ---- */}
      <AlertDialog open={!!deleteFieldTarget} onOpenChange={() => setDeleteFieldTarget(null)}>
        <AlertDialogContent className="bg-background border-border/40">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              Eliminar campo
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminara el campo <strong>{deleteFieldTarget?.field.label}</strong>. Los tenants que ya tienen este campo configurado perderan ese dato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeleteField}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
