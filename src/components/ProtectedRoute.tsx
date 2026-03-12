import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";

export function ProtectedRoute() {
  const { user, role, loading, roleLoading, suspended, onboardingCompleted, practiceSetupCompleted, signOut } = useAuth();
  const location = useLocation();

  const loadingUI = (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="animate-pulse font-mono text-muted-foreground mono-label">LOADING</div>
    </div>
  );

  if (loading || roleLoading) return loadingUI;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (suspended === null) return loadingUI;

  if (suspended) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 gap-4">
        <span className="mono-label text-destructive">ACCOUNT SUSPENDED</span>
        <h1 className="font-display text-2xl font-semibold text-center">Your practice has been deactivated</h1>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Contact support to reactivate your account.
        </p>
        <button
          onClick={async () => { await signOut(); }}
          className="mono-label text-primary hover:underline mt-4"
        >
          SIGN OUT
        </button>
      </div>
    );
  }

  const path = location.pathname;

  if (role === "admin" && !path.startsWith("/admin")) {
    return <Navigate to="/admin" replace />;
  }

  if (role === "doctor") {
    if (!path.startsWith("/doctor")) {
      return <Navigate to="/doctor" replace />;
    }
    if (practiceSetupCompleted === false && !path.startsWith("/doctor/setup")) {
      return <Navigate to="/doctor/setup" replace />;
    }
    if (practiceSetupCompleted === true && path.startsWith("/doctor/setup")) {
      return <Navigate to="/doctor" replace />;
    }
  }

  if (role === "patient") {
    if (!onboardingCompleted && !path.startsWith("/patient/onboarding")) {
      return <Navigate to="/patient/onboarding" replace />;
    }
    if (onboardingCompleted && path.startsWith("/patient/onboarding")) {
      return <Navigate to="/patient" replace />;
    }
    if (!path.startsWith("/patient")) {
      return <Navigate to="/patient" replace />;
    }
  }

  return <Outlet />;
}
