// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

//数组基本值 
interface CommandRecord {
	command: string;
	usageCount: number;
	firstUsedAt: number;
	lastUsedAt: number;
}
// 历史数组
const commandHistory: CommandRecord[] = []
function normalizeCommand(command: string): string {
	return command.trim().replace(/\s+/g, ' ');
}

const MAX_HISTORY = 300;

const STORAGE_KEY = 'lightcmd.commandHistory';
function loadCommandHistory(context: vscode.ExtensionContext): CommandRecord[] {
	return context.workspaceState.get<CommandRecord[]>(STORAGE_KEY, [])
}
async function saveCommandHistory(context: vscode.ExtensionContext): Promise<void> {
	await context.workspaceState.update(STORAGE_KEY, commandHistory)
}


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	commandHistory.push(...loadCommandHistory(context))
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "lightcmd" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	// 监听
	const terminalExecutionListener = vscode.window.onDidEndTerminalShellExecution((event) => {
		const commandLine = event.execution.commandLine.value;
		// vscode.window.showInformationMessage(`Captured:${commandLine}`)
		const command = normalizeCommand(commandLine)
		if (!command) {
			return
		}
		const now = Date.now();
		const existing = commandHistory.find((record) => record.command === command)
		if (existing) {
			existing.usageCount += 1;
			existing.lastUsedAt = now
		} else {
			commandHistory.push({
				command,
				usageCount: 1,
				firstUsedAt: now,
				lastUsedAt: now
			})
		}
		// 排序
		commandHistory.sort((a, b) => {
			if (a.usageCount != b.usageCount) {
				return b.usageCount - a.usageCount;
			}

			return b.lastUsedAt - a.lastUsedAt
		})

		if (commandHistory.length > MAX_HISTORY) {
			commandHistory.splice(MAX_HISTORY)
		}

		void saveCommandHistory(context)

		vscode.window.setStatusBarMessage(`LightCmd captured: ${command}`, 2000)
	})
	context.subscriptions.push(terminalExecutionListener)
	// 主命令
	const disposable = vscode.commands.registerCommand('lightcmd.showCommands', async () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		// vscode.window.showInformationMessage('LightCmd command launcher');
		const selected = await vscode.window.showQuickPick(
			commandHistory.map((record) => ({
				label: record.command,
				description: `used ${record.usageCount}`
			}))
			,
			{
				placeHolder: 'search terminal commands'
			}
		);
		if (selected) {
			// vscode.window.showInformationMessage(`Selected: ${selected}`)
			const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal('LightCmd');
			terminal.show()
			terminal.sendText(selected.label);
		}
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
