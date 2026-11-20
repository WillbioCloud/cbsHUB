import { useEffect, useState } from "react";
import { useStudio } from "../studio/StudioProvider";

export const SIDEBAR_MIN = 224;
export const SIDEBAR_MAX = 360;
export const SIDEBAR_DEFAULT = 264;

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function useWorkspaceLayout() {
  const { theme, updateLayout } = useStudio();
  return {
    sidebarWidth: theme.layout.sidebarWidth,
    sidebarCollapsed: theme.layout.sidebarCollapsed,
    membersOpen: theme.layout.membersOpen,
    setSidebarWidth: (value: number) =>
      updateLayout({
        sidebarWidth: Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, value)),
      }),
    toggleSidebar: () =>
      updateLayout({ sidebarCollapsed: !theme.layout.sidebarCollapsed }),
    toggleMembers: () =>
      updateLayout({ membersOpen: !theme.layout.membersOpen }),
  };
}
