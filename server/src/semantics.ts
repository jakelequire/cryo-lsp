import {
    SemanticTokensBuilder,
    SemanticTokenTypes,
    SemanticTokenModifiers
} from 'vscode-languageserver/node';

export const tokenTypes = Object.values(SemanticTokenTypes);
export const tokenModifiers = Object.values(SemanticTokenModifiers);

export function provideSemanticTokens(text: string): number[] {
    const lines = text.split(/\r\n|\r|\n/);
    const builder = new SemanticTokensBuilder();
    const declaredVariables: { name: string, type: string, kind: 'const' | 'mut' | 'extern' | 'public' | 'function' }[] = [];

    const keywords = ['function', 'public', 'extern', 'namespace', 'const', 'let', 'if', 'else', 'return', 'void', 'int', 'string'];

    lines.forEach((line, lineIndex) => {
        // Highlight keywords first
        keywords.forEach(keyword => {
            let index = -1;
            while ((index = line.indexOf(keyword, index + 1)) !== -1) {
                addToken(builder, lineIndex, index, keyword.length, SemanticTokenTypes.keyword, []);
            }
        });

        // Namespace
        const namespaceMatch = line.match(/^\s*namespace\s+(\w+)/);
        if (namespaceMatch) {
            addToken(builder, lineIndex, namespaceMatch.index! + 'namespace '.length, namespaceMatch[1].length, SemanticTokenTypes.namespace, [SemanticTokenModifiers.declaration]);
        }

        // Function declarations
        const functionMatch = line.match(/^\s*(public|extern)?\s*function\s+(\w+)/);
        if (functionMatch) {
            const functionNameIndex = line.indexOf(functionMatch[2]);
            addToken(builder, lineIndex, functionNameIndex, functionMatch[2].length, SemanticTokenTypes.function, [SemanticTokenModifiers.declaration]);
        }

        // Parameters and Variables
        const varParamMatch = line.match(/(\w+)\s*:\s*(\w+)/g);
        if (varParamMatch) {
            varParamMatch.forEach(match => {
                const [name, type] = match.split(':').map(s => s.trim());
                const nameIndex = line.indexOf(name);
                addToken(builder, lineIndex, nameIndex, name.length, SemanticTokenTypes.variable, []);
                declaredVariables.push({ name, type, kind: line.includes('function') ? 'function' : 'const' });
            });
        }

        // Numbers
        const numberMatches = line.match(/\b\d+\b/g);
        if (numberMatches) {
            numberMatches.forEach(match => {
                addToken(builder, lineIndex, line.indexOf(match), match.length, SemanticTokenTypes.number, []);
            });
        }

        // Strings
        const stringMatches = line.match(/"[^"]*"/g);
        if (stringMatches) {
            stringMatches.forEach(match => {
                addToken(builder, lineIndex, line.indexOf(match), match.length, SemanticTokenTypes.string, []);
            });
        }

        // Comments
        if (line.trim().startsWith('//')) {
            addToken(builder, lineIndex, 0, line.length, SemanticTokenTypes.comment, []);
        }
    });

    return builder.build().data;
}

function addToken(
    builder: SemanticTokensBuilder,
    line: number,
    character: number,
    length: number,
    tokenType: SemanticTokenTypes,
    tokenModifiers: SemanticTokenModifiers[]
) {
    builder.push(line, character, length, 
                 tokenTypes.indexOf(tokenType), 
                 binaryToDecimal(tokenModifiers.map(
                     modifier => tokenModifiers.indexOf(modifier)
                 ))
    );
}

function binaryToDecimal(arr: number[]): number {
    return arr.reduce((result, bit) => (result << 1) | bit, 0);
}

export function getHoverInfo(word: string, line: string): string | null {
    // Function
    const functionMatch = line.match(/function\s+(\w+)\s*\((.*?)\)\s*->\s*(\w+)/);
    if (functionMatch && functionMatch[1] === word) {
        const params = functionMatch[2].split(',').map(param => param.trim());
        const returnType = functionMatch[3];
        return `function ${word}(${params.join(', ')}) -> ${returnType}`;
    }

    // Variable (const foo: int = 42)
    const varMatch = line.match(new RegExp(`(const|mut)\\s+(${word})\\s*:\\s*(\\w+)`));
    if (varMatch) {
        return `${varMatch[1]} ${word}: ${varMatch[3]}`;
    }

    // Parameter
    const paramMatch = line.match(new RegExp(`(${word})\\s*:\\s*(\\w+)`));
    if (paramMatch) {
        return `parameter ${word}: ${paramMatch[2]}`;
    }

    return null;
}
