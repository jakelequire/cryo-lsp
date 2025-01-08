import * as fs from "fs";
import * as path from "path";
import * as net from 'net';
import { spawn, ChildProcess, spawnSync } from 'child_process';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Connection, Hover, TextDocumentPositionParams } from "vscode-languageserver";
import { documents, getWordAtPosition } from "./server";
import { URI } from 'vscode-uri';


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

// env var: CRYO_COMPILER = "path/to/compiler"
const CRYO_COMPILER_BIN_PATH = process.env.CRYO_COMPILER || runCryoPath() || '';
const SOCKET_PORT = 4389;
const RECONNECT_DELAY = 1000 * 30; // 30 seconds
const MAX_RETRIES = 10;

interface LSPSymbol {
    name: string;
    signature: string;
    documentation: string;
    kind: string;
    type: string;
    parent: string;
    file: string;
    line: string;
    column: string;
}


export class SymbolProvider {
    private symbolTable: Map<string, LSPSymbol> = new Map();
    private readonly port = SOCKET_PORT;
    private readonly host = 'localhost';
    private client: net.Socket | null = null;
    private isConnecting = false;
    private connection: Connection | null = null;
    private documentVersions: Map<string, number> = new Map();
    private compilerProcess: ChildProcess | null = null;
    private activeDocument: string | null = null;
    private retryCount = 0;

    constructor(connection: Connection) {
        this.connection = connection;
        // Verify compiler path is set and exists
        if (!CRYO_COMPILER_BIN_PATH) {
            connection.window.showErrorMessage(
                'Cryo compiler path not set. Please configure it in settings (cryo.compilerPath) ' +
                'or set CRYO_COMPILER environment variable.'
            );
            return;
        }

        if (!fs.existsSync(CRYO_COMPILER_BIN_PATH)) {
            connection.window.showErrorMessage(
                `Cryo compiler not found at "${CRYO_COMPILER_BIN_PATH}". ` +
                'Please check your compiler path configuration.'
            );
            return;
        }

        connection.console.log(`Using Cryo compiler at: ${CRYO_COMPILER_BIN_PATH}`);
        this.startClient();
    }

