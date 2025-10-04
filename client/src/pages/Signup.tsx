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
  const { toast } = useToast();

  const signupMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/signup", { hospitalName: name });
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Hospital created successfully!" });
      setTimeout(() => {
        window.location.href = "/";
      }, 1000);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create hospital", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalName.trim()) {
      toast({ title: "Error", description: "Hospital name is required", variant: "destructive" });
      return;
    }
    signupMutation.mutate(hospitalName);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-background">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-primary flex items-center justify-center">
            <i className="fas fa-prescription-bottle-medical text-3xl text-primary-foreground"></i>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Welcome to AnaStock</h1>
          <p className="text-muted-foreground mt-2">Let's create your hospital</p>
        </div>
        
        {/* Signup Card */}
        <Card className="shadow-lg">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="hospital-name" className="block text-sm font-medium mb-2">
                  Hospital Name *
                </Label>
                <Input
                  id="hospital-name"
                  type="text"
                  placeholder="e.g., City General Hospital"
                  className="w-full"
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  data-testid="input-hospital-name"
                  disabled={signupMutation.isPending}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  You'll be assigned as the administrator of this hospital.
                </p>
              </div>
              
              <Button 
                type="submit" 
                className="w-full" 
                size="lg"
                disabled={signupMutation.isPending}
                data-testid="button-create-hospital"
              >
                {signupMutation.isPending ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Creating...
                  </>
                ) : (
                  <>Create Hospital</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        <p className="text-center text-sm text-muted-foreground mt-6">
          Need help?{" "}
          <a href="mailto:support@anastock.com" className="text-primary hover:underline">
            Contact Support
          </a>
        </p>
      </div>
    </div>
  );
}
