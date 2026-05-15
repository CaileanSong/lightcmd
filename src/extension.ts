import { TextDecoder, TextEncoder } from 'node:util';
import * as vscode from 'vscode';

interface CommandRecord {
	command: string;
	usageCount: number;
	firstUsedAt: number;
	lastUsedAt: number;
	favorite: boolean;
	cwd?: string;
}

interface CommandQuickPickItem extends vscode.QuickPickItem {
	command: string;
}

interface LightCmdExportData {
	version: 1;
	exportedAt: number;
	records: CommandRecord[];
}

const STORAGE_KEY = 'lightcmd.commandHistory';
const DEFAULT_MAX_HISTORY = 300;
const DEFAULT_MAX_COMMAND_LENGTH = 1000;
const commandHistory: CommandRecord[] = [];

function normalizeCommand(command: string): string {
	return command.trim().replace(/\s+/g, ' ');
}

function getMaxHistory(): number {
	const configured = vscode.workspace
		.getConfiguration('lightcmd')
		.get<number>('maxHistory', DEFAULT_MAX_HISTORY);

	return Math.max(1, configured);
}

function getMaxCommandLength(): number | undefined {
	const configured = vscode.workspace
		.getConfiguration('lightcmd')
		.get<number>('maxCommandLength', DEFAULT_MAX_COMMAND_LENGTH);

	return configured > 0 ? configured : undefined;
}

function shouldRecordCommand(command: string): boolean {
	if (!command) {
		return false;
	}

	if (command.startsWith('LightCmd:')) {
		return false;
	}

	const maxCommandLength = getMaxCommandLength();

	if (maxCommandLength && command.length > maxCommandLength) {
		return false;
	}

	return true;
}

function normalizeRecord(record: Partial<CommandRecord>): CommandRecord | undefined {
	if (typeof record.command !== 'string') {
		return undefined;
	}

	const command = normalizeCommand(record.command);

	if (!command) {
		return undefined;
	}

	const now = Date.now();

	return {
		command,
		usageCount: Math.max(1, record.usageCount || 1),
		firstUsedAt: record.firstUsedAt || now,
		lastUsedAt: record.lastUsedAt || now,
		favorite: Boolean(record.favorite),
		cwd: typeof record.cwd === 'string' ? record.cwd : undefined,
	};
}

function loadCommandHistory(context: vscode.ExtensionContext): CommandRecord[] {
	return context.workspaceState
		.get<CommandRecord[]>(STORAGE_KEY, [])
		.map(normalizeRecord)
		.filter((record): record is CommandRecord => Boolean(record));
}

async function saveCommandHistory(context: vscode.ExtensionContext): Promise<void> {
	await context.workspaceState.update(STORAGE_KEY, commandHistory);
}

function sortCommandHistory(): void {
	commandHistory.sort((a, b) => {
		if (a.favorite !== b.favorite) {
			return a.favorite ? -1 : 1;
		}

		if (a.usageCount !== b.usageCount) {
			return b.usageCount - a.usageCount;
		}

		return b.lastUsedAt - a.lastUsedAt;
	});

	if (commandHistory.length > getMaxHistory()) {
		commandHistory.splice(getMaxHistory());
	}
}

function createCommandQuickPickItems(): Array<CommandQuickPickItem | vscode.QuickPickItem> {
	const favoriteRecords = commandHistory.filter((record) => record.favorite);
	const normalRecords = commandHistory.filter((record) => !record.favorite);
	const items: Array<CommandQuickPickItem | vscode.QuickPickItem> = [];

	if (favoriteRecords.length > 0) {
		items.push({
			label: 'Favorite',
			kind: vscode.QuickPickItemKind.Separator,
		});

		items.push(...favoriteRecords.map(createCommandQuickPickItem));
	}

	if (normalRecords.length > 0) {
		items.push({
			label: 'Normal',
			kind: vscode.QuickPickItemKind.Separator,
		});

		items.push(...normalRecords.map(createCommandQuickPickItem));
	}

	return items;
}

