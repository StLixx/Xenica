use anyhow::{Context, Result, bail};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

const MAX_UNPACKED: u64 = 1024 * 1024 * 1024;
const MAX_FILES: usize = 25000;

pub fn unpack(zip_path: &Path, dest: &Path) -> Result<()> {
    fs::create_dir_all(dest)?;
    let mut archive = zip::ZipArchive::new(fs::File::open(zip_path)?)?;
    if archive.len() > MAX_FILES {
        bail!("archive file limit");
    }
    let mut expanded = 0_u64;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        expanded = expanded
            .checked_add(file.size())
            .context("archive overflow")?;
        if expanded > MAX_UNPACKED {
            bail!("archive expanded size limit");
        }
        let name = file.enclosed_name().context("unsafe archive name")?;
        if file
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            bail!("archive symlink");
        }
        let target = dest.join(name);
        if file.is_dir() {
            fs::create_dir_all(&target)?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut output = fs::File::create(&target)?;
        let actual = std::io::copy(&mut file, &mut output)?;
        if actual > MAX_UNPACKED {
            bail!("archive entry limit");
        }
    }
    Ok(())
}

fn collect_files(path: &Path, output: &mut Vec<PathBuf>) -> Result<()> {
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        if kind.is_dir() {
            collect_files(&entry.path(), output)?;
        } else if kind.is_file() {
            output.push(entry.path());
        }
        if output.len() > MAX_FILES {
            bail!("file limit");
        }
    }
    Ok(())
}

fn read_json(path: Option<&PathBuf>) -> Value {
    path.and_then(|p| fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or(Value::Null)
}
fn spans(block: &Value) -> Vec<&Value> {
    block
        .get("lines")
        .and_then(Value::as_array)
        .map(|lines| {
            lines
                .iter()
                .flat_map(|line| {
                    line.get("spans")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                })
                .collect()
        })
        .unwrap_or_default()
}
fn string_field<'a>(value: &'a Value, field: &str) -> &'a str {
    value.get(field).and_then(Value::as_str).unwrap_or("")
}
fn text(block: &Value) -> String {
    let lines = block.get("lines").and_then(Value::as_array);
    if let Some(lines) = lines {
        return lines
            .iter()
            .map(|line| {
                line.get("spans")
                    .and_then(Value::as_array)
                    .map(|items| {
                        items
                            .iter()
                            .map(|s| {
                                let t = string_field(s, "content");
                                if !t.is_empty() {
                                    t
                                } else {
                                    string_field(s, "latex")
                                }
                            })
                            .collect::<String>()
                    })
                    .unwrap_or_default()
            })
            .collect::<Vec<_>>()
            .join("\n");
    }
    string_field(block, "text").to_owned()
}
fn asset_path(prefix: &str, path: &str) -> Option<String> {
    if path.is_empty() || path.contains('\\') {
        return None;
    }
    let p = Path::new(path);
    if p.is_absolute()
        || p.components()
            .any(|v| !matches!(v, std::path::Component::Normal(_)))
    {
        return None;
    }
    Some(if prefix.is_empty() {
        path.into()
    } else {
        format!("{prefix}/{path}")
    })
}

struct NormalizeContext<'a> {
    blocks: Vec<Value>,
    prefix: &'a str,
}
impl NormalizeContext<'_> {
    fn add(
        &mut self,
        block: &Value,
        page: usize,
        size: &Value,
        position: Vec<usize>,
        parent: Option<&str>,
        discarded: bool,
    ) {
        let kind = string_field(block, "type");
        let id = format!(
            "p{}-b{}",
            page,
            position
                .iter()
                .map(usize::to_string)
                .collect::<Vec<_>>()
                .join("-")
        );
        if let Some(children) = block.get("blocks").and_then(Value::as_array) {
            for (i, child) in children.iter().enumerate() {
                let mut child_pos = position.clone();
                child_pos.push(i);
                self.add(child, page, size, child_pos, Some(&id), discarded);
            }
            return;
        }
        let source_spans = spans(block);
        let image = source_spans
            .iter()
            .find_map(|s| asset_path(self.prefix, string_field(s, "image_path")));
        let html = source_spans
            .iter()
            .map(|s| string_field(s, "html"))
            .find(|s| !s.is_empty())
            .unwrap_or("");
        let latex = source_spans
            .iter()
            .map(|s| string_field(s, "latex"))
            .find(|s| !s.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| {
                if kind.contains("equation") {
                    text(block)
                } else {
                    String::new()
                }
            });
        let bbox = block
            .get("bbox")
            .filter(|v| {
                v.as_array()
                    .is_some_and(|a| a.len() == 4 && a.iter().all(Value::is_number))
            })
            .cloned()
            .unwrap_or(Value::Null);
        self.blocks.push(json!({
            "id":id,"logical_id":id,"type":kind,"page":page,"bbox":bbox,
            "page_width":size.get(0),"page_height":size.get(1),
            "source_position":position,"parent_id":parent,"index":block.get("index"),
            "text":text(block),"html":html,"latex":latex,"image_path":image,
            "merged_from":[],"discarded":discarded,"merge_prev":block.get("merge_prev"),"lines_deleted":block.get("lines_deleted").and_then(Value::as_bool).unwrap_or(false)
        }));
    }
}

