import {WSEventStreamConfig} from './WSEventStreamConfig';

export class Peer {
    peerName: string;
    eventStreamURI: string;
    url: URL;
    peerAddress: string;
    inError: boolean;
    streamConfig: WSEventStreamConfig;
    reachable: boolean;

    constructor(name: string, peerLocation: URL, peerAddress: string){
        this.peerName = name;
        this.peerAddress = peerAddress;
        this.url = peerLocation;
        this.eventStreamURI = peerLocation.href;
        this.inError = false;
        this.reachable = false;
    }

    withConfig(config: WSEventStreamConfig): Peer {
        if(config != null){
            this.streamConfig = config;
        }
        return this;
    }

    getStreamConfig(): WSEventStreamConfig {
        return this.streamConfig;
    }

    getPeerName(): string {
        return this.peerName;
    }

    getURI(): string {
        return this.eventStreamURI;
    }

    getURL(): URL {
        return this.streamConfig != null ? this.getStreamConfig().dstLocation : this.url;
    }

    getPeerAddress(): string {
        return this.peerAddress;
    }

    getPeerLocation(): string {
        let addr = this.getPeerAddress() != null ? (this.getPeerAddress() + '@') : '';
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
