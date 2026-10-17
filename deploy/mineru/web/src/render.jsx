import React from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import { resource } from "./api";
import "katex/dist/katex.min.css";
const math = (latex, displayMode = true) => {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return latex;
  }
};
export function rich(text = "") {
  const fragments = [];
  const encoded = text.replace(
    /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g,
    (_, block, inline) => {
      const n = fragments.length;
      fragments.push(math(block || inline, !!block));
      return "MINERUMATH" + n + "END";
    },
  );
  let html = marked.parse(encoded, { breaks: true, gfm: true });
  html = html.replace(
    /MINERUMATH(\d+)END/g,
    (_, n) => fragments[Number(n)] || "",
  );
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["math", "semantics", "annotation"],
    ADD_ATTR: ["target"],
  });
}
export const BlockContent = React.memo(function BlockContent({
  block,
  documentId,
}) {
  const type = block.type || "text",
    text = block.text || "";
  if (
    ["image", "image_body", "chart", "chart_body", "seal"].includes(type) &&
    block.image_path
  )
    return (
      <img
        className="result-image"
        loading="lazy"
        style={
          block.bbox && block.page_width
            ? {
                width:
                  Math.min(
                    1,
                    Math.max(
                      0.2,
                      (block.bbox[2] - block.bbox[0]) / block.page_width,
                    ),
                  ) *
                    100 +
                  "%",
              }
            : undefined
        }
        src={resource(documentId, block.image_path)}
        alt={block.description || "文档图片"}
      />
    );
  if (block.html)
    return (
      <div
        className="table-content"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.html) }}
      />
    );
  if (block.latex || ["equation", "interline_equation"].includes(type)) {
    const latex = block.latex || text.replace(/^\s*\$\$?|\$\$?\s*$/g, "");
    return (
      <div
        className="equation"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(math(latex)) }}
      />
    );
  }
  return (
    <div
      className={
        type.includes("caption") || type.includes("footnote")
          ? "caption"
          : "prose"
      }
      dangerouslySetInnerHTML={{
        __html: rich(
          type === "title" && !/^#{1,6}\s/.test(text) ? "## " + text : text,
        ),
      }}
    />
  );
});
export const label = (t) =>
  ({
    text: "文本",
    title: "标题",
    equation: "公式",
    interline_equation: "公式",
    image: "图片",
    image_body: "图片",
    table: "表格",
    table_body: "表格",
    image_caption: "图片标题",
    table_caption: "表格标题",
    image_footnote: "图片脚注",
    table_footnote: "表格脚注",
    code: "代码",
  })[t] ||
  t ||
  "块";
