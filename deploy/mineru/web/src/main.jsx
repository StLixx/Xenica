import React, { useState, useEffect, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  Plus,
  FileText,
  Star,
  Settings,
  FolderOpen,
  Download,
  Copy,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  PanelLeftClose,
  PanelLeftOpen,
  ScanLine,
  Link,
  Unlink,
  X,
  Upload,
  LoaderCircle,
  LogOut,
  Search,
  Check,
  AlertCircle,
  Files,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import { api, post, bytes, statusText, isDone, resource } from "./api";
import { BlockContent, label, rich } from "./render";
import PdfPane from "./PdfPane";
import "./style.css";
const defaults = {
  model: "vlm",
  ocr: false,
  formula: true,
  table: true,
  language: "ch",
};
function IconButton({ title, children, ...props }) {
  return (
    <button className="icon-button" aria-label={title} title={title} {...props}>
      {children}
    </button>
  );
}
function App() {
  const [user, setUser] = useState(null),
    [boot, setBoot] = useState(true),
    [docs, setDocs] = useState([]),
    [id, setId] = useState(location.hash.slice(1)),
    [doc, setDoc] = useState(null),
    [view, setView] = useState("preview"),
    [upload, setUpload] = useState(false),
    [settings, setSettings] = useState(false),
    [prefs, setPrefs] = useState(() => {
      try {
        return {
          ...defaults,
          ...JSON.parse(localStorage.getItem("mineru-settings")),
        };
      } catch {
        return defaults;
      }
    }),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [sidebar, setSidebar] = useState(innerWidth > 760),
    [favorites, setFavorites] = useState(null);
  const refresh = async () => {
    try {
      const list = await api("/documents");
      setDocs(Array.isArray(list) ? list : list.documents || []);
    } catch (e) {
      if (e.status === 401) setUser(null);
      else setError(e.message);
    }
  };
  useEffect(() => {
    const mq = matchMedia("(max-width:760px)");
    const change = () => {
      if (mq.matches) setSidebar(false);
    };
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    api("/me")
      .then(setUser)
      .catch(() => {})
      .finally(() => setBoot(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [user]);
  useEffect(() => {
    if (!user || !id) {
      setDoc(null);
      return;
    }
    let alive = true;
    let terminal = false;
    const load = () =>
      api("/documents/" + encodeURIComponent(id))
        .then((d) => {
          terminal = isDone(d.status) || d.status === "failed";
          if (alive) setDoc(d);
        })
        .catch((e) => alive && setError(e.message));
    load();
    const timer = setInterval(() => {
      if (!terminal) load();
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user, id]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    localStorage.setItem("mineru-settings", JSON.stringify(prefs));
  }, [prefs]);
  const choose = (d) => {
    if (d.anchor)
      sessionStorage.setItem("mineru-jump-" + d.id, JSON.stringify(d.anchor));
    setId(d.id);
    location.hash = d.id;
    setView("preview");
    if (d.id !== id) setDoc(null);
    else if (d.anchor)
      setDoc((current) => ({
        ...current,
        _jumpAt: Date.now(),
        reading: {
          ...current.reading,
          page: d.anchor.page,
          selected_id: d.anchor.id,
        },
      }));
    if (innerWidth < 760) setSidebar(false);
  };
  const notify = (e) => setToast(typeof e === "string" ? e : e.message);
  const save = async (data) => {
    if (data.reading)
      data = {
        ...data,
        reading: { ...data.reading, zoom: data.reading.zoom / 100 },
      };
    try {
      const updated = await api("/documents/" + id, {
        method: "PATCH",
        keepalive: true,
        body: JSON.stringify(data),
      });
      setDoc((d) => ({ ...d, ...data, ...updated }));
      refresh();
    } catch (e) {
      notify(e);
    }
  };
  const loadFavorites = async () => {
    try {
      setFavorites(await api("/favorites"));
      setView("favorites");
      if (innerWidth < 760) setSidebar(false);
    } catch (e) {
      notify(e);
    }
  };
  if (boot)
    return (
      <div className="full-loading">
        <LoaderCircle className="spin" />
        正在连接…
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;
  return (
    <div className={"app " + (!sidebar ? "sidebar-hidden" : "")}>
      <aside className="sidebar">
        <div className="brand">
          <img src="/brand/mineru.svg" alt="MinerU" />
        </div>
        <button className="new-button" onClick={() => setUpload(true)}>
          <Plus />
          新解析
        </button>
        <nav>
          <button
            className={view === "tasks" ? "current" : ""}
            onClick={() => {
              setView("tasks");
              if (innerWidth < 760) setSidebar(false);
            }}
          >
            <FileText />
            任务管理
          </button>
          <button
            className={view === "favorites" ? "current" : ""}
            onClick={loadFavorites}
          >
            <Star />
            我的收藏
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="file-list">
          {docs.map((d) => (
            <button
              key={d.id}
              className={
                "file-item " +
                (d.id === id && view === "preview" ? "selected" : "")
              }
              onClick={() => choose(d)}
            >
              <span className="file-icon">
                <FileText size={20} />
              </span>
              <span className="file-info">
                <strong>{d.name}</strong>
                <small className={d.status === "failed" ? "failed" : ""}>
                  {d.status === "failed" ? (
                    <>
                      <AlertCircle size={12} />
                      解析失败
                    </>
                  ) : !isDone(d.status) ? (
                    <>
                      <LoaderCircle size={12} className="spin" />
                      {statusText(d.status)}
                    </>
                  ) : (
                    bytes(d.size)
                  )}
                </small>
              </span>
            </button>
          ))}
          {!docs.length && (
            <p className="list-empty">解析后的文档会保存在这里</p>
          )}
        </div>
        <div className="sidebar-footer">
          <span>MinerU Web</span>
          <IconButton title="系统设置" onClick={() => setSettings(true)}>
            <Settings size={21} />
          </IconButton>
          <IconButton
            title="退出登录"
            onClick={async () => {
              await post("/logout", {});
              setUser(null);
              setDocs([]);
              setDoc(null);
            }}
          >
            <LogOut size={20} />
          </IconButton>
        </div>
      </aside>
      <main>
        <div className="mobile-top">
          <IconButton
            title={sidebar ? "收起文件列表" : "打开文件列表"}
            onClick={() => setSidebar(!sidebar)}
          >
            {sidebar ? <PanelLeftClose /> : <PanelLeftOpen />}
          </IconButton>
          <span>MinerU</span>
          <IconButton title="新解析" onClick={() => setUpload(true)}>
            <Plus />
          </IconButton>
        </div>
        {view === "tasks" ? (
          <Tasks
            docs={docs}
            onChoose={choose}
            onUpload={() => setUpload(true)}
          />
        ) : view === "favorites" ? (
          <Favorites
            data={favorites}
            onChoose={choose}
            onReload={loadFavorites}
            notify={notify}
          />
        ) : doc ? (
          <Reader
            doc={doc}
            onSave={save}
            notify={notify}
            onSidebar={() => setSidebar(!sidebar)}
            sidebar={sidebar}
          />
        ) : id ? (
          <div className="empty-state">
            <LoaderCircle className="spin" />
            <h2>正在打开文档</h2>
            {error && <p className="error">{error}</p>}
          </div>
        ) : (
          <div className="empty-state">
            <img src="/brand/mineru.svg" alt="MinerU" />
            <h1>让文档成为可用的知识</h1>
            <p>上传 PDF，逐块对照原文与解析结果。</p>
            <button className="primary" onClick={() => setUpload(true)}>
              <Plus size={19} />
              开始解析
            </button>
            <small>段落 · 图片 · 公式 · 表格</small>
          </div>
        )}
      </main>
      {upload && (
        <UploadModal
          prefs={prefs}
          onClose={() => setUpload(false)}
          onUploaded={(d) => {
            refresh();
            choose(d);
          }}
          notify={notify}
        />
      )}
      {settings && (
        <SettingsModal
          prefs={prefs}
          setPrefs={setPrefs}
          onClose={() => setSettings(false)}
          user={user}
        />
      )}
      {toast && (
        <div className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
      {error && (
        <div className="error-banner">
          <AlertCircle size={17} />
          {error}
          <button
            onClick={() => {
              setError("");
              refresh();
            }}
          >
            重试
          </button>
          <IconButton title="关闭提示" onClick={() => setError("")}>
            <X size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
function Login({ onLogin }) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="login-page">
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await post("/login", { username, password });
            onLogin(await api("/me"));
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <img src="/brand/mineru.svg" alt="MinerU" />
        <h1>文档对照阅读</h1>
        <p>登录后访问你的文档与解析结果</p>
        <label>
          账号
          <input
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          密码
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={18} /> : null}
          {busy ? "正在登录" : "登录"}
        </button>
      </form>
    </div>
  );
}
function Reader({ doc, onSave, notify, onSidebar, sidebar }) {
  const [tab, setTab] = useState("md"),
    [page, setPage] = useState(doc.reading?.page || 0),
    [navPage, setNavPage] = useState(doc.reading?.page || 0),
    [zoom, setZoom] = useState(Math.round((doc.reading?.zoom || 1) * 100)),
    [selected, setSelected] = useState(doc.reading?.selected_id || ""),
    [hovered, setHovered] = useState(""),
    [frames, setFrames] = useState(true),
    [sync, setSync] = useState(false),
    [split, setSplit] = useState(50),
    [mobile, setMobile] = useState("result"),
    [exportOpen, setExportOpen] = useState(false),
    [blockStars, setBlockStars] = useState(new Set());
  const body = useRef(null),
    results = useRef(null),
    syncLock = useRef(false),
    saveTimer = useRef(null);
  const blocks = doc.blocks || [],
    logical = (b) => b.logical_id || b.id;
  const groups = useMemo(() => {
    const map = new Map();
    blocks
      .filter((b) => !b.discarded && b.type)
      .forEach((b) => {
        const key = logical(b);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(b);
      });
    return [...map.entries()].map(([id, bs]) => {
      const filled =
        bs.find((b) => b.text || b.html || b.latex || b.image_path) || bs[0];
      return { id, block: filled, source: bs, page: bs[0].page };
    });
  }, [blocks]);
  const persist = (values) => {
    clearTimeout(saveTimer.current);
    if (Object.hasOwn(values, "selected_id")) {
      onSave({ reading: { page, selected_id: selected, zoom, ...values } });
      return;
    }
    saveTimer.current = setTimeout(
      () =>
        onSave({ reading: { page, selected_id: selected, zoom, ...values } }),
      600,
    );
  };
  useEffect(() => {
    setPage(doc.reading?.page || 0);
    setNavPage(doc.reading?.page || 0);
    setZoom(Math.round((doc.reading?.zoom || 1) * 100));
    setSelected(doc.reading?.selected_id || "");
    const pending = sessionStorage.getItem("mineru-jump-" + doc.id);
    if (pending) {
      try {
        const anchor = JSON.parse(pending);
        setPage(anchor.page || 0);
        setNavPage(anchor.page || 0);
        setSelected(anchor.id || "");
      } catch {}
      sessionStorage.removeItem("mineru-jump-" + doc.id);
    }
    setBlockStars(new Set(blocks.filter((b) => b.favorite).map((b) => b.id)));
    return () => clearTimeout(saveTimer.current);
  }, [doc.id, doc._jumpAt]);
  const goto = (p) => {
    const n = Math.max(0, Math.min((doc.pages || 1) - 1, Number(p) || 0));
    setPage(n);
    setNavPage(n);
    results.current
      ?.querySelector('[data-result-page="' + n + '"]')
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
    persist({ page: n });
  };
  const select = (id, p, fromPdf = false) => {
    setSelected(id);
    if (p != null) {
      setPage(p);
      if (!fromPdf) setNavPage(p);
    }
    persist({ page: p ?? page, selected_id: id });
    setTimeout(
      () =>
        results.current
          ?.querySelector('[data-result-id="' + CSS.escape(id) + '"]')
          ?.scrollIntoView({ block: "center", behavior: "smooth" }),
      50,
    );
  };
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      notify("已复制");
    } catch {
      notify("浏览器未允许复制，请选中文字复制");
    }
  };
  const favorite = async (b) => {
    try {
      const next = !blockStars.has(b.id);
      await post("/documents/" + doc.id + "/blocks/" + b.id + "/favorite", {
        favorite: next,
      });
      setBlockStars((old) => {
        const s = new Set(old);
        next ? s.add(b.id) : s.delete(b.id);
        return s;
      });
      notify(next ? "已加入收藏" : "已取消收藏");
    } catch (e) {
      notify(e);
    }
  };
  const resize = (e) => {
    e.preventDefault();
    const r = body.current.getBoundingClientRect();
    const move = (ev) =>
      setSplit(
        Math.max(28, Math.min(72, ((ev.clientX - r.left) / r.width) * 100)),
      );
    const stop = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", stop);
      document.body.classList.remove("resizing");
    };
    document.body.classList.add("resizing");
    addEventListener("pointermove", move);
    addEventListener("pointerup", stop);
  };
  const syncToResults = (ratio) => {
    if (!sync || syncLock.current || !results.current) return;
    syncLock.current = true;
    results.current.scrollTop =
      ratio * (results.current.scrollHeight - results.current.clientHeight);
    setTimeout(() => (syncLock.current = false), 50);
  };
  const syncToPdf = () => {
    if (!sync || syncLock.current || !results.current) return;
    const source = body.current?.querySelector(".pdf-scroll");
    if (!source) return;
    syncLock.current = true;
    const r = results.current;
    source.scrollTop =
      (r.scrollTop / Math.max(1, r.scrollHeight - r.clientHeight)) *
      (source.scrollHeight - source.clientHeight);
    setTimeout(() => (syncLock.current = false), 50);
  };
  if (!isDone(doc.status))
    return (
      <div className="document-state">
        <FileText size={46} />
        <h1>{doc.name}</h1>
        {doc.status === "failed" ? (
          <>
            <AlertCircle className="failed" size={32} />
            <h2>解析失败</h2>
            <p className="error">
              {doc.error || "远程解析未完成，请重新上传文件。"}
            </p>
            <p>原文件已保留，修正文件或参数后可通过「新解析」重传。</p>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" size={30} />
            <h2>{statusText(doc.status)}</h2>
            <progress
              max="100"
              value={
                typeof doc.progress === "number" ? doc.progress : undefined
              }
            />
            <p>可以离开此页面，任务会继续处理。</p>
          </>
        )}
        <a
          href={"/api/documents/" + doc.id + "/original"}
          target="_blank"
          rel="noreferrer"
        >
          查看原文件 <ExternalLink size={14} />
        </a>
      </div>
    );
  return (
    <div className="reader">
      <header className="document-header">
        <div className="title-group">
          <IconButton
            title={sidebar ? "收起文件列表" : "展开文件列表"}
            onClick={onSidebar}
          >
            {sidebar ? (
              <PanelLeftClose size={19} />
            ) : (
              <PanelLeftOpen size={19} />
            )}
          </IconButton>
          <h1 title={doc.name}>{doc.name}</h1>
          <IconButton title="复制文件名" onClick={() => copy(doc.name)}>
            <Copy size={15} />
          </IconButton>
          <span className="model-tag">
            {doc.settings?.model === "pipeline" ? "MinerU" : "MinerU VLM"}
          </span>
        </div>
        <div className="document-actions">
          <IconButton
            title={doc.favorite ? "取消文档收藏" : "收藏文档"}
            onClick={() => onSave({ favorite: !doc.favorite })}
          >
            <Star size={21} className={doc.favorite ? "starred" : ""} />
          </IconButton>
          <a
            className="icon-button"
            title="打开原文件"
            href={"/api/documents/" + doc.id + "/original"}
            target="_blank"
            rel="noreferrer"
          >
            <FolderOpen size={21} />
          </a>
          <div className="export-wrap">
            <IconButton
              title="导出文档"
              onClick={() => setExportOpen(!exportOpen)}
            >
              <Download size={21} />
            </IconButton>
            {exportOpen && (
              <div className="dropdown">
                {[
                  ["markdown", "Markdown"],
                  ["json", "JSON 版面数据"],
                  ["zip", "完整解析包"],
                ].map(([format, name]) => (
                  <a
                    key={format}
                    href={
                      "/api/documents/" + doc.id + "/export?format=" + format
                    }
                    onClick={() => setExportOpen(false)}
                    download
                  >
                    {name}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="mobile-tabs">
        <button
          className={mobile === "source" ? "active" : ""}
          onClick={() => setMobile("source")}
        >
          原文件
        </button>
        <button
          className={mobile === "result" ? "active" : ""}
          onClick={() => setMobile("result")}
        >
          解析结果
        </button>
      </div>
      <div
        className={"comparison mobile-" + mobile}
        ref={body}
        style={{ "--split": split + "%" }}
      >
        <section className="source-pane">
          <div className="pane-toolbar">
            <span>原文件</span>
            <div className="pdf-controls">
              <IconButton
                title="上一页"
                disabled={page <= 0}
                onClick={() => goto(page - 1)}
              >
                <ChevronLeft size={18} />
              </IconButton>
              <input
                aria-label="当前页"
                type="number"
                min="1"
                max={doc.pages || 1}
                value={page + 1}
                onChange={(e) => goto(Number(e.target.value) - 1)}
              />
              <span>/ {doc.pages || 1}</span>
              <IconButton
                title="下一页"
                disabled={page + 1 >= (doc.pages || 1)}
                onClick={() => goto(page + 1)}
              >
                <ChevronRight size={18} />
              </IconButton>
              <IconButton
                title="缩小"
                disabled={zoom <= 40}
                onClick={() => {
                  setZoom((z) => z - 10);
                  persist({ zoom: zoom - 10 });
                }}
              >
                <ZoomOut size={17} />
              </IconButton>
              <button
                className="zoom-value"
                title="恢复适合页宽"
                onClick={() => {
                  setZoom(100);
                  persist({ zoom: 100 });
                }}
              >
                {zoom}%
              </button>
              <IconButton
                title="放大"
                disabled={zoom >= 220}
                onClick={() => {
                  setZoom((z) => z + 10);
                  persist({ zoom: zoom + 10 });
                }}
              >
                <ZoomIn size={17} />
              </IconButton>
            </div>
            <IconButton
              title={frames ? "隐藏分块框" : "显示分块框"}
              className={"icon-button " + (frames ? "toggled" : "")}
              onClick={() => setFrames(!frames)}
            >
              <ScanLine size={20} />
            </IconButton>
          </div>
          <PdfPane
            document={doc}
            blocks={blocks}
            selected={selected}
            hovered={hovered}
            onSelect={(id, p) => select(id, p, true)}
            onHover={setHovered}
            page={navPage}
            onPage={(p) => {
              setPage(p);
              persist({ page: p });
            }}
            zoom={zoom}
            showFrames={frames}
            sync={sync}
            onProgress={syncToResults}
          />
        </section>
        <div
          className="split-handle"
          role="separator"
          tabIndex={0}
          aria-valuenow={Math.round(split)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setSplit((v) => Math.max(28, v - 2));
            if (e.key === "ArrowRight") setSplit((v) => Math.min(72, v + 2));
          }}
          aria-label="拖动调整对照区宽度"
          aria-orientation="vertical"
          onPointerDown={resize}
        />
        <section className="result-pane">
          <div className="pane-toolbar">
            <div className="segmented">
              <button
                className={tab === "md" ? "active" : ""}
                onClick={() => setTab("md")}
              >
                Markdown
              </button>
              <button
                className={tab === "json" ? "active" : ""}
                onClick={() => setTab("json")}
              >
                JSON
              </button>
            </div>
            <div className="right-tools">
              <IconButton
                title={
                  sync
                    ? "关闭连续滚动联动（Web 扩展）"
                    : "开启连续滚动联动（Web 扩展）"
                }
                className={"icon-button " + (sync ? "toggled" : "")}
                onClick={() => setSync(!sync)}
              >
                {sync ? <Link size={18} /> : <Unlink size={18} />}
              </IconButton>
              <IconButton
                title={tab === "md" ? "复制全文 Markdown" : "复制原始 JSON"}
                onClick={() =>
                  copy(
                    tab === "md"
                      ? doc.markdown || ""
                      : JSON.stringify(doc.layout, null, 2),
                  )
                }
              >
                <Copy size={18} />
              </IconButton>
            </div>
          </div>
          {tab === "md" ? (
            <div className="result-scroll" ref={results} onScroll={syncToPdf}>
              {groups.length ? (
                groups.map((g, i) => (
                  <React.Fragment key={g.id}>
                    {(i === 0 || groups[i - 1].page !== g.page) && (
                      <div
                        className="result-page-label"
                        data-result-page={g.page}
                      >
                        第 {g.page + 1} 页
                      </div>
                    )}
                    <article
                      data-result-id={g.id}
                      className={
                        "result-block type-" +
                        g.block.type +
                        (selected === g.id ? " active" : "") +
                        (hovered === g.id ? " hover" : "")
                      }
                      onMouseEnter={() => setHovered(g.id)}
                      onMouseLeave={() => setHovered("")}
                      onClick={() => select(g.id, g.page)}
                    >
                      <div
                        className="block-tools"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span>{label(g.block.type)}</span>
                        {g.source.length > 1 && (
                          <small>{g.source.length} 处来源</small>
                        )}
                        <IconButton
                          title="复制此块"
                          onClick={() =>
                            copy(
                              g.block.latex ||
                                g.block.html ||
                                g.block.text ||
                                (g.block.image_path
                                  ? "![](" +
                                    resource(doc.id, g.block.image_path) +
                                    ")"
                                  : ""),
                            )
                          }
                        >
                          <Copy size={16} />
                        </IconButton>
                        <IconButton
                          title={
                            blockStars.has(g.block.id) ? "取消收藏" : "收藏此块"
                          }
                          onClick={() => favorite(g.block)}
                        >
                          <Star
                            size={16}
                            className={
                              blockStars.has(g.block.id) ? "starred" : ""
                            }
                          />
                        </IconButton>
                      </div>
                      <BlockContent block={g.block} documentId={doc.id} />
                    </article>
                  </React.Fragment>
                ))
              ) : (
                <div
                  className="raw-markdown prose"
                  dangerouslySetInnerHTML={{
                    __html: rich(doc.markdown || "暂无可显示的结果"),
                  }}
                />
              )}
              <div className="reading-end">解析结果 · {doc.pages || 1} 页</div>
            </div>
          ) : (
            <JsonView layout={doc.layout} page={page} onPage={goto} />
          )}
        </section>
      </div>
    </div>
  );
}
function JsonView({ layout, page, onPage }) {
  const pages = layout?.pdf_info;
  return (
    <div className="json-scroll">
      <div className="json-intro">
        原始版面数据 · 按页展开 · 点击页标题定位原文件
      </div>
      {pages ? (
        pages.map((p, n) => (
          <JsonPage
            key={n}
            data={p}
            index={n}
            initial={n === page}
            onPage={onPage}
          />
        ))
      ) : (
        <pre>{JSON.stringify(layout, null, 2)}</pre>
      )}
    </div>
  );
}
function JsonPage({ data, index, initial, onPage }) {
  const [open, setOpen] = useState(initial);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary onClick={() => onPage(index)}>
        第 {index + 1} 页 <span>{data.para_blocks?.length || 0} 个版面块</span>
      </summary>
      {open && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </details>
  );
}
function Toggle({ value, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={value}
      disabled={disabled}
      className={"toggle " + (value ? "on" : "")}
      onClick={() => onChange(!value)}
    >
      <span />
    </button>
  );
}
function Parameters({ prefs, onChange }) {
  const change = (k, v) => onChange({ ...prefs, [k]: v });
  return (
    <div className="parameters">
      <div className="parameter-row">
        <span>模型版本</span>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              name="model"
              checked={prefs.model === "vlm"}
              onChange={() => change("model", "vlm")}
            />
            MinerU VLM
          </label>
          <label>
            <input
              type="radio"
              name="model"
              checked={prefs.model === "pipeline"}
              onChange={() => change("model", "pipeline")}
            />
            MinerU
          </label>
        </div>
      </div>
      <div className="parameter-row">
        <span>强制开启 OCR</span>
        <Toggle
          label="强制开启 OCR"
          value={prefs.ocr}
          onChange={(v) => change("ocr", v)}
        />
      </div>
      <div className="parameter-row">
        <span>开启公式识别</span>
        <Toggle
          label="开启公式识别"
          value={prefs.model === "vlm" || prefs.formula}
          disabled={prefs.model === "vlm"}
          onChange={(v) => change("formula", v)}
        />
      </div>
      <div className="parameter-row">
        <span>开启表格识别</span>
        <Toggle
          label="开启表格识别"
          value={prefs.model === "vlm" || prefs.table}
          disabled={prefs.model === "vlm"}
          onChange={(v) => change("table", v)}
        />
      </div>
      <label className="language-label">
        选择 OCR 识别语言
        <select
          value={prefs.language}
          onChange={(e) => change("language", e.target.value)}
        >
          <option value="ch">默认（中文 / 英文）</option>
          <option value="en">英文</option>
          <option value="chinese_cht">繁体中文</option>
          <option value="japan">日语</option>
          <option value="korean">韩语</option>
          <option value="french">法语</option>
          <option value="german">德语</option>
        </select>
      </label>
      <p className="parameter-note">
        参数用于下一次解析；已完成文档保留原解析结果。
      </p>
    </div>
  );
}
function UploadModal({ prefs, onClose, onUploaded, notify }) {
  const [options, setOptions] = useState({ ...prefs }),
    [files, setFiles] = useState([]),
    [busy, setBusy] = useState(false),
    [items, setItems] = useState([]),
    [drag, setDrag] = useState(false);
  const input = useRef(null);
  const add = (chosen) =>
    setFiles((old) => [
      ...old,
      ...[...chosen].filter(
        (f) => !old.some((x) => x.name === f.name && x.size === f.size),
      ),
    ]);
  const upload = async () => {
    setBusy(true);
    let last;
    for (const file of files) {
      setItems((old) => [
        ...old.filter((i) => i.name !== file.name),
        { name: file.name, status: "正在上传" },
      ]);
      try {
        const form = new FormData();
        form.append("file", file);
        Object.entries({
          ...options,
          formula: options.model === "vlm" || options.formula,
          table: options.model === "vlm" || options.table,
        }).forEach(([k, v]) => form.append(k, String(v)));
        const d = await api("/documents", { method: "POST", body: form });
        last = d;
        setItems((old) =>
          old.map((i) =>
            i.name === file.name ? { ...i, status: "已加入解析队列" } : i,
          ),
        );
      } catch (e) {
        setItems((old) =>
          old.map((i) =>
            i.name === file.name ? { ...i, status: e.message, error: true } : i,
          ),
        );
      }
    }
    setBusy(false);
    if (last) {
      onUploaded(last);
      notify("文件已提交，解析完成后会自动显示");
    }
  };
  return (
    <div className="modal-backdrop">
      <section
        className="upload-modal"
        role="dialog"
        aria-modal="true"
        aria-label="新解析"
      >
        <header>
          <h2>新解析</h2>
          <IconButton title="关闭" onClick={onClose}>
            <X />
          </IconButton>
        </header>
        <div className="upload-body">
          <div>
            <div
              className={"dropzone " + (drag ? "drag" : "")}
              role="button"
              tabIndex={0}
              onClick={() => input.current.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter") input.current.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                add(e.dataTransfer.files);
              }}
            >
              <Upload size={38} />
              <strong>点击或拖拽文件到这里</strong>
              <span>支持 PDF 文档，可批量上传</span>
              <small>文件由 MinerU 远程 API 解析</small>
              <input
                ref={input}
                hidden
                type="file"
                multiple
                accept=".pdf,application/pdf"
                onChange={(e) => add(e.target.files)}
              />
            </div>
            <div className="upload-files">
              {files.map((f, i) => (
                <div className="upload-file" key={f.name + i}>
                  <FileText size={19} />
                  <div>
                    <strong>{f.name}</strong>
                    <small>{bytes(f.size)}</small>
                    {items.find((x) => x.name === f.name) && (
                      <small
                        className={
                          items.find((x) => x.name === f.name).error
                            ? "failed"
                            : ""
                        }
                      >
                        {items.find((x) => x.name === f.name).status}
                      </small>
                    )}
                  </div>
                  <IconButton
                    title="移除此文件"
                    disabled={busy}
                    onClick={() =>
                      setFiles((old) => old.filter((_, n) => n !== i))
                    }
                  >
                    <X size={15} />
                  </IconButton>
                </div>
              ))}
            </div>
          </div>
          <div className="upload-parameters">
            <h3>解析参数</h3>
            <Parameters prefs={options} onChange={setOptions} />
          </div>
        </div>
        <footer>
          <span>{files.length} 个文件</span>
          <button className="secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="primary"
            disabled={!files.length || busy}
            onClick={upload}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Plus size={17} />
            )}{" "}
            {busy ? "正在提交" : "开始解析"}
          </button>
        </footer>
      </section>
    </div>
  );
}
function SettingsModal({ prefs, setPrefs, onClose, user }) {
  const [tab, setTab] = useState("parameters"),
    [provider, setProvider] = useState(null);
  useEffect(() => {
    api("/provider/status")
      .then(setProvider)
      .catch(() => setProvider({ configured: false }));
  }, []);
  return (
    <div className="settings-overlay">
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
      >
        <IconButton title="关闭设置" onClick={onClose}>
          <X />
        </IconButton>
        <h1>设置</h1>
        <div className="settings-layout">
          <nav>
            {[
              ["system", Settings, "系统设置"],
              ["parameters", ScanLine, "参数设置"],
              ["about", AlertCircle, "关于应用"],
            ].map(([key, Icon, title]) => (
              <button
                className={tab === key ? "current" : ""}
                key={key}
                onClick={() => setTab(key)}
              >
                <Icon size={21} />
                {title}
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {tab === "parameters" ? (
              <>
                <h2>参数设置</h2>
                <Parameters prefs={prefs} onChange={setPrefs} />
                <label className="language-label">
                  解析结果保存至
                  <div className="save-location">
                    Infra Server · 私有文档存储
                  </div>
                </label>
                <p className="parameter-note">
                  文档、收藏及阅读位置由服务器保存。此处参数保存在当前浏览器。
                </p>
              </>
            ) : tab === "system" ? (
              <>
                <h2>系统设置</h2>
                <div className="info-row">
                  <span>当前账号</span>
                  <strong>{user.user?.name || user.name}</strong>
                </div>
                <div className="info-row">
                  <span>解析服务</span>
                  <strong
                    className={provider?.configured ? "success" : "failed"}
                  >
                    {provider
                      ? provider.configured
                        ? "已连接 MinerU 远程 API"
                        : "服务尚未配置"
                      : "正在检查…"}
                  </strong>
                </div>
                <div className="info-row">
                  <span>后端</span>
                  <strong>Rust · PostgreSQL</strong>
                </div>
                <p className="parameter-note">
                  模型在远程服务运行，应用不在本机加载识别模型。
                </p>
              </>
            ) : (
              <>
                <h2>MinerU Web</h2>
                <p>以原文为锚点，对照阅读文字、图片、公式与表格。</p>
                <p className="parameter-note">
                  对照阅读基于 MinerU Desktop 0.14.1
                  的制品与行为研究独立实现。连续滚动联动为 Web
                  扩展，可在阅读页切换。
                </p>
                <a href="https://mineru.net" target="_blank" rel="noreferrer">
                  MinerU 官方网站 <ExternalLink size={14} />
                </a>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
function Tasks({ docs, onChoose, onUpload }) {
  const [query, setQuery] = useState("");
  return (
    <div className="management">
      <header>
        <h1>任务管理</h1>
        <button className="primary" onClick={onUpload}>
          <Plus size={18} />
          新解析
        </button>
      </header>
      <div className="search-box">
        <Search size={18} />
        <input
          aria-label="搜索任务"
          placeholder="搜索文件名"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="task-table">
        <div className="task-head">
          <span>文件名称</span>
          <span>大小</span>
          <span>解析状态</span>
          <span>创建时间</span>
        </div>
        {docs
          .filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))
          .map((d) => (
            <button key={d.id} className="task-row" onClick={() => onChoose(d)}>
              <span>
                <FileText size={20} />
                <strong>{d.name}</strong>
              </span>
              <span>{bytes(d.size)}</span>
              <span
                className={
                  d.status === "failed"
                    ? "failed"
                    : isDone(d.status)
                      ? "success"
                      : ""
                }
              >
                {!isDone(d.status) && d.status !== "failed" && (
                  <LoaderCircle size={14} className="spin" />
                )}
                {statusText(d.status)}
              </span>
              <span>
                {d.created_at
                  ? new Date(d.created_at).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </span>
            </button>
          ))}
      </div>
      {!docs.length && (
        <div className="inline-empty">
          <Files size={40} />
          <p>还没有解析任务</p>
          <button className="secondary" onClick={onUpload}>
            上传第一份文档
          </button>
        </div>
      )}
    </div>
  );
}
function Favorites({ data, onChoose, onReload, notify }) {
  const [type, setType] = useState("all");
  const items = [
    ...(data?.documents || []).map((d) => ({ kind: "file", document: d })),
    ...(data?.blocks || []).map((b) => ({
      kind: b.block?.type || "text",
      ...b,
    })),
  ].filter(
    (i) =>
      type === "all" ||
      (type === "file"
        ? i.kind === "file"
        : type === "image"
          ? i.kind.includes("image")
          : type === "equation"
            ? i.kind.includes("equation")
            : type === "table"
              ? i.kind.includes("table")
              : i.kind === "text" || i.kind === "title"),
  );
  return (
    <div className="management">
      <header>
        <h1>我的收藏</h1>
        <button className="secondary" onClick={onReload}>
          刷新
        </button>
      </header>
      <div className="filter-tabs">
        {[
          ["all", "全部"],
          ["file", "文档"],
          ["text", "文本"],
          ["image", "图片"],
          ["equation", "公式"],
          ["table", "表格"],
        ].map(([key, name]) => (
          <button
            key={key}
            className={type === key ? "active" : ""}
            onClick={() => setType(key)}
          >
            {name}
          </button>
        ))}
      </div>
      {!data ? (
        <div className="loading">
          <LoaderCircle className="spin" />
          正在加载…
        </div>
      ) : !items.length ? (
        <div className="inline-empty">
          <Star size={40} />
          <p>还没有收藏</p>
          <span>在文档中悬停某个块，点击星标即可收藏。</span>
        </div>
      ) : (
        <div className="favorites-grid">
          {items.map((item, n) => (
            <article
              className="favorite-card"
              key={item.document?.id || item.block?.id || n}
            >
              {item.kind === "file" ? (
                <button
                  className="favorite-file"
                  onClick={() => onChoose(item.document)}
                >
                  <FileText size={42} />
                  <strong>{item.document.name}</strong>
                </button>
              ) : (
                <div className="favorite-preview">
                  <BlockContent
                    block={item.block}
                    documentId={item.document_id}
                  />
                </div>
              )}
              <footer>
                <span title={item.document?.name || item.document_name}>
                  {item.document?.name || item.document_name}
                </span>
                <IconButton
                  title="定位到源文件"
                  onClick={() => {
                    if (item.document) onChoose(item.document);
                    else {
                      onChoose({
                        id: item.document_id,
                        anchor: {
                          page: item.block.page,
                          id: item.block.logical_id || item.block.id,
                        },
                      });
                    }
                  }}
                >
                  <ExternalLink size={17} />
                </IconButton>
                <IconButton
                  title="取消收藏"
                  onClick={async () => {
                    try {
                      if (item.document)
                        await api("/documents/" + item.document.id, {
                          method: "PATCH",
                          body: JSON.stringify({ favorite: false }),
                        });
                      else
                        await post(
                          "/documents/" +
                            item.document_id +
                            "/blocks/" +
                            item.block.id +
                            "/favorite",
                          { favorite: false },
                        );
                      onReload();
                    } catch (e) {
                      notify(e);
                    }
                  }}
                >
                  <Star size={17} className="starred" />
                </IconButton>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
