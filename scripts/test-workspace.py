import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('workspace', Path(__file__).resolve().parents[1] / 'deploy/deployer/bootstrap-workspace.py')
workspace = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workspace)


class WorkspaceTests(unittest.TestCase):
    def test_migration_only_relocates_derived_current_page(self):
        address = 'https://pr-55.xenica.truebigsand.top/?view=graph'
        page = {'customData': {'xenicaEmbed': {'kind': 'page', 'url': address}}, 'link': address}
        original = {'node': {'body': {'scene': {'elements': [page, {'text': address}, {'customData': {'xenicaEmbed': {'kind': 'web', 'url': address}}}]}}}, 'history': [{'scene': {'elements': [copy.deepcopy(page)]}}], 'files': [{'bytes': [1, 2, 3]}]}
        retained = copy.deepcopy(original)
        migrated = workspace.relocate(original, 'pr-55.xenica.truebigsand.top')
        changed = migrated['node']['body']['scene']['elements'][0]
        self.assertEqual(changed['link'], 'https://excalidraw.xenica.truebigsand.top/?view=graph&experience=1')
        self.assertEqual(changed['customData']['xenicaEmbed']['url'], changed['link'])
        self.assertEqual(migrated['history'], retained['history'])
        self.assertEqual(migrated['files'], retained['files'])
        self.assertEqual(migrated['node']['body']['scene']['elements'][1:], retained['node']['body']['scene']['elements'][1:])
        self.assertEqual(workspace.relocate(copy.deepcopy(migrated), 'pr-55.xenica.truebigsand.top'), migrated)


if __name__ == '__main__':
    unittest.main()
