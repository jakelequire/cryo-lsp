

interface Symbol {
    name: string;
    signature: string;
    kind: string;
}

export class SymbolTable {
    private symbols: Symbol[] = [];

    constructor() {}

    public getSymbols() {
        return this.symbols;
    }

    public getSymbol(name: string) {
        return this.symbols.find(symbol => symbol.name === name);
    }

    private addSymbol(name: string, signature: string, kind: string) {
        this.symbols.push({ name, signature, kind });
    }

    private processIncomingSymbol() {

    }
}
