export declare class WSEventStreamConfig {
    dstLocation: URL;
    keepAlive: boolean;
    path: string;
    constructor(dstLocation: URL, keepAlive: boolean);
    withPort(port: number): WSEventStreamConfig;
    withPath(path: string): WSEventStreamConfig;
    setKeepAlive(keepAlive: boolean): void;
    getURI(): string;
    getAddress(): string;
}
