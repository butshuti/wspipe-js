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
    peersChangeListener: PeersChangeListener;
    active: boolean;
    uri: string;
    streamConfig: WSEventStreamConfig;
    relayedEventStream: RelayedWSEventStream | null;
    constructor(url: URL, peersListener: PeersChangeListener);
    startAsync(): Promise<URL>;
    start(statusCallback: Function | null): Promise<boolean>;
    static test(url: string): Promise<boolean>;
    checkStatus(): Promise<ServerStatus>;
    private static convertHttpCode(code);
    private extractPeerName(label);
    private registerPeers(peerUpdates);
    onPeersChange(peers: string[]): void;
    isActive(): boolean;
}
