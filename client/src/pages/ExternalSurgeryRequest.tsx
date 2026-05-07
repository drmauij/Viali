import { useEffect } from "react";
import { useParams, useLocation } from "wouter";

export default function ExternalSurgeryRequest() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (token) navigate(`/surgeon-portal/${token}`, { replace: true });
  }, [token, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-8 text-center">
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-semibold">
          Surgery requests are now submitted via the surgeon portal.
        </h1>
        <p className="text-muted-foreground">
          Redirecting to the portal sign-in. If the page does not redirect automatically,
          follow the link sent to your email.
        </p>
      </div>
    </div>
  );
}
