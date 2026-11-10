import type { PanelRoute } from "../store";
import { ClockIcon, HomeIcon, PeopleIcon, SettingsIcon } from "./Icons";

const TABS: Array<{ id: Exclude<PanelRoute, "patient">; label: string; icon: JSX.Element }> = [
  { id: "home", label: "Home", icon: <HomeIcon /> },
  { id: "patients", label: "Patients", icon: <PeopleIcon /> },
  { id: "activity", label: "Activity", icon: <ClockIcon /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon /> },
];

export function Nav({ route, onChange }: { route: PanelRoute; onChange: (route: Exclude<PanelRoute, "patient">) => void }) {
  const current = route === "patient" ? "patients" : route;
  return (
    <nav className="nav" aria-label="Primary">
      {TABS.map((tab) => (
        <button
          type="button"
          key={tab.id}
          aria-current={current === tab.id ? "page" : undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