pub fn normalize_layout(layout: &Value, content_list: &Value, prefix: &str) -> Vec<Value> {
    let mut ctx = NormalizeContext {
        blocks: vec![],
        prefix,
    };
    if let Some(pages) = layout
        .get("pdf_info")
        .and_then(Value::as_array)
        .or_else(|| layout.as_array())
    {
        for (page_index, page) in pages.iter().enumerate() {
            let index = page
                .get("page_idx")
                .and_then(Value::as_u64)
                .map(|v| v as usize)
                .unwrap_or(page_index);
            let size = page
                .get("page_size")
                .cloned()
                .unwrap_or(json!([null, null]));
            if let Some(items) = page
                .get("para_blocks")
                .or_else(|| page.get("preproc_blocks"))
                .and_then(Value::as_array)
            {
                for (i, b) in items.iter().enumerate() {
                    ctx.add(b, index, &size, vec![i], None, false);
                }
            }
            if let Some(items) = page.get("discarded_blocks").and_then(Value::as_array) {
                for (i, b) in items.iter().enumerate() {
                    ctx.add(b, index, &size, vec![usize::MAX, i], None, true);
                }
            }
        }
    }
    if ctx.blocks.is_empty()
        && let Some(items) = content_list.as_array()
    {
        for (i, item) in items.iter().enumerate() {
            let mut v = item.clone();
            v["id"] = json!(format!("content-{i}"));
            v["logical_id"] = v["id"].clone();
            v["page"] = item.get("page_idx").cloned().unwrap_or(json!(0));
            v["bbox"] = Value::Null;
            v["page_width"] = Value::Null;
            v["page_height"] = Value::Null;
            v["merged_from"] = json!([]);
            v["source_position"] = json!([i]);
            if let Some(image) = item
                .get("img_path")
                .and_then(Value::as_str)
                .and_then(|p| asset_path(prefix, p))
            {
                v["image_path"] = json!(image);
            }
            ctx.blocks.push(v);
        }
    }
    ctx.blocks.sort_by(|a, b| {
        a["page"].as_u64().cmp(&b["page"].as_u64()).then_with(|| {
            a["index"]
                .as_f64()
                .unwrap_or(f64::MAX)
                .total_cmp(&b["index"].as_f64().unwrap_or(f64::MAX))
        })
    });
    let mut previous: HashMap<String, usize> = HashMap::new();
    let mut groups: HashMap<String, Vec<String>> = HashMap::new();
    for i in 0..ctx.blocks.len() {
        let kind = string_field(&ctx.blocks[i], "type").to_owned();
        if ctx.blocks[i]["lines_deleted"] == true
            && !ctx.blocks[i]["discarded"].as_bool().unwrap_or(false)
            && let Some(&prev) = previous.get(&kind)
        {
            let logical = ctx.blocks[prev]["logical_id"]
                .as_str()
                .unwrap_or("")
                .to_owned();
            ctx.blocks[i]["logical_id"] = json!(logical);
            let entry = groups
                .entry(logical.clone())
                .or_insert_with(|| vec![logical]);
            entry.push(ctx.blocks[i]["id"].as_str().unwrap_or("").into());
        }
        if !ctx.blocks[i]["discarded"].as_bool().unwrap_or(false) {
            previous.insert(kind, i);
        }
    }
    for b in &mut ctx.blocks {
        if let Some(group) = b["logical_id"].as_str().and_then(|id| groups.get(id)) {
            b["merged_from"] = json!(group);
        }
    }
    ctx.blocks
}

