"""预览档案区分源码相同但产物不同的构建，不覆盖已有快照。"""
import re


def archive_id(version, project, source, digest):
    assert re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+', version)
    assert re.fullmatch(r'xenica(?:-pr-[1-9][0-9]*)?', project)
    assert re.fullmatch(r'[a-f0-9]{40}', source)
    assert re.fullmatch(r'sha256:[a-f0-9]{64}', digest)
    return version if project == 'xenica' else version + '-' + source[:12] + '-' + digest[7:19]
