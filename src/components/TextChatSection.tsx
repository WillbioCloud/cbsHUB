import { memo } from "react";
import { ChatPanel } from "../chat/ChatPanel";
import { useHubStore } from "../store/useHubStore";
export const TextChatSection = memo(function TextChatSection() {
  const room = useHubStore((state) => state.roomId);
  return <ChatPanel key={room} />;
});
