import { RelayedWSEventStream } from './RelayedWSEventStream';
import { WSEventStreamConfig } from './WSEventStreamConfig';
import { Peer } from './Peer';
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
    extractPeerName(label: string): string;
    onPeersChange(peers: string[]): void;
    isActive(): boolean;
}
