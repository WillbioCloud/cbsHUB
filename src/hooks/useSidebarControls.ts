import { useStudio } from "../studio/StudioProvider";
import { useMediaQuery } from "./useWorkspaceLayout";
export function useSidebarControls() {
  const { theme } = useStudio();
  const mobile = useMediaQuery("(max-width: 767px)");
  return !mobile && !theme.layout.sidebarCollapsed;
}
