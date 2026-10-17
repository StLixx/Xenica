/* MPL-2.0. Penpot canvas HTML embed extension, Xenica #81. */
const MAX_HTML = 262144;
const MAX_STATE = 16384;
const sample = `<style>
*{box-sizing:border-box}body{margin:0;padding:28px;background:#16181d;color:#eceef4;font:15px system-ui}h1{font-size:25px;margin:12px 0}p{color:#a7afbf;line-height:1.6}.tag{color:#8fe1c0;font-size:12px;letter-spacing:2px}label{display:block;margin:22px 0 8px}input,button{font:inherit;border-radius:9px;border:1px solid #424958;padding:12px;background:#222630;color:inherit}input{width:100%}button{cursor:pointer;background:#a9efd1;color:#12271e;border:0;margin:20px 8px 8px 0}.count{font-size:32px;font-weight:700}.tip{font-size:12px}</style>
<div class="tag">HTML · 画板内交互</div><h1>在设计里，直接试一试</h1><p>输入一条想法，再点几次按钮。返回画布后移动或调整大小；保存完成后刷新，继续刚才的状态。</p>
<label for="idea">我的想法</label><input id="idea" placeholder="例如：让节点拖动更顺手"><button id="add">点击 +1</button><button id="reset">重置</button><span class="count" id="count">0</span><p class="tip">双击内容进入交互，按 Esc 返回画布。块的位置、HTML 和示例状态随文件保存。</p>
<script>
const state = Object.assign({count:0,idea:''}, window.penpotEmbed.state);
const idea=document.getElementById('idea'), count=document.getElementById('count');
function paint(){idea.value=state.idea;count.textContent=state.count}paint();
idea.addEventListener('input',()=>{state.idea=idea.value;window.penpotEmbed.save(state)});
document.getElementById('add').onclick=()=>{state.count++;paint();window.penpotEmbed.save(state)};
document.getElementById('reset').onclick=()=>{state.count=0;state.idea='';paint();window.penpotEmbed.save(state)};
<\/script>`.replace("<\\/script>", "</script>");

function documentFor(html, rawState, zoom = 1) {
  let state = {};
  try {
    state = JSON.parse(rawState || "{}");
  } catch {
    /* recover invalid old state */
  }
  const encoded = JSON.stringify(state).replaceAll("<", "\\u003c");
  const bootstrap = `window.penpotEmbed={state:${encoded},save(state){parent.postMessage({type:'xenica-html-state',state},'*')}};
window.addEventListener('keydown',e=>{if(e.key==='Escape')parent.postMessage({type:'xenica-html-exit'},'*')});`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;min-height:100%;box-sizing:border-box}body{font-family:system-ui}</style><script>${bootstrap}<\/script></head><body>${html}</body></html>`.replace(
    "<\\/script>",
    "</script>",
  );
}

// Penpot converts a rectangle to a path on native double-click. Paths keep
// their corner points but intentionally omit x/y/width/height.
function geometryFor(shape) {
  const points =
    shape.points?.length === 4 &&
    shape.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      ? shape.points
      : null;
  const side = (i) =>
    points
      ? Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y)
      : 1;
  return {
    ...shape,
    x: Number.isFinite(shape.x) ? shape.x : points?.[0].x || 0,
    y: Number.isFinite(shape.y) ? shape.y : points?.[0].y || 0,
    width:
      Number.isFinite(shape.width) && shape.width > 0
        ? shape.width
        : Math.max(1, side(1)),
    height:
      Number.isFinite(shape.height) && shape.height > 0
        ? shape.height
        : Math.max(1, side(3)),
    points,
  };
}

function matrixFor(shape, vbox, zoom) {
  shape = geometryFor(shape);
  const w = Math.max(1, shape.width),
    h = Math.max(1, shape.height);
  const p = shape.points;
  if (p?.length === 4) {
    return [
      ((p[1].x - p[0].x) / w) * zoom,
      ((p[1].y - p[0].y) / w) * zoom,
      ((p[3].x - p[0].x) / h) * zoom,
      ((p[3].y - p[0].y) / h) * zoom,
      (p[0].x - vbox.x) * zoom,
      (p[0].y - vbox.y) * zoom,
    ];
  }
  return [
    zoom,
    0,
    0,
    zoom,
    (shape.x - vbox.x) * zoom,
    (shape.y - vbox.y) * zoom,
  ];
}

function polygonArea(points) {
  return points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
}
function pointInPolygon(point, polygon) {
  if (polygon.length < 3) return false;
  const sign = polygonArea(polygon) >= 0 ? 1 : -1;
  return polygon.every((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return (
      sign * ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) >=
      -0.01
    );
  });
}
function intersectPolygons(subject, clip) {
  const sign = polygonArea(clip) >= 0 ? 1 : -1;
  for (let i = 0; i < clip.length && subject.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length],
      input = subject;
    subject = [];
    const cross = (p) =>
      sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    let previous = input[input.length - 1],
      pc = cross(previous);
    for (const current of input) {
      const cc = cross(current);
      if (cc >= 0 !== pc >= 0) {
        const t = pc / (pc - cc);
        subject.push({
          x: previous.x + t * (current.x - previous.x),
          y: previous.y + t * (current.y - previous.y),
        });
      }
      if (cc >= 0) subject.push(current);
      previous = current;
      pc = cc;
    }
  }
  return subject;
}
function clipPolygonFor(clips, vbox, zoom) {
  const polygons = (clips || [])
    .map((c) =>
      c.points?.map((p) => ({
        x: (p.x - vbox.x) * zoom,
        y: (p.y - vbox.y) * zoom,
      })),
    )
    .filter((p) => p?.length === 4);
  return polygons.length
    ? polygons.slice(1).reduce(intersectPolygons, polygons[0])
    : null;
}

class HtmlEmbedLayer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.cards = new Map();
    this.context = null;
    this.active = null;
    this.shadowRoot.innerHTML = `<style>
