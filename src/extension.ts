import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			'jsonTableEditor.editor',
			new JsonTableEditorProvider(context),
			{ supportsMultipleEditorsPerDocument: false }
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('crafthub.toggleView', async () => {
			const uri = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
			if (uri instanceof vscode.TabInputCustom) {
				await vscode.commands.executeCommand('workbench.action.reopenTextEditor');
			} else if (uri instanceof vscode.TabInputText) {
				await vscode.commands.executeCommand('vscode.openWith', uri.uri, 'jsonTableEditor.editor');
			}
		})
	);
}


class JsonTableEditorProvider implements vscode.CustomTextEditorProvider {
	private clipboard: unknown[] = [];

	constructor(private readonly context: vscode.ExtensionContext) { }

	async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel
	): Promise<void> {
		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'webview')]
		};
		const styleUri = webviewPanel.webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'style.css')
		);
		const scriptUri = webviewPanel.webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'table.js')
		);
		let knownColumns: string[] = [];

		const allKeys = (arr: any[]) => [...new Set(arr.flatMap(r => Object.keys(r)))];

		const parseColumns = (text: string) => {
			try {
				const d = JSON.parse(text);
				if (Array.isArray(d) && d.length > 0) knownColumns = allKeys(d);
			} catch { }
		};

		webviewPanel.webview.html = this.getHtml(styleUri, scriptUri, webviewPanel.webview.cspSource);

		const sendData = () => {
			parseColumns(document.getText());
			try {
				const parsed = JSON.parse(document.getText());

				let data: object[];

				if (Array.isArray(parsed)) {
					data = parsed;
				} else if (typeof parsed === 'object' && parsed !== null) {
					data = [parsed];
				} else {
					webviewPanel.webview.postMessage({ type: 'renderError', message: 'JSON must be an object or array of objects' });
					return;
				}

				const columns = data.length > 0 ? allKeys(data) : knownColumns;
				webviewPanel.webview.postMessage({ type: 'renderTable', data, columns });
			} catch {
				webviewPanel.webview.postMessage({ type: 'renderError', message: 'Invalid JSON' });
			}
		};

		sendData();

		webviewPanel.webview.onDidReceiveMessage(async (msg) => {
			if (msg.type === 'ready') {
				sendData();
				return;
			}

			if (msg.type === 'edit') {
				const data = JSON.parse(document.getText());
				let newVal: unknown = msg.value;
				if (msg.valueType === 'json') {
					try { newVal = JSON.parse(msg.value); } catch { /* keep as string */ }
				}
				data[msg.row][msg.col] = newVal;
				const edit = new vscode.WorkspaceEdit();
				edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), JSON.stringify(data, null, 2));
				await vscode.workspace.applyEdit(edit);
			}

			if (msg.type === 'addColumn') {
				const defaults: Record<string, unknown> = {
					string: '', number: 0, bool: false, object: {}, array: []
				};
				const data = JSON.parse(document.getText());
				for (const row of data) {
					row[msg.name] = defaults[msg.dataType] ?? null;
				}
				const edit = new vscode.WorkspaceEdit();
				edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), JSON.stringify(data, null, 2));
				await vscode.workspace.applyEdit(edit);
			}

			if (msg.type === 'addRow') {
				const data = JSON.parse(document.getText());
				const template = data.length > 0 ? Object.fromEntries(Object.keys(data[0]).map(k => [k, ''])) : {};
				data.push(template);
				const edit = new vscode.WorkspaceEdit();
				edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), JSON.stringify(data, null, 2));
				await vscode.workspace.applyEdit(edit);
			}

			if (msg.type === 'deleteColumn') {
				const data = JSON.parse(document.getText());
				for (const row of data) {
					delete row[msg.name];
				}
				const edit = new vscode.WorkspaceEdit();
				edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), JSON.stringify(data, null, 2));
				await vscode.workspace.applyEdit(edit);
			}

			if (msg.type === 'renameColumn') {
				const data = JSON.parse(document.getText());
				for (const row of data) {
					if (Object.prototype.hasOwnProperty.call(row, msg.oldName)) {
						const entries = Object.entries(row);
						const idx = entries.findIndex(([k]) => k === msg.oldName);
						entries[idx] = [msg.newName, entries[idx][1]];
						const rebuilt: Record<string, unknown> = {};
						for (const [k, v] of entries) rebuilt[k] = v;
						for (const key of Object.keys(row)) delete row[key];
						Object.assign(row, rebuilt);
					}
				}
				const edit = new vscode.WorkspaceEdit();
				edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), JSON.stringify(data, null, 2));
				await vscode.workspace.applyEdit(edit);
			}

			if (msg.type === 'deleteRows') {
				const data = JSON.parse(document.getText());
				const toDelete = new Set(msg.rows as number[]);
				const newData = data.filter((_: unknown, i: number) => !toDelete.has(i));
				const edit = new vscode.WorkspaceEdit();
				edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), JSON.stringify(newData, null, 2));
				await vscode.workspace.applyEdit(edit);
			}

			if (msg.type === 'duplicateRows') {
				const data = JSON.parse(document.getText());
				const copies = (msg.rows as number[]).map((i: number) => ({ ...data[i] }));
				if (msg.mode === 'end') {
					data.push(...copies);
				} else {
					const insertAfter = Math.max(...msg.rows as number[]);
					data.splice(insertAfter + 1, 0, ...copies);
				}
				const edit = new vscode.WorkspaceEdit();
				edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), JSON.stringify(data, null, 2));
				await vscode.workspace.applyEdit(edit);
			}

			if (msg.type === 'getRows') {
				const data = JSON.parse(document.getText());
				const selected = (msg.rows as number[]).map((i: number) => data[i]);
				this.clipboard = selected;
				const text = msg.format === 'array'
					? JSON.stringify(selected, null, 2)
					: selected.map((r: unknown) => JSON.stringify(r, null, 2)).join(',\n');
				webviewPanel.webview.postMessage({ type: 'copyToClipboard', text });
			}

			if (msg.type === 'pasteRows') {
				if (this.clipboard.length === 0) return;
				const data = JSON.parse(document.getText());
				const toPaste = this.clipboard.map((r: unknown) => ({ ...(r as object) }));

				const existingKeys = new Set<string>(data.length > 0 ? allKeys(data) : []);
				const newKeys = [...new Set(toPaste.flatMap(r => Object.keys(r as object)))].filter(k => !existingKeys.has(k));
				for (const key of newKeys) {
					for (const row of data) row[key] = '';
				}

				const after = Number.isFinite(msg.after) ? msg.after : data.length - 1;
				data.splice(after + 1, 0, ...toPaste);
				const edit = new vscode.WorkspaceEdit();
				edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), JSON.stringify(data, null, 2));
				await vscode.workspace.applyEdit(edit);
			}

			if (msg.type === 'cutRows') {
				const data = JSON.parse(document.getText());
				const selected = (msg.rows as number[]).map((i: number) => data[i]);
				this.clipboard = selected;
				webviewPanel.webview.postMessage({ type: 'copyToClipboard', text: JSON.stringify(selected, null, 2) });
				const toDelete = new Set(msg.rows as number[]);
				const newData = data.filter((_: unknown, i: number) => !toDelete.has(i));
				const edit = new vscode.WorkspaceEdit();
				edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), JSON.stringify(newData, null, 2));
				await vscode.workspace.applyEdit(edit);
			}
		});

		const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() === document.uri.toString()) {
				sendData();
			}
		});

		webviewPanel.onDidDispose(() => changeSubscription.dispose());
	}

	private getHtml(styleUri: vscode.Uri, scriptUri: vscode.Uri, cspSource: string): string {
		const htmlPath = path.join(this.context.extensionPath, 'webview', 'index.html');
		let html = fs.readFileSync(htmlPath, 'utf8');
		html = html.replaceAll('{{CSP_SOURCE}}', cspSource);
		html = html.replaceAll('{{STYLE_URI}}', styleUri.toString());
		html = html.replaceAll('{{SCRIPT_URI}}', scriptUri.toString());
		html = html.replace('{{HEADERS}}', '');
		html = html.replace('{{ROWS}}', '');
		return html;
	}
}

export function deactivate() { }
