//! 草图：把一张 Excalidraw 画面转成给 AI 读的文字（见 `docs/adr/0009-sketch.md`）。
//!
//! 为什么要有这块：excalidraw.com 的分享链接内容是加密的，Notion 的嵌入也对 AI 不透明。
//! 草图存在 Xenica 里，由我们自己给出文字，AI 打开链接就能读到画了什么。
//!
//! 这里的输出是**给机器读的**，所以规则是：确定（同一个画面永远同样的文字）、
//! 从上到下（元素按坐标排序，读起来和人看画一样）、凡是判断都要留证据（说得出「离谁多远」）。

use std::collections::HashMap;
use std::fmt::Write as _;

use serde_json::Value;

/// 一段文字最多引用多少字符，超了截断。
const MAX_TEXT: usize = 60;
/// 元素种类名：类型 → 中文。
fn kind_name(kind: &str) -> &'static str {
    match kind {
        "rectangle" => "框",
        "ellipse" => "椭圆",
        "diamond" => "菱形",
        "text" => "文字",
        "arrow" => "箭头",
        "line" => "线",
        "freedraw" => "手绘",
        "image" => "图片",
        "frame" => "画框",
        "embed" => "嵌入",
        _ => "元素",
    }
}

/// 画面之外还要给出去的几个地址（都由服务器按分享链接拼）。
#[derive(Default, Debug, Clone)]
pub struct SketchLinks {
    /// 整张图的图片。
    pub image: Option<String>,
    /// 原始画布 JSON。
    pub scene: Option<String>,
    /// 在 Xenica 里的位置。
    pub node: Option<String>,
    /// 附件地址前缀，后面接元素里的 `fileId`（贴进去的截图按原图存）。
    pub attachment: Option<String>,
}

/// 把一张画面写成 Markdown。`title` 是节点标题，可以为空。
pub fn describe(title: &str, scene: &Value, links: &SketchLinks) -> String {
    let els = parse(scene);
    let labels = labels(&els);
    // 框里的文字是这个框的说明，不单独算一个元素。
    let shown: Vec<&El> = els
        .iter()
        .filter(|e| !(e.kind == "text" && e.container.is_some()))
        .collect();

    let mut out = String::new();
    let _ = writeln!(
        out,
        "# {}",
        if title.trim().is_empty() {
            "草图"
        } else {
            title.trim()
        }
    );
    out.push('\n');

    if shown.is_empty() {
        out.push_str("空画面，还没有画任何东西。\n");
        links_section(&mut out, links);
        return out;
    }

    // 一句话摘要：按种类数一遍。
    let mut counts: Vec<(&str, usize)> = Vec::new();
    for el in &shown {
        let name = kind_name(&el.kind);
        match counts.iter_mut().find(|(n, _)| *n == name) {
            Some((_, c)) => *c += 1,
            None => counts.push((name, 1)),
        }
    }
    let brief = counts
        .iter()
        .map(|(n, c)| format!("{c} 个{n}"))
        .collect::<Vec<_>>()
        .join("、");
    let _ = writeln!(out, "画面里有 {} 个元素：{}。\n", shown.len(), brief);

    let _ = writeln!(out, "## 有什么（从上到下）");
    for el in &shown {
        let _ = writeln!(out, "- {}", one_line(el, &labels));
    }
    out.push('\n');

    let arrows: Vec<&El> = shown
        .iter()
        .copied()
        .filter(|e| e.kind == "arrow")
        .collect();
    if !arrows.is_empty() {
        let _ = writeln!(out, "## 谁指向谁");
        for a in arrows {
            let from = a.start.as_deref().and_then(|id| labels.get(id));
            let to = a.end.as_deref().and_then(|id| labels.get(id));
            let middle = match (from, to) {
                (Some(f), Some(t)) => format!("「{f}」 → 「{t}」"),
                (Some(f), None) => format!("「{f}」 → 一个未连到元素的位置"),
                (None, Some(t)) => format!("一个未连到元素的位置 → 「{t}」"),
                (None, None) => "两端都没连到元素".to_owned(),
            };
            match a.text.as_deref() {
                Some(t) if !t.is_empty() => {
                    let _ = writeln!(out, "- {middle}，箭头上写着「{}」", cut(t));
                }
                _ => {
                    let _ = writeln!(out, "- {middle}");
                }
            }
        }
        out.push('\n');
    }

    // 独立的文字就是批注：说清它贴在谁旁边。
    let notes: Vec<&El> = shown.iter().copied().filter(|e| e.kind == "text").collect();
    if !notes.is_empty() {
        let _ = writeln!(out, "## 批注");
        for note in notes {
            let text = note.text.clone().unwrap_or_default();
            let color = color_name(&note.color);
            match nearest(note, &els) {
                Some((target, gap)) => {
                    let dir = direction(note, target);
                    let _ = writeln!(
                        out,
                        "- {color}「{}」——贴在{}{dir}（相距约 {}）",
                        cut(&text),
                        labels
                            .get(&target.id)
                            .map(|l| format!("「{l}」"))
                            .unwrap_or_else(|| "一个元素".into()),
                        gap.round_ties_even() as i64
                    );
                }
                None => {
                    let _ = writeln!(out, "- {color}「{}」——离其他元素都较远", cut(&text));
                }
            }
        }
        out.push('\n');
    }

    let images: Vec<&El> = shown
        .iter()
        .copied()
        .filter(|e| e.kind == "image")
        .collect();
    if !images.is_empty() {
        let _ = writeln!(out, "## 图");
        for (i, img) in images.iter().enumerate() {
            match (&img.file, &links.attachment) {
                (Some(f), Some(base)) => {
                    let _ = writeln!(out, "- 第 {} 张：{base}/{f}", i + 1);
                }
                _ => {
                    let _ = writeln!(out, "- 第 {} 张（原始数据在画布 JSON 里）", i + 1);
                }
            }
        }
        out.push('\n');
    }

    links_section(&mut out, links);
    out
}

