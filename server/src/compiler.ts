import * as fs from "fs";
import * as path from "path";
import * as net from 'net';
import { spawn, ChildProcess, spawnSync } from 'child_process';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Connection, Hover, TextDocumentPositionParams } from "vscode-languageserver";
import { documents, getWordAtPosition } from "./server";
import { URI } from 'vscode-uri';
import { SymbolTable } from "./symbolTable";

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
const SOCKET_PORT = 9000;
const DEBUG_PORT = 9001;
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
    private compilerProcess: ChildProcess | null = null;
    private retryCount = 0;
    private symTable: SymbolTable;

    constructor(connection: Connection, symTable: SymbolTable) {
        this.connection = connection;
        this.symTable = symTable;
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

        connection.console.log(`<LSP> ERROR: Using Cryo compiler at: ${CRYO_COMPILER_BIN_PATH}`);
        this.startClient();
    }

    private getFilePathFromUri(documentUri: string): string {
        try {
            // Parse the URI and get the file system path
            const uri = URI.parse(documentUri);
            return uri.fsPath;
        } catch (error) {
            this.connection?.console.error(`<LSP> ERROR: Error parsing URI: ${error}`);
            // Fallback to simple string replacement if URI parsing fails
            return documentUri.replace(/^file:\/\//, '');
        }
    }

    private async startCompilerProcess(documentUri: string): Promise<boolean> {
        return new Promise(async (resolve) => {
            try {
                // Kill existing compiler process if it exists
                if (this.compilerProcess) {
                    this.compilerProcess.kill();
                    await new Promise(r => setTimeout(r, 1000)); // Wait for process to fully terminate
                    this.compilerProcess = null;
                }
    
                const filePath = this.getFilePathFromUri(documentUri);
                if (!filePath) {
                    this.connection?.console.error('Invalid file path');
                    resolve(false);
                    return;
                }
    
                const fileDir = path.dirname(filePath);
                const lspSymbolsDir = path.join(fileDir, 'build', 'lsp');
    
                // Ensure the directory exists
                fs.mkdirSync(lspSymbolsDir, { recursive: true });
    
                this.connection?.console.log(`<LSP> INFO: Starting compiler for file: ${filePath}`);
                
                // Start the process with environment variables
                this.compilerProcess = spawn(CRYO_COMPILER_BIN_PATH, [
                    '-f',
                    filePath,
                    '--lsp-symbols',
                    lspSymbolsDir
                ], {
                    cwd: fileDir,
                    env: {
                        ...process.env,
                        CRYO_LSP_MODE: '1'  // Add environment variable to signal LSP mode
                    }
                });
    
                let serverStarted = false;
                let startupTimeout: NodeJS.Timeout;
                
                const cleanup = () => {
                    clearTimeout(startupTimeout);
                    if (this.compilerProcess) {
                        this.compilerProcess.removeAllListeners();
                    }
                };
    
                // Listen for compiler output
                this.compilerProcess.stdout?.on('data', (data) => {
                    const output = data.toString();
                    this.connection?.console.log(`Compiler: ${output}`);
                    
                    if (output.includes('<LSP> ERROR: Server listening on port: ' + SOCKET_PORT)) {
                        serverStarted = true;
                        cleanup();
                        resolve(true);
                    }
                });
    
                // Listen for compiler errors
                this.compilerProcess.stderr?.on('data', (data) => {
                    const output = data.toString();
                    this.connection?.console.error(`<LSP> ERROR: Compiler Error: ${output}`);
                });
    
                // Handle process errors
                this.compilerProcess.on('error', (error) => {
                    this.connection?.console.error(`<LSP> ERROR: Compiler process error: ${error.message}`);
                    cleanup();
                    resolve(false);
                });
                
                // Handle process exit
                this.compilerProcess.on('exit', (code) => {
                    if (!serverStarted) {
                        this.connection?.console.error(`<LSP> ERROR: Compiler process exited with code ${code}`);
                        cleanup();
                        resolve(false);
                    }
                });
                
                // Set startup timeout
                startupTimeout = setTimeout(() => {
                    if (!serverStarted) {
                        this.connection?.console.error('<LSP> ERROR: Compiler server startup timed out');
                        if (this.compilerProcess) {
                            this.compilerProcess.kill();
                        }
                        cleanup();
                        resolve(false);
                    }
                }, 10000);
    
            } catch (error) {
                this.connection?.console.error(`<LSP> ERROR: Failed to start compiler: ${error}`);
                resolve(false);
            }
        });
    }

    private async detectServerPort(): Promise<number> {
        // Try to connect to debug proxy first
        try {
            const testSocket = new net.Socket();
            await new Promise((resolve, reject) => {
                // Set a short timeout
                const timeout = setTimeout(() => {
                    testSocket.destroy();
                    reject(new Error('Timeout'));
                }, 100);
    
                testSocket.connect(DEBUG_PORT, 'localhost', () => {
                    clearTimeout(timeout);
                    testSocket.end();
                    resolve(true);
                });
    
                testSocket.on('error', (err) => {
                    clearTimeout(timeout);
                    testSocket.destroy();
                    reject(err);
                });
            });
    
            this.connection?.console.log('<LSP> INFO: Debug proxy detected, using proxy port');
            return DEBUG_PORT;
        } catch (error) {
            this.connection?.console.log('<LSP> INFO: No debug proxy detected, using direct port');
            return SOCKET_PORT;
        }
    }

    private async startClient(): Promise<void> {
        if (this.isConnecting || this.retryCount >= MAX_RETRIES) {
            return;
        }
        this.isConnecting = true;
    
        try {
            // Detect which port to use
            const port = await this.detectServerPort();
            this.connection?.console.log(`<LSP> INFO: Using port ${port} for connection`);
            
            this.client = new net.Socket();

            // Set up connection timeout
            const connectionTimeout = setTimeout(() => {
                if (this.isConnecting) {
                    this.client?.destroy();
                    throw new Error('<LSP> ERROR: Connection timeout');
                }
            }, 5000); // 5 second timeout
    
            // Set up event handlers
            this.client.on('connect', () => {
                clearTimeout(connectionTimeout);
                this.connection?.console.log(`<LSP> INFO: Connected to compiler symbol server on port ${this.port}`);
                this.isConnecting = false;
                this.retryCount = 0;
    
                // Set keep-alive to detect disconnections
                this.client?.setKeepAlive(true, 1000 * 60); // 60 second keep-alive
    
                // Request initial symbols
                this.requestSymbolUpdate();
            });
    
            let buffer = '';
            this.client.on('data', (chunk: Buffer) => {
                try {
                    buffer += chunk.toString('utf8');
                    
                    // Process complete messages
                    const messages = buffer.split('\n');
                    // Keep last potentially incomplete message in buffer
                    buffer = messages.pop() || '';
                    
                    for (const message of messages) {
                        if (message.trim()) {
                            try {
                                const symbol: LSPSymbol = JSON.parse(message);
                                
                                // Validate symbol structure
                                if (this.isValidSymbol(symbol)) {
                                    this.symbolTable.set(symbol.name, symbol);
                                    this.notifySymbolUpdate(symbol);
                                } else {
                                    this.connection?.console.warn(`Invalid symbol structure received: ${message}`);
                                }
                            } catch (parseError) {
                                this.connection?.console.error(`Error parsing symbol data: ${parseError}`);
                                this.connection?.console.error(`Problematic message: ${message}`);
                            }
                        }
                    }
    
                    // Handle buffer overflow protection
                    if (buffer.length > 1000000) { // 1MB limit
                        this.connection?.console.warn('<LSP> WARN: Buffer overflow, clearing incomplete data');
                        buffer = '';
                    }
                } catch (error) {
                    this.connection?.console.error(`<LSP> ERROR: Error processing data chunk: ${error}`);
                    buffer = ''; // Clear buffer on error

                    // close the connection to trigger a reconnect
                    this.client?.destroy();
                }
            });
    
            this.client.on('error', (error: Error) => {
                clearTimeout(connectionTimeout);
                this.connection?.console.error(`<LSP> ERROR: Socket error: ${error.message}`);
                this.handleDisconnect();
            });
    
            this.client.on('close', (hadError: boolean) => {
                clearTimeout(connectionTimeout);
                this.connection?.console.log(`<LSP> ERROR: Connection closed${hadError ? ' due to error' : ''}, attempting to reconnect...`);
                this.handleDisconnect();
            });
    
            this.client.on('end', () => {
                clearTimeout(connectionTimeout);
                this.connection?.console.log('<LSP> INFO: Server ended connection');
                this.handleDisconnect();
            });
    
            // Attempt connection
            this.connection?.console.log(`Attempting to connect to compiler on ${this.host}:${this.port}`);
            this.client.connect(this.port, this.host);
    
        } catch (error) {
            this.connection?.console.error(`Failed to start client: ${error}`);
            this.handleDisconnect();
        }
    }

    // Helper method to validate symbol structure
    private isValidSymbol(symbol: any): symbol is LSPSymbol {
        return (
            typeof symbol === 'object' &&
            typeof symbol.name === 'string' &&
            typeof symbol.signature === 'string' &&
            typeof symbol.documentation === 'string' &&
            typeof symbol.kind === 'string' &&
            typeof symbol.type === 'string' &&
            typeof symbol.parent === 'string' &&
            typeof symbol.file === 'string' &&
            typeof symbol.line === 'string' &&
            typeof symbol.column === 'string'
        );
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
            this.connection.console.log(`<LSP> Updated symbol: ${symbol.name}`);
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

    private requestSymbolUpdate(): void {
        if (this.client?.writable) {
            this.client.write(JSON.stringify({ command: 'update_symbols' }) + '\n');
        }
    }

    // Add methods to handle document events
    public async handleDocumentChange(document: TextDocument): Promise<void> {
        this.retryCount = 0;
        
        try {
            // 1. Kill existing compiler process if it exists and wait for full termination
            if (this.compilerProcess) {
                this.compilerProcess.kill();
                await new Promise(r => setTimeout(r, 2000)); // Increased wait time
                this.compilerProcess = null;
            }
    
            // 2. Stop any existing client connections
            if (this.client) {
                this.client.destroy();
                this.client = null;
            }
    
            // 3. Kill any processes that might be using our ports
            try {
                const { execSync } = require('child_process');
                execSync('pkill -f "port 4390"');
                await new Promise(r => setTimeout(r, 1000));
            } catch (error) {
                // Ignore errors here as the process might not exist
            }
    
            // 4. Start compiler process with retry logic
            let success = false;
            let attempts = 0;
            while (!success && attempts < 3) {
                success = await this.startCompilerProcess(document.uri);
                if (!success) {
                    attempts++;
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
    
            if (!success) {
                this.connection?.console.error('<LSP> Error: Failed to start compiler process after retries');
                return;
            }
    
            // 5. Wait longer for LSP server to initialize
            const WAIT_TIME = 5000; // 5 seconds
            await new Promise(resolve => setTimeout(resolve, WAIT_TIME));
    
            // 6. Start client connection with retry logic
            attempts = 0;
            while (attempts < 3) {
                try {
                    await this.startClient();
                    //@ts-ignore
                    if (this.client?.writable) {
                        break;
                    }
                } catch (error) {
                    this.connection?.console.error(`<LSP> ERROR: Client connection attempt ${attempts + 1} failed:` + error);
                }
                attempts++;
                await new Promise(r => setTimeout(r, 2000));
            }
    
            // 7. If connected, request symbol update
            //@ts-ignore
            if (this.client?.writable) {
                this.requestSymbolUpdate();
            } else {
                this.connection?.console.error('<LSP> ERROR: Failed to establish client connection after retries');
            }
    
        } catch (error) {
            this.connection?.console.error(`<LSP> ERROR: Error in handleDocumentChange: ${error}`);
            // Clean up on error
            if (this.compilerProcess) {
                this.compilerProcess.kill();
                this.compilerProcess = null;
            }
            if (this.client) {
                this.client.destroy();
                this.client = null;
            }
        }
    }
    
    public async handleDocumentSave(document: TextDocument): Promise<void> {
        // Send document to compiler for full analysis
        await this.sendDocumentToCompiler(document, true);
    }
    
    private async sendDocumentToCompiler(document: TextDocument, isSave: boolean = false): Promise<void> {
        if (!this.client) {
            console.log('<LSP> ERROR: No connection to compiler, attempting to reconnect...');
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
            console.error('<LSP> ERROR: Error sending document to compiler:', error);
            this.handleDisconnect();
        }
    }
}

export function initializeSymbolProvider(connection: Connection, symbolTable: SymbolTable): SymbolProvider {
    const symbolProvider = new SymbolProvider(connection, symbolTable);

    // Handle hover requests
    connection.onHover(async (params: TextDocumentPositionParams): Promise<Hover | null> => {
        const document = documents.get(params.textDocument.uri);
        if (!document) {
            console.error("<LSP> ERROR: No document found");
            return null;
        }

        const offset = document.offsetAt(params.position);
        const text = document.getText();
        const word = getWordAtPosition(text, offset);
        
        if (!word) {
            console.error("<LSP> ERROR: No word found");
            return null;
        }

        const symbol = symbolProvider.getSymbol(word, document.uri);
        if (!symbol) {
            console.error("<LSP> ERROR: No symbol found");
            return null;
        }

        return {
            contents: {
                kind: 'markdown',
                value: formatSymbol(symbol)
            }
        };
    });

    return symbolProvider;
}

function formatSymbol(symbol: LSPSymbol): string {
    switch (symbol.kind) {
        case 'function':
            return formatFunctionSignature(symbol);
        case 'variable':
            return formatVariable(symbol);
        case 'method':
            return formatMethod(symbol);
        case 'class':
            return formatClass(symbol);
        case 'property':
            return formatProperty(symbol);
        case 'generic':
            return formatGeneric(symbol);
        default:
            return `*${symbol.name}* ${symbol.signature}`;
    }
}

function formatFunctionSignature(symbol: LSPSymbol): string {
    const signature = symbol.signature || 'void';
    return `\`\`\`cryo
function ${symbol.name}: ${signature}
\`\`\``;
}
function formatVariable(symbol: LSPSymbol): string {
    return `\`\`\`cryo
const ${symbol.name}: ${symbol.signature}
\`\`\``;
}

function formatMethod(symbol: LSPSymbol): string {
    return `\`\`\`cryo
method ${symbol.signature} ${symbol.parent ? `${symbol.parent}::` : ''}${symbol.name}
\`\`\``;
}

function formatClass(symbol: LSPSymbol): string {
    return `\`\`\`cryo
class ${symbol.name} ${symbol.parent ? `: ${symbol.parent}` : ''}
\`\`\``;
}

function formatProperty(symbol: LSPSymbol): string {
    return `\`\`\`cryo
property ${symbol.signature} ${symbol.name};
\`\`\``;
}

function formatGeneric(symbol: LSPSymbol): string {
    return `\`\`\`cryo
${symbol.signature} ${symbol.name}
\`\`\``;
}
