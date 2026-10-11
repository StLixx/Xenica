//! 可迁移草图档案：正文、历史与不可变原图一起搬迁，不携带会话或分享凭据。
use std::collections::{BTreeSet, HashMap};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use xenica_core::{Actor, NewNode, Node, NodeId};
use xenica_store::{Store, StoreError};

#[derive(Serialize, Deserialize)]
pub struct Archive {
    pub format: String,
    pub node: Node,
    pub history: Vec<Value>,
    pub files: Vec<ArchiveFile>,
}

#[derive(Serialize, Deserialize)]
pub struct ArchiveFile {
    pub id: Uuid,
    pub mime: String,
    pub sha256: String,
    pub bytes: Vec<u8>,
}

fn file_ids(body: &Value, out: &mut BTreeSet<Uuid>) {
    match body {
        Value::Object(map) => {
            for (key, value) in map {
                if matches!(key.as_str(), "image" | "file" | "fileId")
                    && let Some(id) = value.as_str().and_then(|s| Uuid::parse_str(s).ok())
                {
                    out.insert(id);
                }
                if key == "fileIds"
                    && let Some(map) = value.as_object()
                {
                    for value in map.values() {
                        if let Some(id) = value.as_str().and_then(|s| Uuid::parse_str(s).ok()) {
                            out.insert(id);
                        }
                    }
                }
                file_ids(value, out);
            }
        }
        Value::Array(items) => {
            for item in items {
                file_ids(item, out);
            }
        }
        _ => {}
    }
}

pub async fn export(store: &Store, id: NodeId) -> Result<Archive, StoreError> {
    let node = store.get_node(id).await?;
    if node.kind != "sketch" {
        return Err(xenica_core::DomainError::Invalid("只能归档草图".into()).into());
    }
    let history = match store.sketch_history(id).await {
        Ok(history) => history,
        Err(StoreError::Database(ref error))
            if error
                .as_database_error()
                .is_some_and(|e| e.code().as_deref() == Some("42P01")) =>
        {
            Vec::new()
        }
        Err(error) => return Err(error),
    };
    let mut ids = BTreeSet::new();
    file_ids(&node.body, &mut ids);
    for snapshot in &history {
        file_ids(snapshot, &mut ids);
    }
    let mut files = Vec::new();
    for id in ids {
        let file = store.get_file(id).await?;
        files.push(ArchiveFile {
            id,
            sha256: format!("{:x}", Sha256::digest(&file.bytes)),
            mime: file.mime,
            bytes: file.bytes,
        });
    }
    Ok(Archive {
        format: "xenica-sketch-archive/v1".into(),
        node,
        history,
        files,
    })
}

/// 在唯一画板新增原件的带来源副本，原件节点和已有画面均不修改。
pub async fn attach_to_board(store:&Store,source:NodeId)->Result<Node,StoreError> {
    let original=export(store,source).await?;
    let actor=Actor::Processor{id:"board-organizer".into(),version:"0.2.5".into()};
    let board=store.development_board(&actor).await?;
    if board.id==source{return Ok(board)}
    let identity=format!("{:x}",Sha256::digest(serde_json::to_vec(&original.node.body).map_err(|_|xenica_core::DomainError::Invalid("原件无法编码".into()))?));
    let mut body=board.body.clone();
    let mut origins=body.get("attachedArchives").and_then(Value::as_array).cloned().unwrap_or_default();
    if origins.iter().any(|o|o["source"]==source.to_string()&&o["sha256"]==identity){return Ok(board)}
    let existing=body["scene"]["elements"].as_array().cloned().unwrap_or_default();
    let mut elements=original.node.body["scene"]["elements"].as_array().cloned().unwrap_or_default();
    let map:HashMap<String,String>=elements.iter().filter_map(|e|e["id"].as_str()).map(|id|(id.to_owned(),format!("archive-{:x}",Sha256::digest(format!("{source}/{identity}/{id}"))))).collect();
    fn remap(value:&mut Value,map:&HashMap<String,String>) {
        match value {
            Value::Object(object)=>for(key,value)in object {
                if matches!(key.as_str(),"id"|"containerId"|"frameId"|"elementId") && let Some(next)=value.as_str().and_then(|s|map.get(s)){*value=Value::String(next.clone());}
                else{remap(value,map)}
            },
            Value::Array(array)=>for value in array{remap(value,map)},
            _=>{},
        }
    }
    for element in &mut elements {remap(element,&map);}
    let mut merged=existing;merged.extend(elements);
    body["scene"]["elements"]=json!(merged);
    origins.push(json!({"source":source,"revision":original.node.updated_at,"sha256":identity}));
    body["attachedArchives"]=json!(origins);
    store.update_node_checked(&actor,board.id,xenica_core::NodePatch{title:None,body:Some(body)},Some(board.updated_at)).await
}

