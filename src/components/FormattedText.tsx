"use client";

import { Fragment, ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export type FormattedTextVariant = "chat" | "prose";

interface FormattedTextProps {
  text: string;
  variant?: FormattedTextVariant;
  className?: string;
}

export function FormattedText({
  text,
  variant = "chat",
  className,
}: FormattedTextProps) {
  const blocks = parseBlocks(text, variant);
  return (
    <div className={className ?? "space-y-2 text-sm leading-relaxed"}>
      {blocks.map((b, i) => (
        <Fragment key={i}>{b}</Fragment>
      ))}
    </div>
  );
}

function styleFor(variant: FormattedTextVariant) {
  if (variant === "prose") {
    return {
      bullet: "bg-[#8B5CF6]",
      number: "text-[#8B5CF6]",
      strong: "font-semibold text-[#F4F4F5]",
      code: "rounded bg-[rgba(139,92,246,0.12)] px-1.5 py-0.5 text-xs font-mono text-[#A78BFA]",
      hr: "my-3 border-[rgba(139,92,246,0.15)]",
    };
  }
  return {
    bullet: "bg-[#818cf8]",
    number: "text-[#818cf8]",
    strong: "font-semibold text-[#c7d2fe]",
    code: "rounded bg-[rgba(255,255,255,0.08)] px-1.5 py-0.5 text-xs font-mono text-[#818cf8]",
    hr: "my-3 border-[rgba(255,255,255,0.06)]",
  };
}

function parseBlocks(text: string, variant: FormattedTextVariant): ReactNode[] {
  const s = styleFor(variant);
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
        {parseInline(joined, variant)}
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
              <span
                className={`mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full ${s.bullet}`}
              />
              <span>{parseInline(it, variant)}</span>
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
              <span className={`shrink-0 font-semibold ${s.number}`}>
                {it.num}.
              </span>
              <span>{parseInline(it.text, variant)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      pushParagraph(paragraphBuffer);
      paragraphBuffer = [];
      out.push(<hr key={key++} className={s.hr} />);
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

function parseInline(text: string, variant: FormattedTextVariant): ReactNode[] {
  const s = styleFor(variant);
  const out: ReactNode[] = [];
  let k = 0;
  // $$...$$ ПЕРВЫМ — иначе $...$ сожрёт внутренние доллары display-формулы.
  const re =
    /(\$\$[^$\n]+?\$\$)|(\$[^$\n]+?\$)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(`[^`\n]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("$$")) {
      try {
        const html = katex.renderToString(token.slice(2, -2), {
          throwOnError: false,
          displayMode: false,
        });
        out.push(
          <span key={k++} dangerouslySetInnerHTML={{ __html: html }} />,
        );
      } catch {
        out.push(token);
      }
    } else if (token.startsWith("$")) {
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
        <strong key={k++} className={s.strong}>
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
        <code key={k++} className={s.code}>
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
