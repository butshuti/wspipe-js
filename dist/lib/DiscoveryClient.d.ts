import { RelayedWSEventStream } from './RelayedWSEventStream';
import { WSEventStreamConfig } from './WSEventStreamConfig';
import { Peer } from './Peer';
export declare const SERVER_CONNECTIVITY_STATUS_CODES: {
    UNKNOWN: number;
    ONLINE: number;
    AUTH_REQUIRED: number;
    UNREACHABLE: number;
};
export interface ServerStatus {
    code: number;
    statusMsg: string;
}
export declare class PeersChangeListener {
    onNewPeers(peers: Peer[]): void;
}
export declare class DiscoveryClient {
    eventStream: RelayedWSEventStream;
    peersChangeListener: PeersChangeListener;
    active: boolean;
    uri: string;
    streamConfig: WSEventStreamConfig;
    constructor(url: URL, peersListener: PeersChangeListener);
    startAsync(): Promise<URL>;
    start(statusCallback: Function | null): Promise<boolean>;
    checkStatus(): Promise<ServerStatus>;
    static convertHttpCode(code: number): number;
    extractPeerName(label: string): string;
    onPeersChange(peers: string[]): void;
    isActive(): boolean;
}