pub fn normalize(bundle: &Path) -> Result<Value> {
    let mut files = vec![];
    collect_files(bundle, &mut files)?;
    files.sort();
    let layout_path = files
        .iter()
        .find(|p| p.file_name().and_then(|s| s.to_str()) == Some("layout.json"))
        .or_else(|| {
            files.iter().find(|p| {
                p.file_name()
                    .and_then(|s| s.to_str())
                    .is_some_and(|s| s.ends_with("_middle.json"))
            })
        });
    let content_path = files.iter().find(|p| {
        p.file_name()
            .and_then(|s| s.to_str())
            .is_some_and(|s| s.ends_with("content_list.json"))
    });
    let md_path = files
        .iter()
        .find(|p| p.file_name().and_then(|s| s.to_str()) == Some("full.md"))
        .or_else(|| {
            files
                .iter()
                .find(|p| p.extension().is_some_and(|s| s == "md"))
        });
    let root = layout_path
        .or(md_path)
        .and_then(|p| p.parent())
        .unwrap_or(bundle);
    let prefix = root
        .strip_prefix(bundle)?
        .to_str()
        .unwrap_or("")
        .replace('\\', "/");
    let layout = read_json(layout_path);
    let content_list = read_json(content_path);
    let markdown = md_path
        .map(fs::read_to_string)
        .transpose()?
        .unwrap_or_default();
    let mut blocks = normalize_layout(&layout, &content_list, &prefix);
    // Resolve only against extracted ZIP members: older layouts store a bare image hash.
    for block in &mut blocks {
        if let Some(path) = block["image_path"].as_str().map(str::to_owned)
            && !bundle.join(&path).is_file()
        {
            let basename = Path::new(&path).file_name();
            let candidates = files
                .iter()
                .filter(|p| p.file_name() == basename)
                .collect::<Vec<_>>();
            if candidates.len() == 1 {
                block["image_path"] = json!(
                    candidates[0]
                        .strip_prefix(bundle)?
                        .to_string_lossy()
                        .replace('\\', "/")
                );
            } else {
                block["image_path"] = Value::Null;
                block["image_missing"] = json!(true);
            }
        }
    }
    if blocks.is_empty() && markdown.is_empty() {
        bail!("bundle has no supported content");
    }
    let pages = layout
        .get("pdf_info")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or_else(|| {
            blocks
                .iter()
                .filter_map(|b| b["page"].as_u64())
                .max()
                .map(|v| v as usize + 1)
                .unwrap_or(0)
        });
    Ok(
        json!({"markdown":markdown,"blocks":blocks,"layout":layout,"content_list":content_list,"pages":pages}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn keeps_real_geometry_and_stable_fragments() {
        let layout = json!({"pdf_info":[
            {"page_size":[370,500],"para_blocks":[{"type":"text","index":0,"bbox":[10,20,200,40],"lines":[{"spans":[{"content":"first"}]}]}]},
            {"page_size":[370,500],"para_blocks":[{"type":"text","index":0,"bbox":[10,20,200,60],"lines_deleted":true,"lines":[{"spans":[{"content":"continued"}]}]},
            {"type":"image","index":1,"blocks":[{"type":"image_body","bbox":[0,0,100,100],"lines":[{"spans":[{"image_path":"images/a.jpg"}]}]},{"type":"image_caption","bbox":[0,100,100,120],"lines":[{"spans":[{"content":"caption"}]}]}]}]}]});
        let out = normalize_layout(&layout, &Value::Null, "folder");
        assert_eq!(out[0]["bbox"], json!([10, 20, 200, 40]));
        assert_eq!(out[0]["page_width"], 370);
        assert_eq!(out[1]["logical_id"], out[0]["id"]);
        assert_eq!(out[1]["merged_from"].as_array().unwrap().len(), 2);
        assert_eq!(out[2]["image_path"], "folder/images/a.jpg");
        assert_eq!(out[3]["parent_id"], "p1-b1");
    }
    #[test]
    fn missing_geometry_remains_missing() {
        let out = normalize_layout(
            &Value::Null,
            &json!([{"type":"text","page_idx":3,"text":"sample"}]),
            "",
        );
        assert!(out[0]["bbox"].is_null());
        assert_eq!(out[0]["page"], 3);
        assert!(asset_path("", "../outside").is_none());
        assert!(asset_path("", "/etc/passwd").is_none());
    }
    #[test]
    fn archive_rejects_parent_traversal() {
        use std::io::Write;
        let root = std::env::temp_dir().join(format!("mineru-zip-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let zip_path = root.join("evil.zip");
        let mut writer = zip::ZipWriter::new(fs::File::create(&zip_path).unwrap());
        writer
            .start_file("../escaped", zip::write::SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"unsafe").unwrap();
        writer.finish().unwrap();
        assert!(unpack(&zip_path, &root.join("out")).is_err());
        assert!(!root.join("escaped").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
