import {
	Diagnostic,
	DiagnosticSeverity,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { spawn } from 'child_process';
import * as url from 'url';


export async function runCryoCompiler(textDocument: TextDocument): Promise<Diagnostic[]> {
    return new Promise((resolve, reject) => {
        const documentUri = url.fileURLToPath(textDocument.uri);
        const compilerPath = 'C:/Programming/apps/cryo/src/bin/main.exe';
        console.log(`Running compiler at ${compilerPath} on ${documentUri}`);
        const compiler = spawn(compilerPath, [documentUri]);

        let stdout = '';
        let stderr = '';

        compiler.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        compiler.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        compiler.on('close', (code) => {
            if (code !== 0) {
                // Handle compiler errors (stderr)
                const diagnostics: Diagnostic[] = parseCompilerErrors(stderr, textDocument);
                resolve(diagnostics);
            } else {
                // Handle compiler output (stdout)
                const diagnostics: Diagnostic[] = parseCompilerOutput(stdout, textDocument);
                resolve(diagnostics);
            }
        });
    });
}

function parseCompilerErrors(output: string, textDocument: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const lines = output.split('\n');
    for (const line of lines) {
        const match = /(\d+):(\d+): (.*)/.exec(line);
        if (match) {
            const [, line, column, message] = match;
            const diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Error,
                range: {
                    start: { line: Number(line) - 1, character: Number(column) - 1 },
                    end: { line: Number(line) - 1, character: Number(column) },
                },
                message,
                source: 'cryo-compiler',
            };
            diagnostics.push(diagnostic);
        }
    }
    return diagnostics;
}

function parseCompilerOutput(output: string, textDocument: TextDocument): Diagnostic[] {
    // Implement similar parsing logic as `parseCompilerErrors` if needed
    return [];
}