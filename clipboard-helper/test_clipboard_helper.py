import json
from pathlib import Path
import tempfile
import unittest
from clipboard_helper import FileMailbox

class HelperTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.root = Path(self.temporary.name)
        self.writes = []
        self.config = {'stateFile': str(self.root / 'state.json'), 'journalDir': str(self.root),
                       'checkpointFile': str(self.root / 'last-request.json'), 'tabId': 'survey', 'token': 'a' * 64}
        self.box = FileMailbox(self.config, self.writes.append)

    def tearDown(self):
        self.root.resolve().relative_to(Path(__file__).resolve().parent)
        self.temporary.cleanup()

    def request(self, **overrides):
        request = {'id': 'request-1', 'action': 'clipboard', 'text': 'Pyurks LY-F d12-7',
                   'token': self.config['token'], 'expiresAt': 105000, **overrides}
        state = {'tabs': {'survey': {'survey.clipboardRequest': request}, 'unrelated': {'keep': True}}}
        Path(self.config['stateFile']).write_text(json.dumps(state), encoding='utf-8')
        self.box.tick(now=100)
        self.assertEqual(json.loads(Path(self.config['stateFile']).read_text()), state)
        return json.loads(self.box.reply_path.read_text())

    def test_copy_acknowledgment_and_deduplication_survive_restart(self):
        self.assertTrue(self.request()['ok'])
        self.box.tick(now=101)
        self.box = FileMailbox(self.config, self.writes.append)
        self.box.tick(now=102)
        self.assertEqual(self.writes, ['Pyurks LY-F d12-7'])

    def test_health_does_not_touch_clipboard(self):
        self.assertTrue(self.request(action='health')['ok'])
        self.assertEqual(self.writes, [])

    def test_token_and_selected_tab_are_required(self):
        self.assertNotIn('requestId', self.request(token='wrong'))
        self.box.config['tabId'] = 'another-tab'
        self.box.tick(now=103)
        self.assertEqual(self.writes, [])

    def test_expired_requests_never_copy_on_restart(self):
        self.assertFalse(self.request(expiresAt=99000)['ok'])
        self.assertEqual(self.writes, [])

    def test_invalid_text_and_unknown_operations_are_rejected(self):
        for i, text in enumerate(['', 42, 'a\0b', '\ud800', 'x' * 16385]):
            self.assertFalse(self.request(id=str(i), text=text)['ok'])
        self.assertFalse(self.request(id='unsupported', action='read')['ok'])
        self.assertEqual(self.writes, [])

    def test_native_failure_is_reported_without_false_success(self):
        def fail(text):
            raise OSError('busy')
        self.box.writer = fail
        self.assertFalse(self.request()['ok'])

    def test_partial_state_file_is_never_repaired_or_copied(self):
        Path(self.config['stateFile']).write_text('{')
        self.box.tick(now=100)
        self.assertEqual(Path(self.config['stateFile']).read_text(), '{')
        self.assertEqual(self.writes, [])

if __name__ == '__main__':
    unittest.main()
