import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
		}
	};

	// Logging Support (May not need)
	// let log = '';
	// const websocketOutputChannel: OutputChannel = {
	// 	name: 'websocket',
	// 	// Only append the logs but send them later
	// 	append(value: string) {
	// 		log += value;
	// 		console.log(value);
	// 	},
	// 	appendLine(value: string) {
	// 		log += value;
	// 		// Don't send logs until WebSocket initialization
	// 		if (socket && socket.readyState === WebSocket.OPEN) {
	// 			socket.send(log);
	// 		}
	// 		log = '';
	// 	},
	// 	clear() { /* empty */ },
	// 	show() { /* empty */ },
	// 	hide() { /* empty */ },
	// 	dispose() { /* empty */ },
	// 	replace() { /* empty */ }
	// };

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{ scheme: 'file', language: 'cryo' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'Cryo Language Server',
		'Cryo Language Server',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
