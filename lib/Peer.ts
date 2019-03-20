import {WSEventStreamConfig} from './WSEventStreamConfig';

export class Peer {
    peerName: string;
    eventStreamURI: string;
    url: URL;
    peerAddress: string | null;
    inError: boolean;
    streamConfig: WSEventStreamConfig|null;
    reachable: boolean;
    pendingEventCode: string | null;

    constructor(name: string, peerLocation: URL, peerAddress: string|null){
        this.peerName = name;
        this.peerAddress = peerAddress;
        this.url = peerLocation;
        this.eventStreamURI = peerLocation.href;
        this.inError = false;
        this.reachable = false;
        this.streamConfig = null;
        this.pendingEventCode = null;
    }

    markPending(eventCode: string): void{
        this.pendingEventCode = eventCode;
    }

    getPendingEventCode(): string|null{
        return this.pendingEventCode;
    }

    withConfig(config: WSEventStreamConfig): Peer {
        if(config != null){
            this.streamConfig = config;
        }
        return this;
    }

    getStreamConfig(): WSEventStreamConfig|null {
        return this.streamConfig;
    }

    getPeerName(): string {
        return this.peerName;
    }

    getURI(): string {
        return this.eventStreamURI;
    }

    getURL(): URL {
        return this.streamConfig != null ? this.streamConfig.dstLocation : this.url;
    }

    getPeerAddress(): string | null {
        return this.peerAddress;
    }

    getPeerLocation(): string {
        let addr = this.peerAddress != null ? (this.peerAddress + '@') : '';
        return (addr + this.getURI().substr(this.getURI().indexOf('://')+3)).replace(/\/+/i, '/');
    }

    markAsReachable(): void {
        this.reachable = true;
    }

    isMarkedAsReachable(): boolean {
        return this.reachable;
    }

    isReachable(): boolean {
        if(this.url == null){
            return false;
        }
        let thiz: Peer = this;
        let ping: string = Math.random().toString(36).toString();
        fetch(this.url.href + 'echo?ping=' + ping, {method: 'GET'}).then(function(response){
            return response.text();
        }).then(function(text){
            thiz.reachable = text == ping;
            console.log(text);
        }).catch(function(e){
            console.error(e);
            thiz.reachable = false;
        });
        return thiz.reachable;
    }

    isDirect(): boolean {
        return this.peerAddress == null;
    }
}