fn links_section(out: &mut String, links: &SketchLinks) {
    let mut any = false;
    let mut section = String::new();
    if let Some(u) = &links.image {
        let _ = writeln!(section, "- 画面图片：{u}");
        any = true;
    }
    if let Some(u) = &links.scene {
        let _ = writeln!(
            section,
            "- 画布原始数据（Excalidraw JSON，可用可写链接改）：{u}"
        );
        any = true;
    }
    if let Some(u) = &links.node {
        let _ = writeln!(section, "- 在 Xenica 里的位置：{u}");
        any = true;
    }
    if any {
        out.push_str("## 原始数据\n\n");
        out.push_str(&section);
        out.push('\n');
    }
}

/// 画面里一个元素，只留描述用得上的字段。
#[derive(Debug, Clone)]
struct El {
    id: String,
    kind: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    text: Option<String>,
    container: Option<String>,
    start: Option<String>,
    end: Option<String>,
    color: String,
    file: Option<String>,
}

fn parse(scene: &Value) -> Vec<El> {
    let Some(items) = scene.get("elements").and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut out = Vec::with_capacity(items.len());
    for item in items {
        if item
            .get("isDeleted")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            continue;
        }
        let Some(id) = item.get("id").and_then(Value::as_str) else {
            continue;
        };
        let kind = item
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_owned();
        let num = |key: &str| item.get(key).and_then(Value::as_f64).unwrap_or(0.0);
        let binding = |key: &str| {
            item.get(key)
                .and_then(|b| b.get("elementId"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        };
        let text = item
            .get("text")
            .and_then(Value::as_str)
            .filter(|t| !t.trim().is_empty())
            .map(|t| t.trim().to_owned());
        // 框里的文字不单独算一个元素，作为框的说明。
        if kind == "text"
            && item.get("containerId").and_then(Value::as_str).is_none()
            && text.is_none()
        {
            continue;
        }
        out.push(El {
            id: id.to_owned(),
            kind,
            x: num("x"),
            y: num("y"),
            w: num("width"),
            h: num("height"),
            text,
            container: item
                .get("containerId")
                .and_then(Value::as_str)
                .map(str::to_owned),
            start: binding("startBinding"),
            end: binding("endBinding"),
            color: item
                .get("strokeColor")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned(),
            file: item
                .get("fileId")
                .and_then(Value::as_str)
                .map(str::to_owned),
        });
    }
    // 从上到下、再从左到右：读起来和人看画一致。
    out.sort_by(|a, b| {
        (a.y.round() as i64, a.x.round() as i64).cmp(&(b.y.round() as i64, b.x.round() as i64))
    });
    out
}

/// 元素的名字：框用框里的字，文字用自己的字，图用「图片」。
fn labels(els: &[El]) -> HashMap<String, String> {
    let mut inside: HashMap<&str, &str> = HashMap::new();
    for el in els {
        if let (Some(c), Some(t)) = (el.container.as_deref(), el.text.as_deref()) {
            inside.entry(c).or_insert(t);
        }
    }
    let mut out = HashMap::new();
    for el in els {
        let label = match el.kind.as_str() {
            "text" => el.text.clone().unwrap_or_default(),
            "image" => "图片".to_owned(),
            "freedraw" => "手绘".to_owned(),
            _ => match inside.get(el.id.as_str()) {
                Some(t) => (*t).to_owned(),
                None => String::new(),
            },
        };
        out.insert(el.id.clone(), label);
    }
    out
}

fn one_line(el: &El, labels: &HashMap<String, String>) -> String {
    let kind = kind_name(&el.kind);
    let size = format!("{}×{}", el.w.round() as i64, el.h.round() as i64);
    let at = format!("@ ({}, {})", el.x.round() as i64, el.y.round() as i64);
    let name = labels.get(&el.id).cloned().unwrap_or_default();
    let head = if name.is_empty() {
        kind.to_owned()
    } else {
        format!("{kind}「{}」", cut(&name))
    };
    match el.kind.as_str() {
        "arrow" | "line" => format!("{head} {at}"),
        "freedraw" => format!("{head} {size} {at}"),
        _ => format!("{head} {size} {at}"),
    }
}

/// 找离这个元素最近的另一个元素，以及它们之间的空隙（重叠算 0）。
fn nearest<'a>(el: &El, els: &'a [El]) -> Option<(&'a El, f64)> {
    let mut best: Option<(&El, f64)> = None;
    for other in els {
        // 只认「实体」：框、椭圆、文字、图片。箭头线太细，不作为归属对象。
        if other.id == el.id || matches!(other.kind.as_str(), "arrow" | "line" | "freedraw") {
            continue;
        }
        if other.kind == "text" && other.container.is_some() {
            continue;
        }
        let gap = gap(el, other);
        if best.is_none_or(|(_, g)| gap < g) {
            best = Some((other, gap));
        }
    }
    // 太远就不硬说「旁边」：超过自身高度的 6 倍算无关。
    best.filter(|(_, gap)| *gap <= (el.h.max(el.w).max(40.0)) * 6.0)
}

