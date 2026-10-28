import type { ReactNode } from "react";
import type { Inline } from "@/lib/rich-text/types";

/** React elements only: text goes through React's escaping, nothing is ever injected as HTML. */
export function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return node.text;
      case "break":
        return <br key={index} />;
      case "bold":
        return (
          <strong key={index} className="font-semibold">
            {renderInline(node.children)}
          </strong>
        );
      case "italic":
        return <em key={index}>{renderInline(node.children)}</em>;
      case "code":
        return (
          <code key={index} className="rounded-sm border border-border px-1 font-mono text-[0.9em]">
            {node.text}
          </code>
        );
    }
  });
}
