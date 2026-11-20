import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { cn } from "../lib/utils";
import { useProfiles } from "../profiles/ProfileProvider";
import { useHubStore } from "../store/useHubStore";
interface Props {
  clientId?: string;
  interactive?: boolean;
  name: string;
  color?: string;
  speaking?: boolean;
  className?: string;
}
export function ParticipantAvatar({
  name,
  color,
  speaking,
  className,
  clientId,
  interactive = true,
}: Props) {
  const profiles = useProfiles();
  const remote = useHubStore(
    (state) =>
      Object.values(state.participants).find((p) => p.clientId === clientId)
        ?.profile,
  );
  const profile = clientId === profiles.own.ownerId ? profiles.own : remote;
  const visible = clientId && !profiles.blocked.includes(clientId);
  const avatar = visible ? profile?.avatar : undefined;
  const initials =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  const content = (
    <Avatar
      className={cn(
        "participant-avatar",
        speaking && "participant-avatar-speaking",
        className,
      )}
    >
      {avatar && <AvatarImage src={avatar} alt="" />}
      <AvatarFallback
        style={{ backgroundColor: color || "var(--primary)" }}
        className="text-white"
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
  return clientId && interactive ? (
    <button
      type="button"
      className="profile-avatar-trigger"
      aria-label={`Ver perfil de ${name}`}
      onClick={() => profiles.view(clientId)}
    >
      {content}
    </button>
  ) : (
    content
  );
}
