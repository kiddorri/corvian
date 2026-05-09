"use client";

import { FormEvent, KeyboardEvent, useRef, useState } from "react";

interface ChatInputProps {
  disabled?: boolean;
  onSend: (text: string) => void;
  placeholder?: string;
}

export function ChatInput({ disabled, onSend, placeholder }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  const isActive = value.trim().length > 0 && !disabled;

  return (
    <div className="border-t border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-5 py-4">
      <div className="flex items-end gap-2.5">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKey}
          disabled={disabled}
          placeholder={placeholder ?? "Напиши сообщение..."}
          className="flex-1 resize-none rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.06)] px-4 py-3 text-sm text-[rgba(255,255,255,0.9)] placeholder:text-[rgba(255,255,255,0.25)] focus:border-[rgba(99,102,241,0.5)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => submit()}
          disabled={!isActive}
          aria-label="Отправить"
          className={`shrink-0 rounded-xl px-5 py-3 text-base font-semibold transition-all ${
            isActive
              ? "text-white"
              : "bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.2)] cursor-not-allowed"
          }`}
          style={
            isActive
              ? { background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }
              : undefined
          }
        >
          ↑
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-[rgba(255,255,255,0.2)]">
        Corvian не даёт готовых ответов — учит думать самостоятельно
      </p>
    </div>
  );
}
