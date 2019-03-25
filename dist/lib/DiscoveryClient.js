"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const RelayedWSEventStream_1 = require("./RelayedWSEventStream");
const WSEventStreamConfig_1 = require("./WSEventStreamConfig");
const Peer_1 = require("./Peer");
const ES_PATH = '/es';
exports.SERVER_CONNECTIVITY_STATUS_CODES = {
    UNKNOWN: -1,
    ONLINE: 0,
    AUTH_REQUIRED: 1,
    UNREACHABLE: 2
};
class PeersChangeListener {
    onNewPeers(peers) {
        console.log(peers);
    }
}
exports.PeersChangeListener = PeersChangeListener;
class DiscoveryClient {
    constructor(url, peersListener) {
        this.streamConfig = new WSEventStreamConfig_1.WSEventStreamConfig(url, true).withPath(ES_PATH);
        this.peersChangeListener = peersListener;
        RelayedWSEventStream_1.RelayedWSEventStream.initialize(this.streamConfig);
        this.eventStream = RelayedWSEventStream_1.RelayedWSEventStream.getInstance();
        this.active = false;
        this.onPeersChange = this.onPeersChange.bind(this);
        this.uri = this.streamConfig.getURI();
    }
    async startAsync() {
        let peerAddress = this.streamConfig.getAddress();
        return this.start(null).then(success => {
            if (success) {
                return new URL('', peerAddress);
            }
            else {
                throw new Error('Unable to connect to ' + peerAddress);
            }
        });
    }
    async start(statusCallback) {
        let peer = new Peer_1.Peer('', this.streamConfig.dstLocation, null).withConfig(this.streamConfig);
        this.eventStream.initiateWSSession(peer);
        this.eventStream.registerPeersChangeCallback(this.onPeersChange);
        this.active = true;
        if (statusCallback != null) {
            statusCallback('STARTING...', false);
        }
        return peer.isReachable();
    }
    async checkStatus() {
        return this.eventStream.testConnectivity(this.streamConfig.getURI()).then(httpResponse => {
            return { code: DiscoveryClient.convertHttpCode(httpResponse.status), statusMsg: httpResponse.statusText };
        }).catch(err => {
            return { code: exports.SERVER_CONNECTIVITY_STATUS_CODES.UNREACHABLE, statusMsg: err.message };
        });
    }
    static convertHttpCode(code) {
        if (code >= 200 && code < 300) {
            return exports.SERVER_CONNECTIVITY_STATUS_CODES.ONLINE;
        }
        if (code == 401 || code == 403) {
            return exports.SERVER_CONNECTIVITY_STATUS_CODES.AUTH_REQUIRED;
        }
        if (code >= 500) {
            return exports.SERVER_CONNECTIVITY_STATUS_CODES.UNREACHABLE;
        }
        return exports.SERVER_CONNECTIVITY_STATUS_CODES.UNKNOWN;
    }
    /*stop(): void{
        this.eventStream.stop();
        this.active = false;
    }*/
    extractPeerName(label) {
        return label.indexOf('@') < 0 ? label : label.substr(0, label.indexOf('@'));
    }
    onPeersChange(peers) {
        console.log({ 'PEERS_CHG': peers });
        if (peers != null) {
            let peerUpdates = peers.map((element) => new Peer_1.Peer(this.extractPeerName(element), new URL('', this.uri), element));
            peerUpdates = peerUpdates.filter((peer, index, arr) => arr.findIndex((val) => val.getPeerName() == peer.getPeerName()) == index);
            peerUpdates.forEach(peer => peer.withConfig(this.streamConfig));
            if (this.peersChangeListener != null) {
                this.peersChangeListener.onNewPeers(peerUpdates);
            }
        }
    }
    isActive() {
        return this.active;
    }
}
exports.DiscoveryClient = DiscoveryClient;
