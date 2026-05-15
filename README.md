# LightCmd

LightCmd is a lightweight terminal command history launcher for VS Code.

It passively records terminal commands you actually run, then lets you reopen them from a fast searchable picker.

## Features

- Capture real terminal commands with VS Code Shell Integration
- Open command history with a keyboard shortcut
- Search and run previous commands from Quick Pick
- Track usage count and recent usage
- Pin favorite commands
- Show Favorite and Normal sections in the picker
- Delete individual commands
- Clear all workspace command history
- Export command history to JSON
- Import and merge command history from JSON
- Keep history per workspace with VS Code `workspaceState`

## Usage

Run commands normally in the VS Code terminal. LightCmd records completed shell commands automatically.

Open the picker:

- macOS: `Cmd+Shift+L`
- Windows/Linux: `Ctrl+Alt+L`
- Command Palette: `LightCmd: Show Commands`

Select a command to send it to the active terminal. If no terminal exists, LightCmd creates one.

## Commands

- `LightCmd: Show Commands`
- `LightCmd: Toggle Favorite`
- `LightCmd: Delete Command`
- `LightCmd: Clear History`
- `LightCmd: Export Commands`
- `LightCmd: Import Commands`

## Settings

This extension contributes the following setting:

```json
{
  "lightcmd.maxHistory": 300,
  "lightcmd.maxCommandLength": 1000
}
```

Set `lightcmd.maxCommandLength` to `0` to disable the length limit.

## Requirements

LightCmd relies on VS Code Terminal Shell Integration to capture completed terminal commands.

If commands are not captured, make sure this VS Code setting is enabled:

```json
{
  "terminal.integrated.shellIntegration.enabled": true
}
```

## Import and Export

Export creates a JSON file with this shape:

```json
{
  "version": 1,
  "exportedAt": 1710000000000,
  "records": []
}
```

Import merges records by command text, combines usage counts, keeps the earliest first-used time, keeps the latest last-used time, and preserves favorite state.

## Privacy

LightCmd stores command history locally in VS Code workspace storage. It does not send command history to any external service.

## Known Issues

- Commands are captured only when VS Code Shell Integration reports them.
- History is stored per workspace in the current MVP.
- Multi-line or low-confidence shell commands may not always be captured exactly as typed.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).
