"use client";

import { Fragment, ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

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
          <MessageContent text={message.content} />
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
        <MessageContent text={message.content} />
      </div>
    </div>
  );
}

function MessageContent({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((b, i) => (
        <Fragment key={i}>{b}</Fragment>
      ))}
    </div>
  );
}

function parseBlocks(text: string): ReactNode[] {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  let paragraphBuffer: string[] = [];

  const pushParagraph = (buf: string[]) => {
    if (buf.length === 0) return;
    const joined = buf.join(" ");
    out.push(
      <p key={key++} className="whitespace-pre-wrap">
        {parseInline(joined)}
      </p>,
    );
  };

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed.startsWith("$$")) {
      pushParagraph(paragraphBuffer);
      paragraphBuffer = [];
      if (trimmed.length > 2 && trimmed.endsWith("$$")) {
        const expr = trimmed.slice(2, -2);
        out.push(<MathBlock key={key++} expression={expr} />);
        i++;
        continue;
      }
      const buf: string[] = [trimmed.slice(2)];
      i++;
      while (i < lines.length && !lines[i].trim().endsWith("$$")) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        buf.push(lines[i].trim().slice(0, -2));
        i++;
      }
      out.push(<MathBlock key={key++} expression={buf.join("\n").trim()} />);
      continue;
    }

    if (/^[-•]\s+/.test(trimmed)) {
      pushParagraph(paragraphBuffer);
      paragraphBuffer = [];
      const items: string[] = [];
      while (i < lines.length && /^[-•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-•]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={key++} className="space-y-1 pl-1">
          {items.map((it, idx) => (
            <li key={idx} className="flex gap-2">
              <span className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#818cf8]" />
              <span>{parseInline(it)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      pushParagraph(paragraphBuffer);
      paragraphBuffer = [];
      const items: { num: string; text: string }[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const m = lines[i].trim().match(/^(\d+)\.\s+(.*)$/);
        if (m) items.push({ num: m[1], text: m[2] });
        i++;
      }
      out.push(
        <ol key={key++} className="space-y-1 pl-1">
          {items.map((it, idx) => (
            <li key={idx} className="flex gap-2">
              <span className="shrink-0 font-semibold text-[#818cf8]">
                {it.num}.
              </span>
              <span>{parseInline(it.text)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      pushParagraph(paragraphBuffer);
      paragraphBuffer = [];
      out.push(
        <hr key={key++} className="my-3 border-[rgba(255,255,255,0.06)]" />,
      );
      i++;
      continue;
    }

    if (trimmed === "") {
      pushParagraph(paragraphBuffer);
      paragraphBuffer = [];
      i++;
      continue;
    }

    paragraphBuffer.push(trimmed);
    i++;
  }

  pushParagraph(paragraphBuffer);
  return out;
}

function parseInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let k = 0;
  const re = /(\$[^$\n]+\$)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(`[^`\n]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("$")) {
      try {
        const html = katex.renderToString(token.slice(1, -1), {
          throwOnError: false,
        });
        out.push(
          <span key={k++} dangerouslySetInnerHTML={{ __html: html }} />,
        );
      } catch {
        out.push(token);
      }
    } else if (token.startsWith("**")) {
      out.push(
        <strong key={k++} className="font-semibold text-[#c7d2fe]">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*")) {
      out.push(
        <em key={k++} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (token.startsWith("`")) {
      out.push(
        <code
          key={k++}
          className="rounded bg-[rgba(255,255,255,0.08)] px-1.5 py-0.5 text-xs font-mono text-[#818cf8]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

function MathBlock({ expression }: { expression: string }) {
  try {
    const html = katex.renderToString(expression, {
      throwOnError: false,
      displayMode: true,
    });
    return (
      <div
        className="my-2 overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return <pre className="my-2 text-sm text-red-400">{expression}</pre>;
  }
}
