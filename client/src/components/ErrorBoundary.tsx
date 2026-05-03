import React from "react";
import * as Sentry from "@sentry/react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import type { AuthUser } from "@/hooks/useAuth";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onReset?: () => void;
}

// Public-facing routes where we should NOT prompt patients/anonymous users for crash feedback.
const PUBLIC_ROUTE_PREFIXES = [
  "/patient/",
  "/questionnaire/",
  "/q/",
  "/external-surgery/",
  "/surgeon-portal/",
  "/contract/",
  "/worklog/",
  "/kiosk/",
  "/manage-appointment/",
  "/cancel-appointment/",
  "/book/",
  "/api",
];

function isStaffRoute(pathname: string): boolean {
  return !PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

function DefaultFallback({
  error,
  onReset,
}: {
  error: Error | null;
  onReset: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <h2 className="text-xl font-semibold">{t("common.errorBoundaryTitle")}</h2>
      <p className="text-muted-foreground max-w-md">
        {t("common.errorBoundaryMessage")}
      </p>
      {error && import.meta.env.DEV && (
        <pre className="mt-2 max-w-lg overflow-auto rounded bg-muted p-3 text-xs text-left">
          {error.message}
        </pre>
      )}
      <button
        onClick={onReset}
        className="mt-2 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
      >
        {t("common.reload")}
      </button>
    </div>
  );
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    const eventId = Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } },
    });
    // Crash-report modal: only prompt staff users on the staff app — patients on
    // public routes shouldn't see "report a bug" prompts. Pre-fill name/email
    // from the cached auth user so the staffer doesn't have to type it.
    if (eventId && isStaffRoute(window.location.pathname)) {
      const u = queryClient.getQueryData<AuthUser | null>(["/api/auth/user"]);
      Sentry.showReportDialog({
        eventId,
        user: u
          ? {
              name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "",
              email: u.email || "",
            }
          : undefined,
      });
    }
  }

  handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <DefaultFallback
          error={this.state.error}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
