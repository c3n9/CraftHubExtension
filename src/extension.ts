import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';

function parseJsonc(text: string): any {
	const errors: jsonc.ParseError[] = [];
	const result = jsonc.parse(text, errors);
	if (errors.length > 0) throw new Error('Invalid JSON');
	return result;
}

function toRows(parsed: any): { rows: any[]; isArray: boolean } {
	const isArray = Array.isArray(parsed);
	return { rows: isArray ? parsed : [parsed], isArray };
}

function detectFormat(text: string): jsonc.FormattingOptions {
	const match = text.match(/^([ \t]+)/m);
	if (match) {
		const indent = match[1];
		return indent[0] === '\t'
			? { insertSpaces: false, tabSize: 1 }
			: { insertSpaces: true, tabSize: indent.length };
	}
	return { insertSpaces: false, tabSize: 1 };
}

function applyMod(text: string, jsPath: jsonc.JSONPath, value: unknown, opts: jsonc.ModificationOptions = {}): string {
	return jsonc.applyEdits(text, jsonc.modify(text, jsPath, value, opts));
}

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
				const d = parseJsonc(text);
				if (Array.isArray(d) && d.length > 0) knownColumns = allKeys(d);
			} catch { }
		};

		webviewPanel.webview.html = this.getHtml(styleUri, scriptUri, webviewPanel.webview.cspSource);

		const sendData = () => {
			parseColumns(document.getText());
			try {
				const parsed = parseJsonc(document.getText());

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

		const applyText = async (text: string) => {
			const wsEdit = new vscode.WorkspaceEdit();
			wsEdit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), text);
			await vscode.workspace.applyEdit(wsEdit);
		};

		webviewPanel.webview.onDidReceiveMessage(async (msg) => {
			if (msg.type === 'ready') {
				sendData();
				return;
			}

			if (msg.type === 'edit') {
				let text = document.getText();
				const fmt = detectFormat(text);
				const isArray = Array.isArray(parseJsonc(text));
				let newVal: unknown = msg.value;
				if (msg.valueType === 'json') {
					try { newVal = JSON.parse(msg.value); } catch { /* keep as string */ }
				}
				const jsPath: jsonc.JSONPath = isArray ? [msg.row, msg.col] : [msg.col];
				await applyText(applyMod(text, jsPath, newVal, { formattingOptions: fmt }));
			}

			if (msg.type === 'addColumn') {
				const defaults: Record<string, unknown> = {
					string: '', number: 0, bool: false, object: {}, array: []
				};
				let text = document.getText();
				const fmt = detectFormat(text);
				const { rows, isArray } = toRows(parseJsonc(text));
				for (let i = 0; i < rows.length; i++) {
					const p: jsonc.JSONPath = isArray ? [i, msg.name] : [msg.name];
					text = applyMod(text, p, defaults[msg.dataType] ?? null, { formattingOptions: fmt });
				}
				await applyText(text);
			}

			if (msg.type === 'addRow') {
				let text = document.getText();
				const fmt = detectFormat(text);
				const { rows, isArray } = toRows(parseJsonc(text));
				if (!isArray) return;
				const template = rows.length > 0 ? Object.fromEntries(Object.keys(rows[0]).map(k => [k, ''])) : {};
				await applyText(applyMod(text, [rows.length], template, { formattingOptions: fmt }));
			}

			if (msg.type === 'deleteColumn') {
				let text = document.getText();
				const fmt = detectFormat(text);
				const { rows, isArray } = toRows(parseJsonc(text));
				for (let i = 0; i < rows.length; i++) {
					const p: jsonc.JSONPath = isArray ? [i, msg.name] : [msg.name];
					text = applyMod(text, p, undefined, { formattingOptions: fmt });
				}
				await applyText(text);
			}

			if (msg.type === 'renameColumn') {
				let text = document.getText();
				const fmt = detectFormat(text);
				const { rows, isArray } = toRows(parseJsonc(text));
				for (let i = 0; i < rows.length; i++) {
					if (!Object.prototype.hasOwnProperty.call(rows[i], msg.oldName)) continue;
					const propIndex = Object.keys(rows[i]).indexOf(msg.oldName);
					const oldVal = rows[i][msg.oldName];
					const pOld: jsonc.JSONPath = isArray ? [i, msg.oldName] : [msg.oldName];
					text = applyMod(text, pOld, undefined, { formattingOptions: fmt });
					const pNew: jsonc.JSONPath = isArray ? [i, msg.newName] : [msg.newName];
					text = applyMod(text, pNew, oldVal, {
						formattingOptions: fmt,
						getInsertionIndex: (props) => Math.min(propIndex, props.length)
					});
				}
				await applyText(text);
			}

			if (msg.type === 'deleteRows') {
				let text = document.getText();
				const fmt = detectFormat(text);
				const sortedDesc = [...(msg.rows as number[])].sort((a, b) => b - a);
				for (const i of sortedDesc) {
					text = applyMod(text, [i], undefined, { formattingOptions: fmt });
				}
				await applyText(text);
			}

			if (msg.type === 'duplicateRows') {
				let text = document.getText();
				const fmt = detectFormat(text);
				const { rows } = toRows(parseJsonc(text));
				const copies = (msg.rows as number[]).map((i: number) => ({ ...rows[i] }));
				if (msg.mode === 'end') {
					for (const copy of copies) {
						const currentLen = parseJsonc(text).length;
						text = applyMod(text, [currentLen], copy, { formattingOptions: fmt });
					}
				} else {
					const insertAfter = Math.max(...msg.rows as number[]);
					for (let j = 0; j < copies.length; j++) {
						text = applyMod(text, [insertAfter + 1 + j], copies[j], { isArrayInsertion: true, formattingOptions: fmt });
					}
				}
				await applyText(text);
			}

			if (msg.type === 'getRows') {
				const { rows } = toRows(parseJsonc(document.getText()));
				const selected = (msg.rows as number[]).map((i: number) => rows[i]);
				this.clipboard = selected;
				const text = msg.format === 'array'
					? JSON.stringify(selected, null, 2)
					: selected.map((r: unknown) => JSON.stringify(r, null, 2)).join(',\n');
				webviewPanel.webview.postMessage({ type: 'copyToClipboard', text });
			}

			if (msg.type === 'pasteRows') {
				if (this.clipboard.length === 0) return;
				let text = document.getText();
				const fmt = detectFormat(text);
				const { rows, isArray } = toRows(parseJsonc(text));
				const toPaste = this.clipboard.map((r: unknown) => ({ ...(r as object) }));

				const existingKeys = new Set<string>(rows.length > 0 ? allKeys(rows) : []);
				const newKeys = [...new Set(toPaste.flatMap(r => Object.keys(r as object)))].filter(k => !existingKeys.has(k));
				for (const key of newKeys) {
					for (let i = 0; i < rows.length; i++) {
						const p: jsonc.JSONPath = isArray ? [i, key] : [key];
						text = applyMod(text, p, '', { formattingOptions: fmt });
					}
				}

				const after = Number.isFinite(msg.after) ? msg.after : parseJsonc(text).length - 1;
				for (let j = 0; j < toPaste.length; j++) {
					text = applyMod(text, [after + 1 + j], toPaste[j], { isArrayInsertion: true, formattingOptions: fmt });
				}
				await applyText(text);
			}

			if (msg.type === 'cutRows') {
				let text = document.getText();
				const fmt = detectFormat(text);
				const { rows } = toRows(parseJsonc(text));
				const selected = (msg.rows as number[]).map((i: number) => rows[i]);
				this.clipboard = selected;
				webviewPanel.webview.postMessage({ type: 'copyToClipboard', text: JSON.stringify(selected, null, 2) });
				const sortedDesc = [...(msg.rows as number[])].sort((a, b) => b - a);
				for (const i of sortedDesc) {
					text = applyMod(text, [i], undefined, { formattingOptions: fmt });
				}
				await applyText(text);
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