function createCommandQuickPickItem(record: CommandRecord): CommandQuickPickItem {
	return {
		label: record.command,
		description: `used ${record.usageCount}`,
		detail: record.cwd,
		command: record.command,
	};
}

function isCommandQuickPickItem(
	item: CommandQuickPickItem | vscode.QuickPickItem | undefined
): item is CommandQuickPickItem {
	return Boolean(item && 'command' in item);
}

function recordCommand(commandLine: string, cwd: string | undefined): boolean {
	const command = normalizeCommand(commandLine);

	if (!shouldRecordCommand(command)) {
		return false;
	}

	const now = Date.now();
	const existing = commandHistory.find((record) => record.command === command);

	if (existing) {
		existing.usageCount += 1;
		existing.lastUsedAt = now;
		existing.cwd = cwd ?? existing.cwd;
	} else {
		commandHistory.push({
			command,
			usageCount: 1,
			firstUsedAt: now,
			lastUsedAt: now,
			favorite: false,
			cwd,
		});
	}

	sortCommandHistory();
	return true;
}

async function pickCommand(placeHolder: string): Promise<CommandQuickPickItem | undefined> {
	if (commandHistory.length === 0) {
		vscode.window.showInformationMessage('LightCmd has no command history yet.');
		return undefined;
	}

	const selected = await vscode.window.showQuickPick(createCommandQuickPickItems(), {
		placeHolder,
		matchOnDescription: true,
		matchOnDetail: true,
	});

	if (!isCommandQuickPickItem(selected)) {
		return undefined;
	}

	return selected;
}

async function showCommands(): Promise<void> {
	const selected = await pickCommand('Search terminal commands');

	if (!selected) {
		return;
	}

	const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal('LightCmd');
	terminal.show();
	terminal.sendText(selected.command);
}

async function toggleFavorite(context: vscode.ExtensionContext): Promise<void> {
	const selected = await pickCommand('Select a command to favorite or unfavorite');

	if (!selected) {
		return;
	}

	const record = commandHistory.find((item) => item.command === selected.command);

	if (!record) {
		return;
	}

	record.favorite = !record.favorite;
	sortCommandHistory();
	await saveCommandHistory(context);

	const action = record.favorite ? 'Favorited' : 'Unfavorited';
	vscode.window.showInformationMessage(`${action}: ${record.command}`);
}

async function deleteCommand(context: vscode.ExtensionContext): Promise<void> {
	const selected = await pickCommand('Select a command to delete');

	if (!selected) {
		return;
	}

	const confirmation = await vscode.window.showWarningMessage(
		`Delete "${selected.command}" from LightCmd history?`,
		{ modal: true },
		'Delete'
	);

	if (confirmation !== 'Delete') {
		return;
	}

	const index = commandHistory.findIndex((record) => record.command === selected.command);

	if (index >= 0) {
		commandHistory.splice(index, 1);
		await saveCommandHistory(context);
		vscode.window.showInformationMessage(`Deleted: ${selected.command}`);
	}
}

async function clearHistory(context: vscode.ExtensionContext): Promise<void> {
	if (commandHistory.length === 0) {
		vscode.window.showInformationMessage('LightCmd history is already empty.');
		return;
	}

	const confirmation = await vscode.window.showWarningMessage(
		`Clear all ${commandHistory.length} LightCmd commands?`,
		{ modal: true },
		'Clear History'
	);

	if (confirmation !== 'Clear History') {
		return;
	}

	commandHistory.splice(0, commandHistory.length);
	await saveCommandHistory(context);
	vscode.window.showInformationMessage('LightCmd history cleared.');
}

