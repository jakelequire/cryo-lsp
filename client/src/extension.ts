import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';
import { spawnSync } from 'child_process';

function runCryoPath(): string {
    // Attempt to run the `cryo-path` comamnd and get the string from stdout
    try {
        const result = spawnSync('cryo-path', [], { encoding: 'utf8' });
        return result.stdout.trim();
    } catch (error) {
        console.error('Error running cryo-path:', error);
        return '';
    }
}

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	const config = workspace.getConfiguration('cryo');
	const compilerPath = config.get<string>('compilerPath') || process.env.CRYO_COMPILER || runCryoPath() || '';

	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: {
				env: {
					...process.env,
					CRYO_COMPILER: compilerPath
				}
			}
		},
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: {
				execArgv: ['--nolazy', '--inspect=6009'],
				env: {
					...process.env,
					CRYO_COMPILER: compilerPath
				}
			}
		}
	};

	// Options to control the language client
	// const clientOptions: LanguageClientOptions = {
	// 	// Register the server for plain text documents
	// 	documentSelector: [{ scheme: 'file', language: 'cryo' }],
	// };

	// Create the language client and start the client.
	// client = new LanguageClient(
	// 	'Cryo Language Server',
	// 	'Cryo Language Server',
	// 	serverOptions,
	// 	clientOptions
	// );

	// Start the client. This will also launch the server
	// client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
