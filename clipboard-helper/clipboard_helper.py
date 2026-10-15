"""Local, write-only clipboard bridge for the Systematic Boxel Survey tab.

No third-party dependencies or network listener. Reads this tab's authenticated
requests from JACoB storage and writes its own companion status file.
Verifies only its own clipboard write; never exports clipboard contents,
edits journals, or sends game input.
"""
import argparse
import ctypes
import hmac
import json
import os
from pathlib import Path
import time


class WindowsClipboard:
    def __init__(self):
        from ctypes import wintypes as w
        self.user = ctypes.WinDLL('user32', use_last_error=True)
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.user.CreateWindowExW.argtypes = [w.DWORD, w.LPCWSTR, w.LPCWSTR, w.DWORD,
                                            ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                            ctypes.c_int, w.HWND, w.HMENU, w.HINSTANCE, w.LPVOID]
        self.user.CreateWindowExW.restype = w.HWND
        self.user.OpenClipboard.argtypes = [w.HWND]
        self.user.OpenClipboard.restype = w.BOOL
        self.user.EmptyClipboard.restype = w.BOOL
        self.user.CloseClipboard.restype = w.BOOL
        self.user.SetClipboardData.argtypes = [w.UINT, w.HANDLE]
        self.user.SetClipboardData.restype = w.HANDLE
        self.user.GetClipboardData.argtypes = [w.UINT]
        self.user.GetClipboardData.restype = w.HANDLE
        self.kernel.GlobalAlloc.argtypes = [w.UINT, ctypes.c_size_t]
        self.kernel.GlobalAlloc.restype = w.HGLOBAL
        self.kernel.GlobalLock.argtypes = [w.HGLOBAL]
        self.kernel.GlobalLock.restype = w.LPVOID
        self.kernel.GlobalUnlock.argtypes = [w.HGLOBAL]
        self.kernel.GlobalFree.argtypes = [w.HGLOBAL]
        # A message-only, invisible owner: clipboard writes never activate a window.
        self.window = self.user.CreateWindowExW(0, 'STATIC', 'Survey Clipboard Helper',
                                                0, 0, 0, 0, 0, w.HWND(-3), None, None, None)
        if not self.window:
            raise ctypes.WinError(ctypes.get_last_error())

    def write(self, text):
        raw = (text + '\0').encode('utf-16-le')
        handle = self.kernel.GlobalAlloc(0x0002, len(raw))  # GMEM_MOVEABLE
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            address = self.kernel.GlobalLock(handle)
            if not address:
                raise ctypes.WinError(ctypes.get_last_error())
            try:
                ctypes.memmove(address, raw, len(raw))
            finally:
                self.kernel.GlobalUnlock(handle)
            for attempt in range(10):
                if self.user.OpenClipboard(self.window):
                    break
                time.sleep(.05)
            else:
                raise OSError('Windows clipboard is busy; retry copying.')
            try:
                if not self.user.EmptyClipboard() or not self.user.SetClipboardData(13, handle):
                    raise ctypes.WinError(ctypes.get_last_error())
                handle = None  # Windows now owns the memory.
                # Verify only the text just written, while we still own the
                # open clipboard. No clipboard contents are returned or logged.
                copied = self.user.GetClipboardData(13)
                copied_address = self.kernel.GlobalLock(copied)
                if not copied_address:
                    raise OSError('Could not verify the clipboard write.')
                try:
                    if ctypes.string_at(copied_address, len(raw)) != raw:
                        raise OSError('Clipboard write verification failed.')
                finally:
                    self.kernel.GlobalUnlock(copied)
            finally:
                self.user.CloseClipboard()
        finally:
            if handle:
                self.kernel.GlobalFree(handle)


class FileMailbox:
    """Use only JACoB's documented store and companion-file services for IPC."""
    def __init__(self, config, writer):
        self.config, self.writer = config, writer
        self.state_path = Path(config['stateFile'])
        self.reply_path = Path(config['journalDir']) / 'SurveyClipboardStatus.json'
        self.checkpoint = Path(config['checkpointFile'])
        self.seen = ''
        self.response = {}
        self.last_write = 0
        if self.checkpoint.exists():
            try:
                self.response = json.loads(self.checkpoint.read_text(encoding='utf-8'))
                self.seen = self.response.get('requestId', '')
            except (OSError, ValueError):
                pass

    @staticmethod
    def atomic_json(path, data):
        temporary = path.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(data), encoding='utf-8')
        os.replace(temporary, path)

    def tick(self, now=None):
        now = time.time() if now is None else now
        try:
            state = json.loads(self.state_path.read_text(encoding='utf-8-sig'))
        except (OSError, ValueError):
            return  # JACoB owns this file. Never write or repair it here.
        request = state.get('tabs', {}).get(self.config['tabId'], {}).get('survey.clipboardRequest')
        if isinstance(request, dict) and isinstance(request.get('token'), str) and hmac.compare_digest(request['token'], self.config['token']):
            request_id = request.get('id')
            if isinstance(request_id, str) and 0 < len(request_id) <= 100 and request_id != self.seen:
                self.seen = request_id
                response = {'requestId': request_id, 'ok': False}
                try:
                    expires = request.get('expiresAt')
                    if not isinstance(expires, (float, int)) or not now * 1000 <= expires <= (now + 30) * 1000:
                        raise ValueError('Clipboard request expired; retry copying.')
                    if request.get('action') == 'clipboard':
                        text = request.get('text')
                        if not isinstance(text, str) or not 1 <= len(text) <= 16384 or '\0' in text:
                            raise ValueError('Invalid clipboard text.')
                        text.encode('utf-16-le')
                        self.writer(text)
                    elif request.get('action') != 'health':
                        raise ValueError('Unsupported clipboard operation.')
                    response['ok'] = True
                except (ValueError, UnicodeError, OSError) as error:
                    response['error'] = 'Windows clipboard is busy; retry copying.' if isinstance(error, OSError) else str(error)
                self.response = response
                self.atomic_json(self.checkpoint, response)
                self.last_write = 0
        if now - self.last_write >= 2:
            self.atomic_json(self.reply_path, {**self.response, 'format': 'survey-clipboard-status', 'version': 2, 'updatedAt': int(now * 1000)})
            self.last_write = now


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding='utf-8-sig'))
    if config.get('format') != 'survey-clipboard-helper' or config.get('transport') != 'jacob-store-v1' or len(config.get('token', '')) != 64:
        raise ValueError('Invalid helper configuration')
    if os.name != 'nt':
        raise OSError('This clipboard helper requires Windows.')
    from ctypes import wintypes as w
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateMutexW.argtypes = [w.LPVOID, w.BOOL, w.LPCWSTR]
    kernel.CreateMutexW.restype = w.HANDLE
    mutex = kernel.CreateMutexW(None, False, 'Local\\SystematicSurveyClipboard-' + config['token'][:16])
    if not mutex:
        raise ctypes.WinError(ctypes.get_last_error())
    if ctypes.get_last_error() == 183:
        return  # Another helper for this installation is already running.
    clipboard = WindowsClipboard()
    mailbox = FileMailbox(config, clipboard.write)
    while True:
        try:
            mailbox.tick()
        except OSError:
            pass  # Transient file locks are retried. The tab has a bounded timeout.
        time.sleep(.15)


if __name__ == '__main__':
    main()