async function exportCommands(): Promise<void> {
	const uri = await vscode.window.showSaveDialog({
		defaultUri: vscode.Uri.file('lightcmd-history.json'),
		filters: {
			JSON: ['json'],
		},
		saveLabel: 'Export',
		title: 'Export LightCmd History',
	});

	if (!uri) {
		return;
	}

	const exportData: LightCmdExportData = {
		version: 1,
		exportedAt: Date.now(),
		records: commandHistory,
	};

	const content = JSON.stringify(exportData, null, 2);
	await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
	vscode.window.showInformationMessage(`Exported ${commandHistory.length} LightCmd commands.`);
}

async function importCommands(context: vscode.ExtensionContext): Promise<void> {
	const uris = await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectFolders: false,
		canSelectMany: false,
		filters: {
			JSON: ['json'],
		},
		openLabel: 'Import',
		title: 'Import LightCmd History',
	});

	if (!uris?.[0]) {
		return;
	}

	const raw = await vscode.workspace.fs.readFile(uris[0]);
	let parsed: Partial<LightCmdExportData>;

	try {
		parsed = JSON.parse(new TextDecoder().decode(raw)) as Partial<LightCmdExportData>;
	} catch {
		vscode.window.showErrorMessage('Invalid LightCmd import file.');
		return;
	}

	if (!Array.isArray(parsed.records)) {
		vscode.window.showErrorMessage('Invalid LightCmd import file.');
		return;
	}

	let importedCount = 0;

	for (const importedRecord of parsed.records) {
		const record = normalizeRecord(importedRecord);

		if (!record) {
			continue;
		}

		mergeCommandRecord(record);
		importedCount += 1;
	}

	sortCommandHistory();
	await saveCommandHistory(context);
	vscode.window.showInformationMessage(`Imported ${importedCount} LightCmd commands.`);
}

function mergeCommandRecord(importedRecord: CommandRecord): void {
	const existing = commandHistory.find((record) => record.command === importedRecord.command);

	if (!existing) {
		commandHistory.push(importedRecord);
		return;
	}

	existing.usageCount += importedRecord.usageCount;
	existing.firstUsedAt = Math.min(existing.firstUsedAt, importedRecord.firstUsedAt);
	existing.lastUsedAt = Math.max(existing.lastUsedAt, importedRecord.lastUsedAt);
	existing.favorite = existing.favorite || importedRecord.favorite;
	existing.cwd = importedRecord.cwd ?? existing.cwd;
}

export function activate(context: vscode.ExtensionContext): void {
	commandHistory.splice(0, commandHistory.length, ...loadCommandHistory(context));
	sortCommandHistory();

	const terminalExecutionListener = vscode.window.onDidEndTerminalShellExecution((event) => {
		const recorded = recordCommand(event.execution.commandLine.value, event.execution.cwd?.fsPath);

		if (!recorded) {
			return;
		}

		void saveCommandHistory(context);
		vscode.window.setStatusBarMessage(
			`LightCmd captured: ${event.execution.commandLine.value}`,
			2000
		);
	});

	const showCommandsDisposable = vscode.commands.registerCommand(
		'lightcmd.showCommands',
		showCommands
	);
	const toggleFavoriteDisposable = vscode.commands.registerCommand(
		'lightcmd.toggleFavorite',
		() => toggleFavorite(context)
	);
	const deleteCommandDisposable = vscode.commands.registerCommand(
		'lightcmd.deleteCommand',
		() => deleteCommand(context)
	);
	const clearHistoryDisposable = vscode.commands.registerCommand(
		'lightcmd.clearHistory',
		() => clearHistory(context)
	);
	const exportCommandsDisposable = vscode.commands.registerCommand(
		'lightcmd.exportCommands',
		exportCommands
	);
	const importCommandsDisposable = vscode.commands.registerCommand(
		'lightcmd.importCommands',
		() => importCommands(context)
	);

	context.subscriptions.push(
		terminalExecutionListener,
		showCommandsDisposable,
		toggleFavoriteDisposable,
		deleteCommandDisposable,
		clearHistoryDisposable,
		exportCommandsDisposable,
		importCommandsDisposable
	);
}

export function deactivate(): void {}
