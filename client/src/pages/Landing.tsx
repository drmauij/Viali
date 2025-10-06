import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Landing() {
  const [showSignup, setShowSignup] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const { toast } = useToast();

  const handleGoogleLogin = () => {
    window.location.href = "/api/login";
  };

  const handleLocalLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      toast({ title: "Success", description: "Login successful!" });
      window.location.href = "/";
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Login failed", 
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('signup-email') as string;
    const password = formData.get('signup-password') as string;
    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const hospitalName = formData.get('hospitalName') as string;

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, firstName, lastName, hospitalName })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Signup failed');
      }

      toast({ title: "Success", description: "Account created successfully!" });
      window.location.href = "/";
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Signup failed", 
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-background">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-primary flex items-center justify-center">
            <i className="fas fa-prescription-bottle-medical text-3xl text-primary-foreground"></i>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Viali</h1>
          <p className="text-muted-foreground mt-2">Hospital Inventory Management</p>
        </div>
        
        {/* Login/Signup Card */}
        <Card className="shadow-lg">
          <CardContent className="p-6">
            {!showSignup ? (
              <>
                {/* Google OAuth Login */}
                <Button 
                  className="w-full mb-4" 
                  size="lg"
                  onClick={handleGoogleLogin}
                  data-testid="login-btn"
                >
                  <i className="fab fa-google mr-2"></i>
                  Sign in with Google
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
                      name="email"
                      type="email"
                      placeholder="you@hospital.org"
                      className="w-full"
                      required
                      data-testid="email-input"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="password" className="block text-sm font-medium mb-2">
                      Password
                    </Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      className="w-full"
                      required
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
                    <button
                      type="button"
                      onClick={() => setForgotPasswordOpen(true)}
                      className="text-primary hover:underline"
                      data-testid="forgot-password-link"
                    >
                      Forgot password?
                    </button>
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full" 
                    size="lg" 
                    disabled={isLoading}
                    data-testid="local-login-button"
                  >
                    {isLoading ? "Signing In..." : "Sign In"}
                  </Button>
                </form>
              </>
            ) : (
              <>
                {/* Signup Mode */}
                <h2 className="text-xl font-semibold text-foreground mb-4">Create Your Hospital</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Sign up to create a new hospital account. You'll be assigned as the admin automatically.
                </p>
                
                {/* Google OAuth Signup */}
                <Button 
                  className="w-full mb-4" 
                  size="lg"
                  onClick={handleGoogleLogin}
                  data-testid="signup-google-btn"
                  disabled={isLoading}
                >
                  <i className="fab fa-google mr-2"></i>
                  Sign up with Google
                </Button>
                
                {/* Divider */}
                <div className="flex items-center gap-4 my-6">
                  <div className="flex-1 h-px bg-border"></div>
                  <span className="text-sm text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border"></div>
                </div>
                
                {/* Email/Password Signup Form */}
                <form className="space-y-4" onSubmit={handleEmailSignup}>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName" className="block text-sm font-medium mb-2">
                        First Name
                      </Label>
                      <Input
                        id="firstName"
                        name="firstName"
                        type="text"
                        placeholder="John"
                        className="w-full"
                        required
                        data-testid="signup-firstname-input"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName" className="block text-sm font-medium mb-2">
                        Last Name
                      </Label>
                      <Input
                        id="lastName"
                        name="lastName"
                        type="text"
                        placeholder="Doe"
                        className="w-full"
                        required
                        data-testid="signup-lastname-input"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="signup-email" className="block text-sm font-medium mb-2">
                      Email
                    </Label>
                    <Input
                      id="signup-email"
                      name="signup-email"
                      type="email"
                      placeholder="you@hospital.org"
                      className="w-full"
                      required
                      data-testid="signup-email-input"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="signup-password" className="block text-sm font-medium mb-2">
                      Password
                    </Label>
                    <Input
                      id="signup-password"
                      name="signup-password"
                      type="password"
                      placeholder="••••••••"
                      className="w-full"
                      required
                      minLength={6}
                      data-testid="signup-password-input"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="hospitalName" className="block text-sm font-medium mb-2">
                      Hospital Name
                    </Label>
                    <Input
                      id="hospitalName"
                      name="hospitalName"
                      type="text"
                      placeholder="General Hospital"
                      className="w-full"
                      required
                      data-testid="signup-hospital-input"
                    />
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full" 
                    size="lg" 
                    disabled={isLoading}
                    data-testid="signup-submit-btn"
                  >
                    {isLoading ? "Creating Account..." : "Create Account"}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
        
        <p className="text-center text-sm text-muted-foreground mt-6">
          {!showSignup ? (
            <>
              Don't have an account?{" "}
              <button onClick={() => setShowSignup(true)} className="text-primary hover:underline" data-testid="show-signup-button">
                Sign up to create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button onClick={() => setShowSignup(false)} className="text-primary hover:underline" data-testid="show-login-button">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>

      {/* Forgot Password Dialog */}
      <Dialog open={forgotPasswordOpen} onOpenChange={(open) => {
        setForgotPasswordOpen(open);
        if (!open) {
          setResetEmail("");
          setResetSent(false);
        }
      }}>
        <DialogContent data-testid="forgot-password-dialog">
          <DialogHeader>
            <DialogTitle>Forgot Password</DialogTitle>
          </DialogHeader>
          {!resetSent ? (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setIsLoading(true);
                try {
                  const response = await fetch('/api/auth/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: resetEmail }),
                  });
                  
                  if (response.ok) {
                    setResetSent(true);
                  } else {
                    const data = await response.json();
                    toast({
                      title: "Error",
                      description: data.message || "Failed to send reset email",
                      variant: "destructive",
                    });
                  }
                } catch (error) {
                  toast({
                    title: "Error",
                    description: "Failed to send reset email",
                    variant: "destructive",
                  });
                } finally {
                  setIsLoading(false);
                }
              }}>
                <div className="space-y-4">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    data-testid="reset-email-input"
                  />
                  <Button 
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    data-testid="send-reset-link"
                  >
                    {isLoading ? "Sending..." : "Send Reset Link"}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                If an account with that email exists, a password reset link has been sent. Please check your email inbox and spam folder.
              </p>
              <Button 
                onClick={() => {
                  setForgotPasswordOpen(false);
                  setResetEmail("");
                  setResetSent(false);
                }}
                className="w-full"
                data-testid="close-forgot-password"
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
