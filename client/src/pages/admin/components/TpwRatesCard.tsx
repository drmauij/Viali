import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Database, Plus, Trash2 } from "lucide-react";

const SWISS_CANTONS = [
  "AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR",
  "JU", "LU", "NE", "NW", "OW", "SG", "SH", "SO", "SZ", "TG",
  "TI", "UR", "VD", "VS", "ZG", "ZH"
];

interface TpwRate {
  id: string;
  canton: string;
  insurerGln: string | null;
  lawType: string | null;
  tpValueAl: string | null;
  tpValueTl: string | null;
  tpValue: string;
  validFrom: string;
  validTo: string | null;
  notes: string | null;
}

export function TpwRatesCard({ hospitalId }: { hospitalId?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isAdding, setIsAdding] = React.useState(false);
  const [newRate, setNewRate] = React.useState({
    canton: '', tpValue: '', validFrom: new Date().toISOString().split('T')[0],
    validTo: '', insurerGln: '', lawType: '', notes: '',
  });

  const { data: rates = [], isLoading } = useQuery<TpwRate[]>({
    queryKey: [`/api/clinic/${hospitalId}/tpw-rates`],
    enabled: !!hospitalId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newRate) => {
      const res = await apiRequest('POST', `/api/clinic/${hospitalId}/tpw-rates`, {
        ...data,
        insurerGln: data.insurerGln || null,
        lawType: data.lawType || null,
        validTo: data.validTo || null,
        notes: data.notes || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/tpw-rates`] });
      toast({ title: 'TPW rate added' });
      setIsAdding(false);
      setNewRate({ canton: '', tpValue: '', validFrom: new Date().toISOString().split('T')[0], validTo: '', insurerGln: '', lawType: '', notes: '' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/clinic/${hospitalId}/tpw-rates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/tpw-rates`] });
      toast({ title: 'TPW rate deleted' });
    },
  });

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-medium">TPW Rates (Taxpunktwert)</h3>
            <p className="text-sm text-muted-foreground">
              Canton/insurer-specific tax point values for TARDOC billing
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{rates.length} rate{rates.length !== 1 ? 's' : ''}</span>
          <Button size="sm" onClick={() => setIsAdding(!isAdding)} disabled={!hospitalId}>
            <Plus className="h-4 w-4 mr-1" /> Add Rate
          </Button>
        </div>
      </div>

      {isAdding && (
        <div className="border rounded p-3 mb-3 bg-muted/30 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-xs font-medium">Canton *</label>
              <select
                className="w-full border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                value={newRate.canton}
                onChange={e => setNewRate(r => ({ ...r, canton: e.target.value }))}
              >
                <option value="">Select...</option>
                {SWISS_CANTONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">TP Value (CHF) *</label>
              <input
                type="number"
                step="0.0001"
                className="w-full border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                value={newRate.tpValue}
                onChange={e => setNewRate(r => ({ ...r, tpValue: e.target.value }))}
                placeholder="e.g. 0.8300"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Valid From *</label>
              <DateInput
                value={newRate.validFrom}
                onChange={(isoDate) => setNewRate(r => ({ ...r, validFrom: isoDate }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium">Valid To</label>
              <DateInput
                value={newRate.validTo}
                onChange={(isoDate) => setNewRate(r => ({ ...r, validTo: isoDate }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium">Insurer GLN</label>
              <input
                className="w-full border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                value={newRate.insurerGln}
                onChange={e => setNewRate(r => ({ ...r, insurerGln: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Law Type</label>
              <select
                className="w-full border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                value={newRate.lawType}
                onChange={e => setNewRate(r => ({ ...r, lawType: e.target.value }))}
              >
                <option value="">Any</option>
                <option value="KVG">KVG</option>
                <option value="UVG">UVG</option>
                <option value="IVG">IVG</option>
                <option value="MVG">MVG</option>
                <option value="VVG">VVG</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Notes</label>
              <input
                className="w-full border rounded px-2 py-1.5 text-sm bg-background text-foreground"
                value={newRate.notes}
                onChange={e => setNewRate(r => ({ ...r, notes: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => createMutation.mutate(newRate)}
              disabled={!newRate.canton || !newRate.tpValue || !newRate.validFrom || createMutation.isPending}
            >
              {createMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : rates.length > 0 ? (
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-1.5 font-medium">Canton</th>
                <th className="text-left px-3 py-1.5 font-medium">TP Value</th>
                <th className="text-left px-3 py-1.5 font-medium">Law</th>
                <th className="text-left px-3 py-1.5 font-medium">Insurer</th>
                <th className="text-left px-3 py-1.5 font-medium">Valid</th>
                <th className="text-left px-3 py-1.5 font-medium">Notes</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rates.map(rate => (
                <tr key={rate.id} className="border-t">
                  <td className="px-3 py-1.5 font-mono">{rate.canton}</td>
                  <td className="px-3 py-1.5 font-mono">{rate.tpValue}</td>
                  <td className="px-3 py-1.5">{rate.lawType || 'Any'}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{rate.insurerGln || '-'}</td>
                  <td className="px-3 py-1.5 text-xs">
                    {rate.validFrom}{rate.validTo ? ` → ${rate.validTo}` : ' →'}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{rate.notes || '-'}</td>
                  <td className="px-2 py-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => deleteMutation.mutate(rate.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No TPW rates configured. The hospital default TP value will be used for all invoices.
        </p>
      )}
    </div>
  );
}
