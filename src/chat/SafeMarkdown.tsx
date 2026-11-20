import { Fragment, useState } from "react";
import { Button } from "../components/ui/button";
import { safeLink } from "./model";
interface Mention {
  username: string;
  clientId: string;
}
export function SafeMarkdown({
  content,
  mentions = [],
  onMention,
}: {
  content: string;
  mentions?: Mention[];
  onMention?: (id: string) => void;
}) {
  function inline(text: string) {
    return text
      .split(
        /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|\[[^\]\n]{1,120}\]\([^\s)]{1,500}\)|https?:\/\/[^\s<>]+|@[a-zA-Z][a-zA-Z0-9_]{2,23})/g,
      )
      .map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`"))
          return (
            <code key={i} className="chat-inline-code">
              {part.slice(1, -1)}
            </code>
          );
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("~~") && part.endsWith("~~"))
          return <del key={i}>{part.slice(2, -2)}</del>;
        if (part.startsWith("*") && part.endsWith("*"))
          return <em key={i}>{part.slice(1, -1)}</em>;
        const md = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        const url = safeLink(md?.[2] ?? part);
        if (url)
          return (
            <a
              key={i}
              href={url.href}
              target="_blank"
              rel="noopener noreferrer"
              className="chat-link"
            >
              {md?.[1] ?? part}
            </a>
          );
        const mention = mentions.find(
          (m) => `@${m.username.toLowerCase()}` === part.toLowerCase(),
        );
        if (mention)
          return (
            <button
              type="button"
              key={i}
              className="chat-mention"
              onClick={() => onMention?.(mention.clientId)}
            >
              {part}
            </button>
          );
        return <Fragment key={i}>{part}</Fragment>;
      });
  }
  return (
    <div className="chat-markdown">
      {content
        .split(/(```[\s\S]*?```)/g)
        .map((block, i) =>
          block.startsWith("```") ? (
            <CodeBlock
              key={i}
              source={block.slice(3, -3).replace(/^[a-zA-Z0-9_-]+\n/, "")}
            />
          ) : (
            <Fragment key={i}>
              {block
                .split("\n")
                .map((line, j) =>
                  line.startsWith("> ") ? (
                    <blockquote key={j}>{inline(line.slice(2))}</blockquote>
                  ) : (
                    <div key={j}>{line ? inline(line) : "\u00a0"}</div>
                  ),
                )}
            </Fragment>
          ),
        )}
    </div>
  );
}
function CodeBlock({ source }: { source: string }) {
  const [status, setStatus] = useState("Copiar código");
  return (
    <div className="chat-code">
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(source);
            setStatus("Copiado");
          } catch {
            setStatus("Não foi possível copiar");
          }
        }}
      >
        {status}
      </Button>
      <pre>
        <code>{source}</code>
      </pre>
    </div>
  );
}
export function LinkPreview({ content }: { content: string }) {
  const match = content.match(/https?:\/\/[^\s<>)]{1,500}/);
  const url = match && safeLink(match[0]);
  if (!url) return null;
  return (
    <a
      className="chat-link-preview"
      href={url.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span>{url.hostname}</span>
      <span>{url.pathname.slice(0, 100) || "Abrir link"}</span>
      <small>Link externo · prévia local, sem carregar conteúdo do site</small>
    </a>
  );
}
