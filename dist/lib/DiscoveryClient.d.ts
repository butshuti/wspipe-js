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
    uri: string;
    streamConfig: WSEventStreamConfig;
    constructor(url: URL, peersListener: PeersChangeListener);
    startAsync(): Promise<URL>;
    start(statusCallback: Function | null): Promise<boolean>;
    static test(url: string): Promise<boolean>;
    checkStatus(): Promise<ServerStatus>;
    private static convertHttpCode;
    private extractPeerName;
    private registerPeers;
    onPeersChange(peers: string[]): void;
}
