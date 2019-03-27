import { RelayedWSEventStream } from './RelayedWSEventStream';
import { WSEventStream } from './WSEventStream';
import {WSEventStreamConfig} from './WSEventStreamConfig';
import {Peer} from './Peer';

export const SERVER_CONNECTIVITY_STATUS_CODES = {
    UNKNOWN: -1,
    ONLINE: 0,
    AUTH_REQUIRED: 1,
    UNREACHABLE: 2
};

export interface ServerStatus {
    code: number;
    statusMsg: string
}

export class PeersChangeListener{

    onNewPeers(peers: Peer[]): void {
        console.log(peers);
    }
}

export class DiscoveryClient {

    peersChangeListener: PeersChangeListener;
    active: boolean;
    uri: string;
    streamConfig: WSEventStreamConfig;
    relayedEventStream: RelayedWSEventStream | null;
    constructor(url: URL, peersListener: PeersChangeListener){
        this.relayedEventStream = null;
        this.streamConfig = new WSEventStreamConfig(url, true);
        this.peersChangeListener = peersListener;
        this.active = false;
        this.onPeersChange = this.onPeersChange.bind(this);
        this.uri = this.streamConfig.getURI();
    }

    async startAsync(): Promise<URL> {
        let peerAddress = this.streamConfig.getAddress();
        return this.start(null).then(success => {
            if(success){
                return new URL('', peerAddress);
            }else{
                throw new Error('Unable to connect to ' + peerAddress);
            }
        });
    }

    async start(statusCallback: Function|null): Promise<boolean>{
        if(statusCallback != null){
            statusCallback('STARTING...', false);
        }else{
            console.log('STARTING DISCOVERY CLIENT....');
        }
        return new Promise<boolean>((resolve, reject) => {
            WSEventStream.getStreamDescriptor(this.streamConfig.dstLocation.href).then(streamDescriptor => {
                console.log('STREAM_DESCR', streamDescriptor);
                this.streamConfig = this.streamConfig.withPath(streamDescriptor.path);
                let peerAddress: string|null = streamDescriptor.isDirect() ? null : this.streamConfig.getURI();
                let peerName: string = streamDescriptor.nodeName;
                let peer: Peer = new Peer(peerName, this.streamConfig.dstLocation,  peerAddress).withConfig(this.streamConfig);
                if(streamDescriptor.isDirect()){
                    this.registerPeers([peer]);
                }else{
                    RelayedWSEventStream.initialize(this.streamConfig);
                    let eventStream: RelayedWSEventStream = RelayedWSEventStream.getInstance();
                    eventStream.initiateWSSession(peer);
                    eventStream.registerPeersChangeCallback(this.onPeersChange);
                }
                this.active = true;
                if(statusCallback != null){
                    statusCallback('Registering ' + peer.getPeerName(), false);
                }
                resolve(true);
            }).catch(err => {
                console.error(err);
                reject(err);
            });
        });
        
    }

    static async test(url: string): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            WSEventStream.getStreamDescriptor(url).then(streamDescriptor => {
                console.log('STREAM DESCR?', streamDescriptor);
                resolve(true);
            }).catch(_ => {
                resolve(false);
            });
        })
    }

    async checkStatus(): Promise<ServerStatus>{
        if(this.relayedEventStream){
            return await this.relayedEventStream.testConnectivity(this.streamConfig.getURI()).then(httpResponse => {
                return {code: DiscoveryClient.convertHttpCode(httpResponse.status), statusMsg: httpResponse.statusText};
            }).catch(err => {
                return {code: SERVER_CONNECTIVITY_STATUS_CODES.UNREACHABLE, statusMsg: err.message};
            });
        }
        return new Promise<ServerStatus>(resolve => {
            DiscoveryClient.test(this.streamConfig.dstLocation.href).then(success => {
                if(success){
                    resolve({code: SERVER_CONNECTIVITY_STATUS_CODES.ONLINE, statusMsg: 'Connected'});
                }else{
                    resolve({code: SERVER_CONNECTIVITY_STATUS_CODES.UNREACHABLE, statusMsg: 'Offline'});
                }
            });
        })
    }

    private static convertHttpCode(code: number): number {
        if(code >= 200 && code < 300){
            return SERVER_CONNECTIVITY_STATUS_CODES.ONLINE;
        }
        if(code == 401 || code == 403){
            return SERVER_CONNECTIVITY_STATUS_CODES.AUTH_REQUIRED;
        }
        if(code >= 500){
            return SERVER_CONNECTIVITY_STATUS_CODES.UNREACHABLE;
        }
        return SERVER_CONNECTIVITY_STATUS_CODES.UNKNOWN;
    }

    private extractPeerName(label: string): string {
        return label.indexOf('@') < 0 ? label : label.substr(0, label.indexOf('@'));
    }

    private registerPeers(peerUpdates: Peer[]): void {
        if(this.peersChangeListener != null){
            this.peersChangeListener.onNewPeers(peerUpdates);
        }
    }

    onPeersChange(peers: string[]): void {
        console.log({'PEERS_CHG': peers});
        if(peers != null){
            let peerUpdates: Peer[] = peers.map((element) => new Peer(this.extractPeerName(element), new URL('', this.uri), element));
            peerUpdates = peerUpdates.filter((peer, index, arr) => arr.findIndex((val) => val.getPeerName() == peer.getPeerName()) == index);
            peerUpdates.forEach(peer => peer.withConfig(this.streamConfig));
            this.registerPeers(peerUpdates);
        }
    }

    isActive(): boolean {
        return this.active;
    }
}
