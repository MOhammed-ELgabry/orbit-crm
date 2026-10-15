import { useContext } from "react";

import { ChatContext, type ChatContextValue } from "../context/chatContext";

export function useChat(): ChatContextValue {
  const context = useContext(ChatContext);

  if (!context) {
    throw new Error("useChat must be used inside <ChatProvider>.");
  }

  return context;
}