fn gap(a: &El, b: &El) -> f64 {
    let dx = (a.x + a.w / 2.0 - (b.x + b.w / 2.0)).abs() - (a.w + b.w) / 2.0;
    let dy = (a.y + a.h / 2.0 - (b.y + b.h / 2.0)).abs() - (a.h + b.h) / 2.0;
    dx.max(0.0).hypot(dy.max(0.0))
}

fn direction(from: &El, to: &El) -> &'static str {
    let dx = from.x + from.w / 2.0 - (to.x + to.w / 2.0);
    let dy = from.y + from.h / 2.0 - (to.y + to.h / 2.0);
    if dx.abs() >= dy.abs() {
        if dx > 0.0 { "右边" } else { "左边" }
    } else if dy > 0.0 {
        "下方"
    } else {
        "上方"
    }
}

/// 颜色说成人话。Excalidraw 用的是十六进制，人看的是「红色批注」。
fn color_name(hex: &str) -> &'static str {
    let Some((r, g, b)) = parse_hex(hex) else {
        return "";
    };
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    if max - min < 24 {
        return if max < 60 {
            "黑色"
        } else if max > 200 {
            "白色"
        } else {
            "灰色"
        };
    }
    let span = f64::from(max - min);
    let (rf, gf, bf) = (f64::from(r), f64::from(g), f64::from(b));
    let h = if max == r {
        (gf - bf) / span
    } else if max == g {
        (bf - rf) / span + 2.0
    } else {
        (rf - gf) / span + 4.0
    };
    let h = h.rem_euclid(6.0) * 60.0;
    match h {
        h if h < 15.0 || h >= 345.0 => "红色",
        h if h < 45.0 => "橙色",
        h if h < 70.0 => "黄色",
        h if h < 165.0 => "绿色",
        h if h < 200.0 => "青色",
        h if h < 260.0 => "蓝色",
        _ => "紫色",
    }
}

fn parse_hex(hex: &str) -> Option<(u8, u8, u8)> {
    let s = hex.strip_prefix('#')?;
    let (r, g, b) = match s.len() {
        3 => (dup(s, 0), dup(s, 1), dup(s, 2)),
        6 => (
            u8::from_str_radix(&s[0..2], 16).ok()?,
            u8::from_str_radix(&s[2..4], 16).ok()?,
            u8::from_str_radix(&s[4..6], 16).ok()?,
        ),
        _ => return None,
    };
    Some((r, g, b))
}

fn dup(s: &str, i: usize) -> u8 {
    let c = s.as_bytes()[i] as char;
    u8::from_str_radix(&format!("{c}{c}"), 16).unwrap_or(0)
}

