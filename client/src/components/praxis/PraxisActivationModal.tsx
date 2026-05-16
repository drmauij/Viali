import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PraxisActivationModal({ open, onClose }: Props) {
  const { toast } = useToast();
  const [sourceName, setSourceName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const activate = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/surgeon-portal/praxis/activate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceName, password }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `activation failed (${r.status})`);
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Praxis activated", description: "Redirecting to your calendar..." });
      window.location.href = "/anesthesia/op";
    },
    onError: (err: any) => {
      toast({ title: err.message ?? "Activation failed", variant: "destructive" });
    },
  });

  const valid =
    sourceName.trim().length > 0 &&
    password.length >= 8 &&
    password === confirm;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Activate your praxis on Viali</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This creates a full Viali instance for your praxis. You will be redirected after activation.
          Your historical surgery requests will be imported automatically.
        </p>
        <div className="space-y-3 mt-4">
          <div>
            <Label htmlFor="praxis-name">Praxis name</Label>
            <Input
              id="praxis-name"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="Praxis Mueller"
              data-testid="input-praxis-name"
            />
          </div>
          <div>
            <Label htmlFor="praxis-password">Password</Label>
            <Input
              id="praxis-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="input-praxis-password"
            />
          </div>
          <div>
            <Label htmlFor="praxis-confirm">Confirm password</Label>
            <Input
              id="praxis-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              data-testid="input-praxis-confirm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || activate.isPending}
            onClick={() => activate.mutate()}
            data-testid="button-activate-praxis"
          >
            {activate.isPending ? "Activating..." : "Activate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
