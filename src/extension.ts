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
	// иконка для переключения между редактором и обычным видом
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
			} catch {}
		};

		parseColumns(document.getText());
		webviewPanel.webview.html = this.getHtml(document.getText(), styleUri, scriptUri, webviewPanel.webview.cspSource, knownColumns);

		webviewPanel.webview.onDidReceiveMessage(async (msg) => {
			if (msg.type === 'edit') {
				const data = JSON.parse(document.getText());
				data[msg.row][msg.col] = msg.value;
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

		const updateWebview = () => {
			parseColumns(document.getText());
			webviewPanel.webview.html = this.getHtml(
				document.getText(), styleUri, scriptUri, webviewPanel.webview.cspSource, knownColumns
			);
		};

		const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() === document.uri.toString()) {
				updateWebview();
			}
		});

		webviewPanel.onDidDispose(() => changeSubscription.dispose());


	}

	private getHtml(jsonText: string, styleUri: vscode.Uri, scriptUri: vscode.Uri, cspSource: string, fallbackColumns: string[] = []): string {
		let data: any[];
		try {
			const parsed = JSON.parse(jsonText);
			if (!Array.isArray(parsed)) {
				return `<html><body><p style="color:orange">JSON must be an array of objects</p></body></html>`;
			}
			data = parsed;
		} catch {
			return `<html><body><p style="color:red">Invalid JSON</p></body></html>`;
		}

		const columns = data.length > 0 ? [...new Set(data.flatMap((r: any) => Object.keys(r)))] : fallbackColumns;


		const headers = columns.map(c =>
			`<th>
				${c}
				<button class="delete-column" data-col="${c}">✕</button>
			</th>`)
			.join('');
		const rows = data.length > 0
			? data.map((row, rowIndex) =>
				`<tr data-row="${rowIndex}">${columns.map(c =>
					`<td data-col="${c}"><div class="cell-inner">${row[c] ?? ''}</div></td>`)
					.join('')}</tr>`
			).join('')
			: `<tr class="empty-placeholder"><td colspan="${columns.length || 1}"></td></tr>`;


		const htmlPath = path.join(this.context.extensionPath, 'webview', 'index.html');
		let html = fs.readFileSync(htmlPath, 'utf8');
		html = html.replaceAll('{{CSP_SOURCE}}', cspSource);
		html = html.replaceAll('{{STYLE_URI}}', styleUri.toString());
		html = html.replaceAll('{{SCRIPT_URI}}', scriptUri.toString());
		html = html.replace('{{HEADERS}}', headers);
		html = html.replace('{{ROWS}}', rows);
		return html;
	}
}

export function deactivate() { }