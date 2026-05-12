"use client";

import { FormattedText } from "./FormattedText";

interface ChatMessageProps {
  message: { role: string; content: string };
  ravenEmoji?: string;
  ravenLabel?: string;
  ravenColor?: string;
}

export function ChatMessage({ message, ravenLabel }: ChatMessageProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex w-full animate-fade-in-up justify-end">
        <div
          className="max-w-[82%] px-4 py-3 text-white"
          style={{
            background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
            borderRadius: "16px 16px 4px 16px",
          }}
        >
          <FormattedText text={message.content} variant="chat" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full animate-fade-in-up justify-start">
      <div
        className="max-w-[82%] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.06)] px-4 py-3 text-[rgba(255,255,255,0.9)]"
        style={{ borderRadius: "16px 16px 16px 4px" }}
      >
        {ravenLabel && (
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.5px] text-[#818cf8]">
            {ravenLabel}
          </p>
        )}
        <FormattedText text={message.content} variant="chat" />
      </div>
    </div>
  );
}
