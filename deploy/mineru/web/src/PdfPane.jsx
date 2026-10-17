import React, { useState, useEffect, useRef, useMemo } from "react";
import * as pdfjs from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { LoaderCircle, FileWarning } from "lucide-react";
import { label } from "./render";
pdfjs.GlobalWorkerOptions.workerSrc = worker;
export default function PdfPane({
  document,
  blocks,
  selected,
  hovered,
  onSelect,
  onHover,
  page,
  onPage,
  zoom,
  showFrames,
  sync,
  onProgress,
}) {
  const holder = useRef(null),
    [pdf, setPdf] = useState(null),
    [width, setWidth] = useState(600),
    [error, setError] = useState(""),
    [firstSize, setFirstSize] = useState([595, 842]);
  const lock = useRef(false),
    selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    setPdf(null);
    setError("");
    const task = pdfjs.getDocument({
      url: "/api/documents/" + document.id + "/original",
      withCredentials: true,
    });
    let active = true;
    task.promise
      .then(async (p) => {
        if (!active) {
          p.destroy();
          return;
        }
        const first = await p.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        setFirstSize([vp.width, vp.height]);
        setPdf(p);
      })
      .catch((e) => active && setError("原文件加载失败：" + e.message));
    return () => {
      active = false;
      task.destroy().catch(() => {});
    };
  }, [document.id]);
  useEffect(() => {
    const observer = new ResizeObserver((es) =>
      setWidth(es[0].contentRect.width),
    );
    if (holder.current) observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!holder.current || !pdf) return;
    const target = holder.current.querySelector(
      '[data-source-page="' + page + '"]',
    );
    if (target) {
      lock.current = true;
      target.scrollIntoView({ block: "start", behavior: "instant" });
      setTimeout(() => {
        lock.current = false;
      }, 150);
    }
  }, [page, pdf]);
  useEffect(() => {
    if (!selected || !holder.current) return;
    const target = holder.current.querySelector(
      '[data-source-block="' + CSS.escape(selected) + '"]',
    );
    if (target) {
      lock.current = true;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(() => {
        lock.current = false;
      }, 600);
    }
  }, [selected]);
  const pageBlocks = useMemo(() => {
    const m = new Map();
    blocks.forEach((b) => {
      if (!m.has(b.page)) m.set(b.page, []);
      m.get(b.page).push(b);
    });
    return m;
  }, [blocks]);
  const mergeGroups = useMemo(() => {
    const m = new Map();
    blocks
      .filter((b) => b.bbox)
      .forEach((b) => {
        const id = b.logical_id || b.id;
        if (!m.has(id)) m.set(id, []);
        m.get(id).push(b);
      });
    return [...m.entries()]
      .filter(([, bs]) => new Set(bs.map((b) => b.page)).size > 1)
      .map(([id, bs]) => ({
        id,
        blocks: bs.sort(
          (a, b) => a.page - b.page || (a.index || 0) - (b.index || 0),
        ),
        first: Math.min(...bs.map((b) => b.page)),
        last: Math.max(...bs.map((b) => b.page)),
      }));
  }, [blocks]);
  const contentWidth = Math.max(180, ((width - 56) * zoom) / 100);
  const handleScroll = () => {
    if (lock.current || !holder.current) return;
    const area = holder.current,
      items = [...area.querySelectorAll("[data-source-page]")],
      rect = area.getBoundingClientRect();
    let best = null,
      dist = Infinity;
    for (const el of items) {
      const d = Math.abs(el.getBoundingClientRect().top - rect.top - 20);
      if (d < dist) {
        best = el;
        dist = d;
      }
    }
    if (best) onPage(Number(best.dataset.sourcePage), true);
    if (sync)
      onProgress?.(
        area.scrollTop / Math.max(1, area.scrollHeight - area.clientHeight),
      );
  };
  return (
    <div className="pdf-scroll" ref={holder} onScroll={handleScroll}>
      {error ? (
        <div className="pane-error">
          <FileWarning size={34} />
          <p>{error}</p>
          <a
            href={"/api/documents/" + document.id + "/original"}
            target="_blank"
            rel="noreferrer"
          >
            打开原文件
          </a>
        </div>
      ) : !pdf ? (
        <div className="loading">
          <LoaderCircle className="spin" />
          正在加载原文件…
        </div>
      ) : (
        Array.from({ length: pdf.numPages }, (_, n) => (
          <PdfPage
            key={n}
            pdf={pdf}
            index={n}
            width={contentWidth}
            fallback={firstSize}
            blocks={pageBlocks.get(n) || []}
            selected={selected}
            hovered={hovered}
            onSelect={onSelect}
            onHover={onHover}
            showFrames={showFrames}
            mergeGroups={mergeGroups}
            root={holder}
          />
        ))
      )}
    </div>
  );
}
function PdfPage({
  pdf,
  index,
  width,
  fallback,
  blocks,
  selected,
  hovered,
  onSelect,
  onHover,
  showFrames,
  mergeGroups,
  root,
}) {
  const el = useRef(null),
    canvas = useRef(null),
    [near, setNear] = useState(false),
    [size, setSize] = useState(fallback),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (es) => {
        setNear(es.some((e) => e.isIntersecting));
      },
      { root: root.current, rootMargin: "800px" },
    );
    if (el.current) observer.observe(el.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!near) {
      setReady(false);
      if (canvas.current) {
        canvas.current.width = 0;
        canvas.current.height = 0;
      }
      return;
    }
    let alive = true,
      render;
    setReady(false);
    pdf
      .getPage(index + 1)
      .then((p) => {
        if (!alive) return;
        const base = p.getViewport({ scale: 1 });
        setSize([base.width, base.height]);
        const ratio = Math.min(window.devicePixelRatio || 1, 2),
          vp = p.getViewport({ scale: width / base.width });
        const c = canvas.current;
        if (!c) return;
        c.width = Math.floor(vp.width * ratio);
        c.height = Math.floor(vp.height * ratio);
        render = p.render({
          canvasContext: c.getContext("2d"),
          viewport: vp,
          transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
        });
        return render.promise;
      })
      .then(() => alive && setReady(true))
      .catch((e) => {
        if (alive && e.name !== "RenderingCancelledException")
          setError(e.message);
      });
    return () => {
      alive = false;
      render?.cancel();
    };
  }, [pdf, index, width, near]);
  const logical = (b) => b.logical_id || b.id;
  const grouped = useMemo(() => {
    const groups = new Map();
    blocks
      .filter((b) => b.bbox)
      .forEach((b) => {
        const id = logical(b);
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(b);
      });
    return [...groups.entries()].filter(([, bs]) => bs.length > 1);
  }, [blocks]);
  return (
    <div
      className="pdf-page"
      ref={el}
      data-source-page={index}
      style={{ width, height: (width * size[1]) / size[0] }}
    >
      <canvas
        ref={canvas}
        style={{ width: "100%", height: "100%", opacity: ready ? 1 : 0 }}
      />
      {!ready && (
        <div className="page-placeholder">
          {error || "第 " + (index + 1) + " 页"}
        </div>
      )}
      {showFrames && ready && (
        <div className="annotations">
          {blocks
            .filter(
              (b) => b.bbox && b.page_width && b.page_height && !b.discarded,
            )
            .map((b) => {
              const id = logical(b),
                [x0, y0, x1, y1] = b.bbox;
              return (
                <button
                  key={b.id}
                  data-source-block={id}
                  aria-label={"第" + (index + 1) + "页 " + label(b.type)}
                  className={
                    "annotation " +
                    (selected === id ? "active " : "") +
                    (hovered === id ? "hover " : "") +
                    b.type
                  }
                  style={{
                    left: (x0 / b.page_width) * 100 + "%",
                    top: (y0 / b.page_height) * 100 + "%",
                    width: ((x1 - x0) / b.page_width) * 100 + "%",
                    height: ((y1 - y0) / b.page_height) * 100 + "%",
                  }}
                  onMouseEnter={() => onHover(id)}
                  onMouseLeave={() => onHover("")}
                  onClick={() => onSelect(id, b.page)}
                >
                  <span>{label(b.type)}</span>
                </button>
              );
            })}
          <svg
            className="merge-lines"
            viewBox={"0 0 " + size.join(" ")}
            preserveAspectRatio="none"
          >
            {grouped.map(([id, bs]) => {
              const points = bs.map((b) => {
                const scaleX = size[0] / b.page_width,
                  scaleY = size[1] / b.page_height;
                return [b.bbox[2] * scaleX, b.bbox[3] * scaleY];
              });
              return (
                <polyline
                  key={id}
                  points={points.map((p) => p.join(",")).join(" ")}
                  className={selected === id ? "active" : ""}
                />
              );
            })}
            {mergeGroups
              .filter((g) => index >= g.first && index <= g.last)
              .map((g) => {
                const here = g.blocks.filter((b) => b.page === index),
                  first = here[0],
                  last = here[here.length - 1],
                  x = size[0] + 9,
                  top = first
                    ? (first.bbox[1] / first.page_height) * size[1]
                    : 0,
                  bottom = last
                    ? (last.bbox[3] / last.page_height) * size[1]
                    : size[1],
                  startX = last
                    ? (last.bbox[2] / last.page_width) * size[0]
                    : x,
                  endX = first
                    ? (first.bbox[2] / first.page_width) * size[0]
                    : x,
                  points =
                    index === g.first
                      ? [
                          [startX, bottom],
                          [x, bottom],
                          [x, size[1] + 16],
                        ]
                      : index === g.last
                        ? [
                            [x, -16],
                            [x, top],
                            [endX, top],
                          ]
                        : [
                            [x, -16],
                            [x, size[1] + 16],
                          ];
                return (
                  <g key={"cross-" + g.id}>
                    <polyline
                      points={points.map((p) => p.join(",")).join(" ")}
                      className={selected === g.id ? "active" : ""}
                    />
                    {index === g.first && (
                      <>
                        <rect
                          x={x - 22}
                          y={bottom + 10}
                          width="24"
                          height="13"
                          rx="2"
                          fill="#2563eb"
                        />
                        <text
                          x={x - 20}
                          y={bottom + 19}
                          fontSize="8"
                          fill="white"
                        >
                          合并
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
          </svg>
        </div>
      )}
      <span className="page-number">{index + 1}</span>
    </div>
  );
}
