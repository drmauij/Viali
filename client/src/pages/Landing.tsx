import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export default function Landing() {
  const handleGoogleLogin = () => {
    window.location.href = "/api/login";
  };

  const handleLocalLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // For now, redirect to Google login since local auth setup is complex
    handleGoogleLogin();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-background">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-primary flex items-center justify-center">
            <i className="fas fa-prescription-bottle-medical text-3xl text-primary-foreground"></i>
          </div>
          <h1 className="text-3xl font-bold text-foreground">AnaStock</h1>
          <p className="text-muted-foreground mt-2">Hospital Inventory Management</p>
        </div>
        
        {/* Login Card */}
        <Card className="shadow-lg">
          <CardContent className="p-6">
            {/* Google OAuth Login */}
            <Button 
              className="w-full mb-4" 
              size="lg"
              onClick={handleGoogleLogin}
              data-testid="google-login-button"
            >
              <i className="fab fa-google mr-2"></i>
              Continue with Google
            </Button>
            
            {/* Divider */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-border"></div>
              <span className="text-sm text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border"></div>
            </div>
            
            {/* Email/Password Form */}
            <form className="space-y-4" onSubmit={handleLocalLogin}>
              <div>
                <Label htmlFor="email" className="block text-sm font-medium mb-2">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@hospital.org"
                  className="w-full"
                  data-testid="email-input"
                />
              </div>
              
              <div>
                <Label htmlFor="password" className="block text-sm font-medium mb-2">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="w-full"
                  data-testid="password-input"
                />
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Checkbox id="remember" />
                  <Label htmlFor="remember" className="cursor-pointer">
                    Remember me
                  </Label>
                </div>
                <a href="#" className="text-primary hover:underline">
                  Forgot password?
                </a>
              </div>
              
              <Button type="submit" className="w-full" size="lg" data-testid="local-login-button">
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
        
        <p className="text-center text-sm text-muted-foreground mt-6">
          Don't have an account?{" "}
          <a href="#" className="text-primary hover:underline">
            Contact your administrator
          </a>
        </p>
      </div>
    </div>
  );
}