fn remap(value: &mut Value, ids: &HashMap<String, String>) {
    match value {
        Value::String(text) => {
            for (old, new) in ids {
                *text = text.replace(old, new);
            }
        }
        Value::Array(items) => {
            for item in items {
                remap(item, ids);
            }
        }
        Value::Object(map) => {
            let old = std::mem::take(map);
            for (key, mut value) in old {
                remap(&mut value, ids);
                map.insert(ids.get(&key).cloned().unwrap_or(key), value);
            }
        }
        _ => {}
    }
}

/// 只创建，不覆盖目标中的同 ID 档案；可用于未升级的正式存储，不自动迁移表。
pub async fn import(store: &Store, archive: Archive) -> anyhow::Result<Node> {
    anyhow::ensure!(
        archive.format == "xenica-sketch-archive/v1" && archive.node.kind == "sketch",
        "不是草图档案"
    );
    match store.get_node(archive.node.id).await {
        Err(StoreError::Domain(xenica_core::DomainError::NotFound)) => {}
        Ok(_) => anyhow::bail!("目标已有同 ID 草图，未覆盖"),
        Err(error) => return Err(error.into()),
    }
    let supplied: BTreeSet<_> = archive.files.iter().map(|file| file.id).collect();
    anyhow::ensure!(supplied.len() == archive.files.len(), "档案有重复文件 ID");
    let mut required = BTreeSet::new();
    file_ids(&archive.node.body, &mut required);
    for snapshot in &archive.history {
        file_ids(snapshot, &mut required);
    }
    anyhow::ensure!(required.is_subset(&supplied), "档案缺少原图，未导入");
    for file in &archive.files {
        anyhow::ensure!(
            matches!(
                file.mime.as_str(),
                "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/avif"
            ) && !file.bytes.is_empty()
                && file.bytes.len() <= crate::routes::files::MAX_FILE_BYTES,
            "档案图片格式或大小不合法"
        );
        anyhow::ensure!(
            format!("{:x}", Sha256::digest(&file.bytes)) == file.sha256,
            "档案原图校验失败"
        );
    }
    let actor = Actor::Processor {
        id: "sketch-archive-import".into(),
        version: "1".into(),
    };
    let mut ids = HashMap::new();
    for file in archive.files {
        let id = store
            .put_file(&actor, &file.sha256, &file.mime, &file.bytes)
            .await?;
        ids.insert(file.id.to_string(), id.to_string());
    }
    let mut body = archive.node.body;
    body["archiveHistory"] = json!(archive.history);
    body["archiveOrigin"] = json!({"revision":archive.node.updated_at,"node":archive.node.id});
    remap(&mut body, &ids);
    Ok(store
        .create_node(
            &actor,
            NewNode {
                id: Some(archive.node.id),
                kind: Some("sketch".into()),
                title: archive.node.title,
                body: Some(body),
            },
        )
        .await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remaps_images_and_embedded_file_ids() {
        let mut body = json!({"fileIds":{"old":"old"},"md":"![](/api/files/old)","scene":{"elements":[{"fileId":"old"}]}});
        remap(&mut body, &HashMap::from([("old".into(), "new".into())]));
        assert_eq!(body["fileIds"]["new"], "new");
        assert_eq!(body["scene"]["elements"][0]["fileId"], "new");
        assert_eq!(body["md"], "![](/api/files/new)");
    }
}