:host{position:absolute;inset:0;overflow:clip;pointer-events:none;z-index:2;font:13px system-ui;color:#eceef4}
*{box-sizing:border-box}.bar{display:none!important;position:absolute;bottom:var(--embed-bottom,16px);left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:8px;background:#222630;border:1px solid #454b59;border-radius:12px;box-shadow:0 4px 24px #0005;pointer-events:auto;white-space:nowrap;max-width:calc(100% - 24px)}button{font:inherit;color:inherit;background:#343a47;border:1px solid #50596a;border-radius:7px;padding:8px 12px;cursor:pointer}button:hover{background:#464e60}button:focus-visible,textarea:focus-visible{outline:2px solid #a9efd1;outline-offset:2px}.primary{background:#a9efd1;color:#14271e;border-color:#a9efd1}.primary:hover{background:#c3f5e0}.hint{color:#bcc4d3}.clip{position:absolute;inset:0;pointer-events:none}.card{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden;border:0;background:#16181d;pointer-events:none}.card[data-active=true]{outline:2px solid #a9efd1}.select-embed{position:absolute;right:8px;top:8px;pointer-events:auto;font-size:11px;padding:5px 8px;background:#293b36;color:#b8f4d8;border-color:#698d7c}.card[data-active=true] .select-embed{display:none}.card iframe{width:100%;height:100%;border:0;display:block;pointer-events:none}.card[data-active=true] iframe{pointer-events:auto}.dialog{position:absolute;inset:16px;margin:auto;max-width:780px;max-height:650px;background:#20232c;border:1px solid #596273;border-radius:14px;padding:22px;display:flex;flex-direction:column;gap:12px;pointer-events:auto;box-shadow:0 12px 60px #0009}.dialog h2{margin:0;font-size:20px}.dialog p{color:#bdc5d4;margin:0;line-height:1.6}.dialog textarea{width:100%;flex:1;min-height:150px;resize:none;background:#11141a;color:#e9edf5;border:1px solid #50596a;border-radius:8px;padding:14px;font:13px/1.6 monospace}.actions{display:flex;gap:8px;justify-content:flex-end}.error{color:#ffb0b0;min-height:18px}.shade{position:absolute;inset:0;background:#0006;pointer-events:auto}.badge{font-size:11px;color:#a9efd1}@media(max-width:600px){.hint{display:none}.bar{gap:4px;padding:6px}button{padding:8px}.dialog{inset:8px;padding:14px}}
:host([data-compact]) .bar{bottom:max(104px,var(--embed-bottom,16px))}:host([data-compact]) .hint{display:none}
</style><div class="cards"></div><div class="bar" role="toolbar" aria-label="HTML 嵌入工具"><span class="badge">HTML EMBED</span></div>`;
    this.onCommand = this.onCommand.bind(this);
    this.onMessage = this.onMessage.bind(this);
    this.onDoubleClick = this.onDoubleClick.bind(this);
    this.onNativePointerDown = this.onNativePointerDown.bind(this);
    const bar = this.shadowRoot.querySelector(".bar");
    for (const type of ["pointerdown", "pointerup", "wheel"])
      bar.addEventListener(type, (e) => e.stopPropagation());
  }
  connectedCallback() {
    this.tabIndex = -1;
    this.viewport = this.closest('[data-testid="viewport"]');
    this.viewport?.addEventListener("dblclick", this.onDoubleClick, true);
    this.viewport?.addEventListener(
      "pointerdown",
      this.onNativePointerDown,
      true,
    );
    window.addEventListener("message", this.onMessage);
    window.addEventListener("xenica-html-command", this.onCommand);
    this.sizeObserver = new ResizeObserver(() => {
      this.toggleAttribute("data-compact", this.clientWidth < 620);
    });
    this.sizeObserver.observe(this);
  }
  disconnectedCallback() {
    this.sizeObserver?.disconnect();
    this.viewport?.removeEventListener("dblclick", this.onDoubleClick, true);
    this.viewport?.removeEventListener(
      "pointerdown",
      this.onNativePointerDown,
      true,
    );
    window.removeEventListener("message", this.onMessage);
    window.removeEventListener("xenica-html-command", this.onCommand);
  }
  button(label, action, primary = false) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (primary) b.className = "primary";
    b.onclick = (e) => {
      e.stopPropagation();
      action();
    };
    return b;
  }
  onNativePointerDown(event) {
    if (!this.active || this.context.viewer || event.button !== 0) return;
    if (
      event
        .composedPath()
        .some(
          (el) =>
            el?.classList?.contains("bar") || el?.classList?.contains("dialog"),
        )
    )
      return;
    // Pointer events inside the iframe stay in its document. A pointerdown
    // reaching the native canvas starts a canvas gesture, so release the iframe.
    this.active = null;
    this.updateActive();
    this.updateBar();
  }
  onDoubleClick(event) {
    if (!this.context || this.context.viewer || event.button !== 0) return;
    if (
      event
        .composedPath()
        .some(
          (el) =>
            el?.classList?.contains("bar") || el?.classList?.contains("dialog"),
        )
    )
      return;
    const host = this.getBoundingClientRect();
    for (const [id, card] of [...this.cards].reverse()) {
      if (
        card.visiblePolygon &&
        !pointInPolygon(
          { x: event.clientX - host.x, y: event.clientY - host.y },
          card.visiblePolygon,
        )
      )
        continue;
      const point = new DOMPoint(
        event.clientX - host.x,
        event.clientY - host.y,
      ).matrixTransform(new DOMMatrix(card.element.style.transform).inverse());
      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x > card.element.offsetWidth ||
        point.y > card.element.offsetHeight
      )
        continue;
      event.preventDefault();
      event.stopPropagation();
      this.context.select?.(id);
      this.active = id;
      this.updateActive();
      this.updateBar();
      return;
    }
  }
  onMessage(event) {
    const found = [...this.cards].find(
      ([, c]) => c.iframe.contentWindow === event.source,
    );
    if (!found || !event.data || typeof event.data !== "object") return;
    const [id] = found;
    if (event.data.type === "xenica-html-exit") {
      this.active = null;
      this.updateBar();
      this.updateActive();
      this.focus({ preventScroll: true });
      return;
    }
    if (event.data.type !== "xenica-html-state" || this.context.readOnly)
      return;
    let value;
    try {
      value = JSON.stringify(event.data.state);
    } catch {
      return;
    }
    if (typeof value !== "string" || value.length > MAX_STATE) return;
    if (!this.context.shapes.some((s) => s.id === id)) return;
    // The native store batches persistence and compares against current objects.
    // Do not deduplicate against the last rendered snapshot: A -> B -> A must save A.
    this.context.save(id, "state", value);
  }
  setContext(context) {
    context.shapes = context.shapes.map(geometryFor);
    if (
      this.context &&
      (this.context.fileId !== context.fileId ||
        this.context.pageId !== context.pageId)
    ) {
      this.active = null;
      for (const c of this.cards.values()) c.root.remove();
      this.cards.clear();
    }
    this.context = context;
    this.style.setProperty(
      "--embed-bottom",
      `${16 + (Number(context.paletteSize) || 0)}px`,
    );
    if (
      this.active &&
      !context.viewer &&
      !context.selected?.includes(this.active)
    )
      this.active = null;
    const ids = new Set(context.shapes.map((s) => s.id));
    for (const [id, c] of this.cards)
      if (!ids.has(id)) {
        c.root.remove();
        this.cards.delete(id);
        if (this.active === id) this.active = null;
      }
    for (const shape of context.shapes) {
      let c = this.cards.get(shape.id);
      if (!c) {
        const element = document.createElement("div");
        element.className = "card";
        element.dataset.shapeId = shape.id;
        const iframe = document.createElement("iframe");
        iframe.title = "HTML 交互块";
        iframe.setAttribute("sandbox", "allow-scripts");
        iframe.referrerPolicy = "no-referrer";
        element.append(iframe);
        const root = document.createElement("div");
        root.className = "clip";
        root.append(element);
        this.shadowRoot.querySelector(".cards").append(root);
        c = { root, element, iframe, html: null };
        this.cards.set(shape.id, c);
      }
      if (c.html !== shape.html) {
        c.html = shape.html;
        c.iframe.srcdoc = documentFor(
          shape.html,
          shape.state,
          context.zoom || 1,
        );
      }
      c.visiblePolygon = clipPolygonFor(
        shape.clips,
        context.vbox || { x: 0, y: 0 },
        context.zoom || 1,
      );
      c.root.style.clipPath = c.visiblePolygon
        ? c.visiblePolygon.length
          ? `polygon(${c.visiblePolygon.map((p) => `${p.x}px ${p.y}px`).join(",")})`
          : "polygon(0px 0px,0px 0px,0px 0px)"
        : "none";
      const m = matrixFor(
        shape,
        context.vbox || { x: 0, y: 0 },
        context.zoom || 1,
      );
      c.element.style.transform = `matrix(${m.join(",")})`;
      c.element.style.width = `${Math.max(1, shape.width)}px`;
      c.element.style.height = `${Math.max(1, shape.height)}px`;
    }
    if (this.active && !ids.has(this.active)) this.active = null;
    this.updateActive();
    this.updateBar();
  }
  updateActive() {
    for (const [id, c] of this.cards)
      c.element.dataset.active = String(
        this.context.viewer || id === this.active,
      );
  }
  updateBar() {
    this.shadowRoot.querySelector(".bar").style.display = "none";
    const active = this.active;
    if (this.lastStatus !== active) {
      this.lastStatus = active;
      window.dispatchEvent(
        new CustomEvent("xenica-html-status", { detail: { active } }),
      );
    }
  }
  onCommand(event) {
    if (!this.context || this.context.viewer) return;
    const { action, id } = event.detail || {};
    const chosen = this.context.shapes.find((s) => s.id === id);
    if (action === "exit") {
      this.active = null;
    } else if (action === "insert" && !this.context.readOnly) {
      this.edit(null, id || this.context.selected?.[0]);
    } else if (chosen) {
      if (action === "enter") {
        this.context.select?.(id);
        this.active = id;
      } else if (action === "edit" && !this.context.readOnly) this.edit(chosen);
      else if (action === "fit" && !this.context.readOnly)
        this.context.fit?.(id);
      else if (action === "select-board" && chosen.frameId) {
        this.active = null;
        this.context.select?.(chosen.frameId);
      }
    }
    this.updateActive();
    this.updateBar();
  }
  edit(shape, targetId) {
    this.active = null;
    this.updateActive();
    this.shadowRoot.querySelector(".shade")?.remove();
    const shade = document.createElement("div");
    shade.className = "shade";
    const dialog = document.createElement("section");
    dialog.className = "dialog";
    dialog.role = "dialog";
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", shape ? "编辑 HTML" : "插入 HTML");
    const heading = document.createElement("h2");
    heading.textContent = shape ? "编辑 HTML" : "把交互放进画板";
    const description = document.createElement("p");
    description.textContent =
      "粘贴自包含的 HTML、CSS 和 JavaScript。内容随文件保存，可直接在画板里操作。示例支持保存输入与点击状态。";
    const textarea = document.createElement("textarea");
    textarea.setAttribute("aria-label", "HTML 源码");
    textarea.spellcheck = false;
    textarea.value = shape?.html || sample;
    const error = document.createElement("div");
    error.className = "error";
    error.role = "alert";
    const actions = document.createElement("div");
    actions.className = "actions";
    const close = () => {
      shade.remove();
      this.updateBar();
    };
    actions.append(
      this.button("填入示例", () => {
        textarea.value = sample;
      }),
      this.button("取消", close),
      this.button(
        shape ? "保存 HTML" : "插入画板",
        () => {
          const html = textarea.value;
          if (!html.trim()) {
            error.textContent = "请输入 HTML 内容。";
            return;
          }
          if (html.length > MAX_HTML) {
            error.textContent = "HTML 超过 256 KiB，请缩小内容。";
            return;
          }
          if (shape) {
            this.context.save(shape.id, "state", "{}");
            this.context.save(shape.id, "html", html);
          } else this.context.create(html, targetId);
          close();
        },
        true,
      ),
    );
    dialog.append(heading, description, textarea, error, actions);
    shade.append(dialog);
    this.shadowRoot.append(shade);
    dialog.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") close();
    });
    for (const type of ["pointerdown", "pointerup", "wheel"])
      dialog.addEventListener(type, (e) => e.stopPropagation());
    textarea.focus();
  }
}
customElements.define("xenica-html-embed-layer", HtmlEmbedLayer);
export {
  documentFor,
  matrixFor,
  geometryFor,
  clipPolygonFor,
  pointInPolygon,
  sample,
  MAX_HTML,
  MAX_STATE,
};
