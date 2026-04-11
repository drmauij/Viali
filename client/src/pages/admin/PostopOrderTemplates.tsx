import { useState } from 'react';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import { usePostopOrderTemplates, type TemplateRow } from '@/hooks/usePostopOrderTemplates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { OrderSetEditorDialog } from '@/components/anesthesia/postop/OrderSetEditorDialog';
import { Trash2, Pencil, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function PostopOrderTemplatesPage() {
  const { t } = useTranslation();
  const hospital = useActiveHospital();
  const { data: templates = [], create, update, remove } = usePostopOrderTemplates(hospital?.id);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [itemsEditorOpen, setItemsEditorOpen] = useState(false);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('postopOrders.adminTitle', 'Postop Order Templates')}</h1>
        <Button
          onClick={() => hospital && create.mutate({
            hospitalId: hospital.id,
            name: 'New template',
            description: null,
            items: [],
            procedureCode: null,
          })}
          data-testid="button-new-template"
        >
          <Plus className="w-4 h-4 mr-1" /> {t('postopOrders.newTemplate', 'Neue Vorlage')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map(tpl => (
          <Card key={tpl.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{tpl.name}</CardTitle>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => { setEditing(tpl); setItemsEditorOpen(true); }}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove.mutate(tpl.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="text-muted-foreground">{tpl.description ?? t('postopOrders.noDescription', 'Keine Beschreibung')}</div>
              <div>{tpl.items.length} {t('postopOrders.items', 'Einträge')}</div>
              <div>
                <Input
                  defaultValue={tpl.name}
                  className="text-sm"
                  onBlur={(e) => {
                    if (e.target.value !== tpl.name) {
                      update.mutate({ id: tpl.id, patch: { name: e.target.value } });
                    }
                  }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && (
        <OrderSetEditorDialog
          open={itemsEditorOpen}
          onOpenChange={(v) => { setItemsEditorOpen(v); if (!v) setEditing(null); }}
          initial={{ items: editing.items, templateId: null }}
          templates={[]}
          onSave={({ items }) => update.mutate({ id: editing.id, patch: { items } })}
        />
      )}
    </div>
  );
}
