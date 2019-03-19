import { RelayedWSEventStream } from './RelayedWSEventStream';
import {WSEventStreamConfig} from './WSEventStreamConfig';
import {Peer} from './Peer';

const ES_PATH = '/es';

export class PeersChangeListener{

    onNewPeers(peers: Peer[]): void {
        console.log(peers);
    }
}

export class DiscoveryClient {

    eventStream: RelayedWSEventStream;
    peersChangeListener: PeersChangeListener;
    active: boolean;
    uri: string;
    streamConfig: WSEventStreamConfig;
    constructor(url: URL, peersListener: PeersChangeListener){
        this.streamConfig = new WSEventStreamConfig(url, true).withPath(ES_PATH);
        this.peersChangeListener = peersListener;
        RelayedWSEventStream.initialize(this.streamConfig);
        this.eventStream = RelayedWSEventStream.getInstance();
        this.active = false;
        this.onPeersChange = this.onPeersChange.bind(this);
        this.uri = this.streamConfig.getURI();
    }

    startAsync(): Promise<URL> {
        return new Promise((resolve) => {
            this.start(null);
            resolve(new URL('', this.streamConfig.getAddress()));
        });
    }

    start(statusCallback: Function|null): void{
        this.eventStream.initiateWSSession(new Peer('', this.streamConfig.dstLocation, null).withConfig(this.streamConfig));
        this.eventStream.registerPeersChangeCallback(this.onPeersChange);
        this.active = true;
        if(statusCallback != null){
            statusCallback('STARTING...', false);
        }
    }

    /*stop(): void{
        this.eventStream.stop();
        this.active = false;
    }*/

    extractPeerName(label: string): string {
        return label.indexOf('@') < 0 ? label : label.substr(0, label.indexOf('@'));
    }

    onPeersChange(peers: string[]): void {
        console.log({'PEERS_CHG': peers});
        if(peers != null){
            let peerUpdates: Peer[] = peers.map((element) => new Peer(this.extractPeerName(element), new URL('', this.uri), element));
            peerUpdates = peerUpdates.filter((peer, index, arr) => arr.findIndex((val) => val.getPeerName() == peer.getPeerName()) == index);
            peerUpdates.forEach(peer => peer.withConfig(this.streamConfig));
            if(this.peersChangeListener != null){
                this.peersChangeListener.onNewPeers(peerUpdates);
            }
        }
    }

    isActive(): boolean {
        return this.active;
    }
}