/// 文字截断，超了加省略号（按字符数，不按字节）。
fn cut(text: &str) -> String {
    let mut out: String = text.chars().take(MAX_TEXT).collect();
    if text.chars().count() > MAX_TEXT {
        out.push('…');
    }
    out.replace('\n', " ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn scene(elements: Value) -> Value {
        json!({ "type": "excalidraw", "version": 2, "elements": elements })
    }

    #[test]
    fn 空画面也要有话说() {
        let text = describe("", &scene(json!([])), &SketchLinks::default());
        assert!(text.starts_with("# 草图"));
        assert!(text.contains("空画面"));
    }

    #[test]
    fn 框里的字是框的名字() {
        let s = scene(json!([
            { "id": "r1", "type": "rectangle", "x": 100.0, "y": 200.0, "width": 180.0, "height": 90.0,
              "strokeColor": "#1e1e1e" },
            { "id": "t1", "type": "text", "x": 120.0, "y": 230.0, "width": 140.0, "height": 25.0,
              "text": "侧栏", "containerId": "r1", "strokeColor": "#1e1e1e" }
        ]));
        let text = describe("验收板", &s, &SketchLinks::default());
        assert!(text.contains("# 验收板"), "{text}");
        // 框里有字就不再单独列一行文字
        assert_eq!(text.matches("文字").count(), 0, "{text}");
        assert!(text.contains("框「侧栏」 180×90 @ (100, 200)"), "{text}");
        assert!(text.contains("1 个框"), "{text}");
    }

    #[test]
    fn 箭头说清谁指向谁() {
        let s = scene(json!([
            { "id": "a", "type": "rectangle", "x": 0.0, "y": 0.0, "width": 100.0, "height": 50.0 },
            { "id": "ta", "type": "text", "x": 10.0, "y": 10.0, "text": "侧栏", "containerId": "a" },
            { "id": "b", "type": "rectangle", "x": 300.0, "y": 0.0, "width": 100.0, "height": 50.0 },
            { "id": "tb", "type": "text", "x": 310.0, "y": 10.0, "text": "正文", "containerId": "b" },
            { "id": "arr", "type": "arrow", "x": 100.0, "y": 25.0, "points": [[0.0, 0.0], [200.0, 0.0]],
              "startBinding": { "elementId": "a" }, "endBinding": { "elementId": "b" } }
        ]));
        let text = describe("", &s, &SketchLinks::default());
        assert!(text.contains("- 「侧栏」 → 「正文」"), "{text}");
    }

    #[test]
    fn 批注说出贴在谁旁边以及什么颜色() {
        let s = scene(json!([
            { "id": "a", "type": "rectangle", "x": 0.0, "y": 0.0, "width": 100.0, "height": 50.0 },
            { "id": "ta", "type": "text", "x": 10.0, "y": 10.0, "text": "侧栏", "containerId": "a" },
            { "id": "n1", "type": "text", "x": 120.0, "y": 10.0, "width": 80.0, "height": 20.0,
              "text": "这里太挤", "strokeColor": "#e03131" }
        ]));
        let text = describe("", &s, &SketchLinks::default());
        assert!(text.contains("红色「这里太挤」"), "{text}");
        assert!(text.contains("贴在「侧栏」右边"), "{text}");
    }

    #[test]
    fn 孤零零的批注不硬说旁边() {
        let s = scene(json!([
            { "id": "a", "type": "rectangle", "x": 0.0, "y": 0.0, "width": 100.0, "height": 50.0 },
            { "id": "n1", "type": "text", "x": 2000.0, "y": 2000.0, "width": 80.0, "height": 20.0,
              "text": "远处的备注", "strokeColor": "#1971c2" }
        ]));
        let text = describe("", &s, &SketchLinks::default());
        assert!(text.contains("离其他元素都较远"), "{text}");
    }

    #[test]
    fn 图片给出附件地址() {
        let s = scene(json!([
            { "id": "i1", "type": "image", "x": 0.0, "y": 0.0, "width": 200.0, "height": 100.0,
              "fileId": "abc" }
        ]));
        let links = SketchLinks {
            attachment: Some("https://x/api/share/tok/files".into()),
            ..Default::default()
        };
        let text = describe("", &s, &links);
        assert!(text.contains("https://x/api/share/tok/files/abc"), "{text}");
    }

    #[test]
    fn 删掉的元素不出现() {
        let s = scene(json!([
            { "id": "a", "type": "rectangle", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0,
              "isDeleted": true },
            { "id": "b", "type": "ellipse", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0 }
        ]));
        let text = describe("", &s, &SketchLinks::default());
        assert!(text.contains("1 个元素"), "{text}");
        assert!(text.contains("椭圆"), "{text}");
    }

    #[test]
    fn 长文字截断且换行压平() {
        let long = "一".repeat(100);
        let s = scene(json!([
            { "id": "t", "type": "text", "x": 0.0, "y": 0.0, "text": format!("{long}\n第二行") }
        ]));
        let text = describe("", &s, &SketchLinks::default());
        assert!(text.contains('…'), "{text}");
        assert!(!text.contains("第二行"), "{text}");
    }

    #[test]
    fn 颜色名字认得出来() {
        assert_eq!(color_name("#e03131"), "红色");
        assert_eq!(color_name("#1971c2"), "蓝色");
        assert_eq!(color_name("#2f9e44"), "绿色");
        assert_eq!(color_name("#f08c00"), "橙色");
        assert_eq!(color_name("#1e1e1e"), "黑色");
        assert_eq!(color_name("transparent"), "");
    }
}
