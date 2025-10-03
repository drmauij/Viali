import { useLocation } from "wouter";

export default function ControlledLogFab() {
  const [location, navigate] = useLocation();

  // Hide FAB on controlled log screen
  if (location === "/controlled") {
    return null;
  }

  return (
    <button
      className="controlled-log-fab"
      onClick={() => navigate("/controlled")}
      data-testid="controlled-log-fab"
    >
      <i className="fas fa-shield-halved"></i>
    </button>
  );
}
