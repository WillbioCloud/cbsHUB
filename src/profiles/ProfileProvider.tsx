import { openSettings } from "../lib/settingsNavigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useHubStore } from "../store/useHubStore";
import { webrtcEngine } from "../lib/webrtcEngine";
import { defaultProfile, validateProfile, type UserProfile } from "./model";
import { blockedIds, loadProfile, saveProfile, setBlocked } from "./repository";
interface Context {
  own: UserProfile;
  error: string;
  selected: string | null;
  editing: boolean;
  full: boolean;
  blocked: string[];
  view: (id: string) => void;
  edit: () => void;
  close: () => void;
  expand: () => void;
  save: (p: UserProfile) => boolean;
  block: (id: string, value: boolean) => void;
}
const Profiles = createContext<Context | null>(null);
export function useProfiles() {
  const context = useContext(Profiles);
  if (!context) throw new Error("ProfileProvider ausente");
  return context;
}
export function ProfileProvider({ children }: { children: ReactNode }) {
  const identity = useHubStore.getState();
  const [initial] = useState(() => {
    try {
      return {
        profile: loadProfile(identity.clientId, identity.nickname),
        error: "",
      };
    } catch (e) {
      return {
        profile: defaultProfile(identity.clientId, identity.nickname),
        error: (e as Error).message,
      };
    }
  });
  const [own, setOwn] = useState(initial.profile),
    [error, setError] = useState(initial.error),
    [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState(false),
    [full, setFull] = useState(false),
    [blocked, setBlockedState] = useState(blockedIds);
  useEffect(() => {
    const change = () => {
      setBlockedState(blockedIds());
      webrtcEngine.refreshLocalProfile();
    };
    window.addEventListener("cbshub-profile-changed", change);
    return () => window.removeEventListener("cbshub-profile-changed", change);
  }, []);
  useEffect(() => {
    useHubStore.getState().setNickname(own.displayName);
    useHubStore.getState().setAvatarColor(own.appearance.color);
  }, [own]);
  const value: Context = {
    own,
    error,
    selected,
    editing,
    full,
    blocked,
    view: (id) => {
      setSelected(id);
      setEditing(false);
      setFull(false);
    },
    edit: () => {
      setSelected(null);
      setEditing(false);
      setFull(true);
      openSettings("profile");
    },
    expand: () => setFull(true),
    close: () => {
      setSelected(null);
      setEditing(false);
    },
    save: (draft) => {
      try {
        const clean = validateProfile(draft, identity.clientId);
        if (
          Object.values(useHubStore.getState().participants).some(
            (p) =>
              p.clientId !== identity.clientId &&
              p.profile?.username === clean.username,
          )
        )
          throw new Error("Nome de usuário já utilizado nesta sala.");
        const saved = saveProfile(clean, identity.clientId);
        setOwn(saved);
        setError("");
        window.dispatchEvent(new Event("cbshub-profile-changed"));
        setEditing(false);
        setSelected(null);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    block: (id, value) => {
      try {
        setBlocked(id, value, identity.clientId);
        setError("");
      } catch (e) {
        setError((e as Error).message);
      }
    },
  };
  return <Profiles.Provider value={value}>{children}</Profiles.Provider>;
}
