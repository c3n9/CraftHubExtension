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
			if (msg.type !== 'edit') return;
			const data = JSON.parse(document.getText());
			data[msg.row][msg.col] = msg.value;
			const edit = new vscode.WorkspaceEdit();
			edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), JSON.stringify(data, null, 2));
			await vscode.workspace.applyEdit(edit);
		});
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

		const headers = columns.map(c => `<th>${c}</th>`).join('');
		const rows = data.map((row, rowIndex) =>
			`<tr>${columns.map(c => `<td data-row="${rowIndex}" data-col="${c}">${row[c] ?? ''}</td>`).join('')}</tr>`
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