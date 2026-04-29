import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Signup() {
  const [hospitalName, setHospitalName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { toast } = useToast();

  const signupMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/signup", { hospitalName: name });
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Clinic created successfully!" });
      setTimeout(() => {
        window.location.href = "/";
      }, 800);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create clinic", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalName.trim()) {
      toast({ title: "Error", description: "Clinic name is required", variant: "destructive" });
      return;
    }
    signupMutation.mutate(hospitalName);
  };

  const handleSignOut = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-background">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-primary flex items-center justify-center">
            <i className="fas fa-prescription-bottle-medical text-3xl text-primary-foreground"></i>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Welcome to Viali</h1>
          <p className="text-muted-foreground mt-2">
            You're signed in, but not yet part of a clinic.
          </p>
        </div>

        <Card className="shadow-lg mb-4">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-2">Joining an existing clinic?</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Ask your clinic's administrator to send you an invitation. Once they
              add you, sign in again and your clinic will appear automatically.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              data-testid="button-signup-signout"
            >
              <i className="fas fa-sign-out-alt mr-2"></i>
              Sign out and wait for invitation
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-2">Or, create your own clinic</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Setting up a new clinic from scratch? You'll be assigned as administrator
              and Viali will pre-fill default units, rooms, and a starter medication list.
            </p>

            {!showCreateForm ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreateForm(true)}
                data-testid="button-show-create-form"
              >
                <i className="fas fa-plus mr-2"></i>
                Create a new clinic
              </Button>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="hospital-name" className="block text-sm font-medium mb-2">
                    Clinic name *
                  </Label>
                  <Input
                    id="hospital-name"
                    type="text"
                    placeholder="e.g., City General Clinic"
                    className="w-full"
                    value={hospitalName}
                    onChange={(e) => setHospitalName(e.target.value)}
                    data-testid="input-hospital-name"
                    disabled={signupMutation.isPending}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={signupMutation.isPending || !hospitalName.trim()}
                    data-testid="button-create-hospital"
                  >
                    {signupMutation.isPending ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Creating...
                      </>
                    ) : (
                      <>Create clinic</>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setShowCreateForm(false);
                      setHospitalName("");
                    }}
                    disabled={signupMutation.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Need help?{" "}
          <a href="mailto:support@viali.app" className="text-primary hover:underline">
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}