    private getFilePathFromUri(documentUri: string): string {
        try {
            // Parse the URI and get the file system path
            const uri = URI.parse(documentUri);
            return uri.fsPath;
        } catch (error) {
            this.connection?.console.error(`Error parsing URI: ${error}`);
            // Fallback to simple string replacement if URI parsing fails
            return documentUri.replace(/^file:\/\//, '');
        }
    }

    private async startCompilerProcess(documentUri: string): Promise<boolean> {
        // Kill existing compiler process if it exists
        if (this.compilerProcess) {
            this.compilerProcess.kill();
            this.compilerProcess = null;
        }

        return new Promise((resolve) => {
            try {
                // Get the proper file path from the URI
                const filePath = this.getFilePathFromUri(documentUri);
                
                if (!filePath) {
                    this.connection?.console.error('Invalid file path');
                    resolve(false);
                    return;
                }

                // Get the directory of the current file
                const fileDir = path.dirname(filePath);
                // Create the LSP symbols output directory path
                const lspSymbolsDir = path.join(fileDir, 'build', 'lsp');

                // Log paths for debugging
                this.connection?.console.log(`Document URI: ${documentUri}`);
                this.connection?.console.log(`Resolved file path: ${filePath}`);
                this.connection?.console.log(`File directory: ${fileDir}`);
                this.connection?.console.log(`LSP symbols directory: ${lspSymbolsDir}`);

                // Ensure the directory exists
                fs.mkdirSync(lspSymbolsDir, { recursive: true });

                this.connection?.console.log(`Starting compiler for file: ${filePath}`);
                
                this.compilerProcess = spawn(CRYO_COMPILER_BIN_PATH, [
                    '-f',
                    filePath,
                    '--lsp-symbols',
                    lspSymbolsDir
                ], {
                    // Add cwd option to set working directory
                    cwd: fileDir
                });

                // ... rest of the process handling code ...
                
                let serverStarted = false;

                this.compilerProcess.stdout?.on('data', (data) => {
                    const output = data.toString();
                    this.connection?.console.log(`Compiler: ${output}`);
                    
                    if (output.includes('Server listening on port 4389')) {
                        serverStarted = true;
                        resolve(true);
                    }
                });

                this.compilerProcess.stderr?.on('data', (data) => {
                    const output = data.toString();
                    this.connection?.console.error(`Compiler Error: ${output}`);
                });

                this.compilerProcess.on('error', (error) => {
                    this.connection?.console.error(`Compiler process error: ${error.message}`);
                    resolve(false);
                });

                this.compilerProcess.on('exit', (code) => {
                    if (!serverStarted) {
                        this.connection?.console.error(`Compiler process exited with code ${code}`);
                        resolve(false);
                    }
                });

                setTimeout(() => {
                    if (!serverStarted) {
                        this.connection?.console.error('Compiler server startup timed out');
                        resolve(false);
                    }
                }, 10000);

            } catch (error) {
                this.connection?.console.error(`Failed to start compiler: ${error}`);
                resolve(false);
            }
        });
    }

    private handleCompilerError(): void {
        if (this.compilerProcess) {
            this.compilerProcess.kill();
            this.compilerProcess = null;
        }
        this.handleDisconnect();
    }

    private async startClient(): Promise<void> {
        if (this.isConnecting || this.retryCount >= MAX_RETRIES) return;
        this.isConnecting = true;

        try {
            this.client = new net.Socket();

            this.client.on('connect', () => {
                this.connection?.console.log('Connected to compiler symbol server');
                this.isConnecting = false;
                this.retryCount = 0;
            });

            let buffer = '';
            this.client.on('data', (chunk) => {
                buffer += chunk;
                
                try {
                    const messages = buffer.split('\n');
                    buffer = messages.pop() || '';
                    
                    for (const message of messages) {
                        if (message.trim()) {
                            const symbols: LSPSymbol[] = JSON.parse(message);
                            this.updateSymbolTable(symbols);
                        }
                    }
                } catch (error) {
                    this.connection?.console.error(`Error parsing symbol data: ${error}`);
                }
            });

            this.client.on('error', (error) => {
                this.connection?.console.error(`Socket error: ${error.message}`);
                this.handleDisconnect();
            });

            this.client.on('close', () => {
                this.connection?.console.log('Connection closed, attempting to reconnect...');
                this.handleDisconnect();
            });

            this.connection?.console.log(`Attempting to connect to compiler on port ${this.port}`);
            this.client.connect(this.port, this.host);

        } catch (error) {
            this.connection?.console.error(`Failed to start client: ${error}`);
            this.handleDisconnect();
        }
    }

    private handleDisconnect(): void {
        this.isConnecting = false;
        if (this.client) {
            this.client.destroy();
            this.client = null;
        }

        if (this.retryCount < MAX_RETRIES) {
            this.retryCount++;
            this.connection?.console.log(`Retry attempt ${this.retryCount} of ${MAX_RETRIES}`);
            setTimeout(() => this.startClient(), RECONNECT_DELAY);
        } else {
            this.connection?.console.error('Max retry attempts reached');
        }
    }

    private async restartCompilerForDocument(document: TextDocument): Promise<void> {
        const uri = document.uri;
        const filePath = uri.replace('file://', '');
        
        if (this.activeDocument !== filePath) {
            this.activeDocument = filePath;
            await this.startCompilerProcess(filePath);
        }
    }

    private updateSymbolTable(symbols: LSPSymbol[]): void {
        // Group symbols by file for efficient lookup
        const newSymbols = new Map<string, LSPSymbol>();
        
        for (const symbol of symbols) {
            newSymbols.set(symbol.name, symbol);
            
            // If this is a new or updated symbol, notify the editor
            const existing = this.symbolTable.get(symbol.name);
            if (!existing || JSON.stringify(existing) !== JSON.stringify(symbol)) {
                this.notifySymbolUpdate(symbol);
            }
        }
        
        this.symbolTable = newSymbols;
    }

    private notifySymbolUpdate(symbol: LSPSymbol): void {
        if (this.connection) {
            // Notify the editor that symbols have changed
            // This could trigger a refresh of hovers, completions, etc.
            this.connection.console.log(`Symbol updated: ${symbol.name}`);
        }
    }

    public getSymbol(name: string, currentFile?: string): LSPSymbol | undefined {
        const symbol = this.symbolTable.get(name);
        if (symbol && currentFile) {
            // Prioritize symbols from the current file
            if (symbol.file === currentFile) {
                return symbol;
            }
        }
        return symbol;
    }

    public getAllSymbols(): LSPSymbol[] {
        return Array.from(this.symbolTable.values());
    }

    public getSymbolsInFile(file: string): LSPSymbol[] {
        return Array.from(this.symbolTable.values())
            .filter(symbol => symbol.file === file);
    }

    public getSymbolsByKind(kind: string): LSPSymbol[] {
        return Array.from(this.symbolTable.values())
            .filter(symbol => symbol.kind === kind);
    }

    // Add methods to handle document events
    public async handleDocumentChange(document: TextDocument): Promise<void> {
        // Reset retry count when handling a new document
        this.retryCount = 0;
        
        // Start compiler process and wait for it to be ready
        const success = await this.startCompilerProcess(document.uri);
        
        if (success) {
            // Wait a short moment for the server to be fully ready
            await new Promise(resolve => setTimeout(resolve, 500));
            // Start the client connection
            await this.startClient();
        } else {
            this.connection?.console.error('Failed to start compiler process');
        }
    }

    
    public async handleDocumentSave(document: TextDocument): Promise<void> {
        // Send document to compiler for full analysis
        await this.sendDocumentToCompiler(document, true);
    }
    
    private async sendDocumentToCompiler(document: TextDocument, isSave: boolean = false): Promise<void> {
        if (!this.client) {
            console.log('No connection to compiler, attempting to reconnect...');
            await this.startClient();
            return;
        }

        try {
            const message = {
                type: isSave ? 'save' : 'change',
                uri: document.uri,
                content: document.getText(),
                version: document.version
            };

            this.client.write(JSON.stringify(message) + '\n');
        } catch (error) {
            console.error('Error sending document to compiler:', error);
            this.handleDisconnect();
        }
    }
}

export function initializeSymbolProvider(connection: Connection): SymbolProvider {
    const symbolProvider = new SymbolProvider(connection);

    // Handle hover requests
    connection.onHover(async (params: TextDocumentPositionParams): Promise<Hover | null> => {
        const document = documents.get(params.textDocument.uri);
        if (!document) return null;

        const offset = document.offsetAt(params.position);
        const text = document.getText();
        const word = getWordAtPosition(text, offset);
        
        if (!word) return null;

        const symbol = symbolProvider.getSymbol(word, document.uri);
        if (!symbol) return null;

        // Build a rich hover message
        const hoverContent = [
            `### ${symbol.name}`,
            '```typescript',
            symbol.signature,
            '```',
            '',
            symbol.documentation,
            '',
            `*Type: ${symbol.type}*`,
            symbol.parent ? `*Parent: ${symbol.parent}*` : ''
        ].filter(Boolean).join('\n');

        return {
            contents: {
                kind: 'markdown',
                value: hoverContent
            }
        };
    });

    return symbolProvider;
}
