import { WSEventStreamConfig } from './WSEventStreamConfig';
export declare class Peer {
    peerName: string;
    eventStreamURI: string;
    url: URL;
    peerAddress: string | null;
    inError: boolean;
    streamConfig: WSEventStreamConfig | null;
    reachable: boolean;
    constructor(name: string, peerLocation: URL, peerAddress: string | null);
    withConfig(config: WSEventStreamConfig): Peer;
    getStreamConfig(): WSEventStreamConfig | null;
    getPeerName(): string;
    getURI(): string;
    getURL(): URL;
    getPeerAddress(): string | null;
    getPeerLocation(): string;
    markAsReachable(): void;
    isMarkedAsReachable(): boolean;
    isReachable(): boolean;
    isDirect(): boolean;
}
