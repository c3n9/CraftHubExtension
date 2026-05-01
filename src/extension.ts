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
		webviewPanel.webview.html = this.getHtml(document.getText(), styleUri, scriptUri, webviewPanel.webview.cspSource);

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
				const text = msg.format === 'array'
					? JSON.stringify(selected, null, 2)
					: selected.map((r: unknown) => JSON.stringify(r, null, 2)).join(',\n');
				webviewPanel.webview.postMessage({ type: 'copyToClipboard', text, rows: selected });
			}

			if (msg.type === 'pasteRows') {
				const data = JSON.parse(document.getText());
				const toPaste = (msg.clipboard as unknown[]).map((r: unknown) => ({ ...(r as object) }));
				data.splice(msg.after + 1, 0, ...toPaste);
				const edit = new vscode.WorkspaceEdit();
				edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), JSON.stringify(data, null, 2));
				await vscode.workspace.applyEdit(edit);
			}

			if (msg.type === 'cutRows') {
				const data = JSON.parse(document.getText());
				const selected = (msg.rows as number[]).map((i: number) => data[i]);
				webviewPanel.webview.postMessage({ type: 'copyToClipboard', text: JSON.stringify(selected, null, 2), rows: selected });
				const toDelete = new Set(msg.rows as number[]);
				const newData = data.filter((_: unknown, i: number) => !toDelete.has(i));
				const edit = new vscode.WorkspaceEdit();
				edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), JSON.stringify(newData, null, 2));
				await vscode.workspace.applyEdit(edit);
			}


		});

		const updateWebview = () => {
			webviewPanel.webview.html = this.getHtml(
				document.getText(), styleUri, scriptUri, webviewPanel.webview.cspSource
			);
		};

		const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() === document.uri.toString()) {
				updateWebview();
			}
		});

		webviewPanel.onDidDispose(() => changeSubscription.dispose());


	}

	private getHtml(jsonText: string, styleUri: vscode.Uri, scriptUri: vscode.Uri, cspSource: string): string {
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

		if (data.length === 0) {
			return `<html><body><p>Empty array</p></body></html>`;
		}

		const columns = Object.keys(data[0]);

		const headers = columns.map(c =>
			`<th>
				${c}
				<button class="delete-column" data-col="${c}">x</button>
			</th>`)
			.join('');
		const rows = data.map((row, rowIndex) =>
			`<tr data-row="${rowIndex}">${columns.map(c =>
				`<td data-col="${c}">
            		${row[c] ?? ''}
       			</td>`)
				.join('')}
    		</tr>`
		).join('');


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