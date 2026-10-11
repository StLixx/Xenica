"""将用户原生导出转换为可迁移档案；只生成文件，不连接或覆盖数据库。"""
import argparse
import base64
import copy
import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path


def convert(raw, node_id, title):
    scene = json.loads(raw)
    if scene.get('type') != 'excalidraw' or not isinstance(scene.get('elements'), list):
        raise ValueError('不是 Excalidraw 导出文件')
    # 不保留浏览器状态；拒绝文字/链接中的凭据。截图须另外检查，档案不是公开材料。
    if re.search(r'/api/share/|(?:token|password|secret|api_key)=',
                 json.dumps(scene['elements']), re.I):
        raise ValueError('画布包含凭据链接，请先在独立副本中处理')
    ids, files = {}, []
    for old_id, file in scene.get('files', {}).items():
        match = re.fullmatch(r'data:(image/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)', file['dataURL'])
        if not match:
            raise ValueError('原图格式不合法')
        data = base64.b64decode(re.sub(r'\s', '', match[2]), validate=True)
        digest = hashlib.sha256(data).hexdigest()
        image_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f'xenica:image:{digest}'))
        ids[old_id] = image_id
        if not any(item['id'] == image_id for item in files):
            files.append(dict(id=image_id, mime=match[1], sha256=digest, bytes=list(data)))
    elements = copy.deepcopy(scene['elements'])
    for element in elements:
        if element.get('fileId'):
            element['fileId'] = ids[element['fileId']]
        if element.get('fileIds'):
            element['fileIds'] = {key: ids[value] for key, value in element['fileIds'].items()}
    now = datetime.now(timezone.utc).isoformat()
    body = dict(scene=dict(type='excalidraw', version=2, source='xenica', elements=elements),
                originalExport=dict(sha256=hashlib.sha256(raw).hexdigest(),
                                    format='excalidraw', retainedElements=len(elements)))
    return dict(format='xenica-sketch-archive/v1', history=[], files=files,
                node=dict(id=str(uuid.UUID(node_id)), kind='sketch', title=title, body=body,
                          created_at=now, updated_at=now))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--id', required=True)
    parser.add_argument('--title', required=True)
    args = parser.parse_args()
    # 拒绝覆盖既有原件或档案。
    archive = convert(args.input.read_bytes(), args.id, args.title)
    with args.output.open('x', encoding='utf-8') as output:
        json.dump(archive, output, ensure_ascii=False)
