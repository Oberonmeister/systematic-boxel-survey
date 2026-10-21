# Survey Clipboard Helper

This optional Windows helper copies the next survey target while Elite has focus. JACoB Alpha0.2.19 / SDK15 and later provide native clipboard support, preferred by the extension's **Automatic — prefer JACoB** mode. Use this helper for older hosts or select it explicitly as an alternative. It does not switch windows, press keys or plot a route. Python 3 is required; there are no third-party Python packages.

## Install

Save the Systematic Boxel Survey tab first. Run the installer with its saved tab ID (from JACoB's `custom-tabs.json`) and the journal directory configured in JACoB:

```powershell
.\Install-ClipboardHelper.ps1 -TabId 'your-saved-tab-id' -JournalDirectory 'C:\YourJournalFolder' -StartWithWindows
```

`-PythonPath` optionally specifies a Python executable. Otherwise the installer looks for the Codex bundled runtime, then `python.exe`. `-StartWithWindows` creates a per-user Startup shortcut; omit it for manual startup. No administrator rights are needed when the journal folder is writable by your account.

The installer prints the path to `connection.json`. In the survey, expand **Clipboard helper connection**, choose **Connect clipboard helper** and select that file. Alternatively paste its contents into the provided field. A successful connection checks the full request/acknowledgment path. Enable **Copy target when it changes**. Select **Clipboard method → Local clipboard helper** to use it explicitly; Automatic uses it only when the native API is absent or reports unavailable. A native write error never silently switches to the helper.

Keep `connection.json` private to your computer. Share the source package, not your personal connection file or JACoB state file. The distributable contains no connection credentials.

## Files and operation

- Installation: `%LOCALAPPDATA%\SystematicBoxelSurveyClipboard`.
- Start menu shortcut: **Survey Clipboard Helper**. It can safely be started again; only one instance runs.
- Requests: this saved tab's `survey.clipboardRequest` key in JACoB's `tab-state.json`. Only JACoB writes that file; the helper reads it.
- Replies: the helper's own `SurveyClipboardStatus.json` in the journal directory. JACoB's existing companion-file watcher exposes replies through `Elite.data`.
- A local checkpoint prevents repeating a completed request after restart. Requests expire after ten seconds, so an old target will not overwrite the clipboard when the helper starts later.
- Each request requires the installation token and comes from the configured tab ID. Replies contain only a request ID, success/error and timestamp. No text or token is logged in replies.
- The helper opens no network port, contacts no website and never edits game journal files. It writes text and verifies only that text while it has the clipboard open; it does not retrieve or expose previous clipboard contents.
- The tab says **Copied** only after the helper confirms the matching write. Large manual list copies over 16,384 characters use the browser's normal user-initiated clipboard path.

If copying times out, start the shortcut and verify the journal folder still matches JACoB settings. Rerun the installer with the new folder if it changes. Startup errors are in `helper-error.log` inside the installation folder.

## Disable or remove

To switch to native copying, select **Automatic — prefer JACoB**, click **Copy Target**, grant the host clipboard permission if prompted, and check that the status says **JACoB native clipboard active**. Keep **Copy target when it changes** enabled. After testing a target change, use **Disconnect clipboard helper**, then run `Stop-ClipboardHelper.ps1` to stop the process and remove its Windows startup shortcut. Disconnecting alone does not stop the helper process. Native copying remains enabled.

If native support is unavailable and you want to stop all automatic copying, turn off **Copy target when it changes** before disconnecting. The stop script leaves installation/configuration files and survey data available for recovery. The status file is harmless and may be removed after the helper stops. You can restart the **Survey Clipboard Helper** shortcut and reconnect later.

## Tests

```text
python -m unittest discover -s clipboard-helper
```

The tests use temporary state files and a fake clipboard, covering successful acknowledgment, authentication, selected-tab isolation, expiration, restart deduplication, rejected input, native failures and incomplete state files.
