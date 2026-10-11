import base64
import importlib.util
import json
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('converter', Path(__file__).with_name('excalidraw-archive.py'))
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


class ArchiveConversion(unittest.TestCase):
    def convert(self, scene):
        return converter.convert(json.dumps(scene).encode(), '01a129d8-c553-771f-8a00-cda97efa5141', '原始表达')

    def test_retains_text_geometry_and_original_images(self):
        data = b'original-image'
        scene = dict(type='excalidraw', elements=[dict(id='text', type='text', text='用户原话', x=42),
                     dict(id='image', type='image', fileId='original')],
                     files=dict(original=dict(dataURL='data:image/png;base64,' + base64.b64encode(data).decode())),
                     appState=dict(selectedElementIds=dict(text=True)))
        archive = self.convert(scene)
        self.assertEqual(archive['node']['body']['scene']['elements'][0], scene['elements'][0])
        self.assertEqual(bytes(archive['files'][0]['bytes']), data)
        self.assertEqual(archive['node']['body']['scene']['elements'][1]['fileId'], archive['files'][0]['id'])
        self.assertNotIn('appState', archive['node']['body']['scene'])
        self.assertNotIn('purpose', archive['node']['body'])

    def test_missing_image_and_credential_links_fail_closed(self):
        for element in [dict(fileId='missing'), dict(link='https://example.com/api/share/private')]:
            with self.assertRaises((ValueError, KeyError)):
                self.convert(dict(type='excalidraw', elements=[element]))


if __name__ == '__main__':
    unittest.main()
