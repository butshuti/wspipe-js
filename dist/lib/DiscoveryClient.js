"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const RelayedWSEventStream_1 = require("./RelayedWSEventStream");
const WSEventStreamConfig_1 = require("./WSEventStreamConfig");
const Peer_1 = require("./Peer");
const ES_PATH = '/es';
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
    startAsync() {
        return new Promise((resolve) => {
            this.start(null);
            resolve(new URL('', this.streamConfig.getAddress()));
        });
    }
    start(statusCallback) {
        this.eventStream.initiateWSSession(new Peer_1.Peer('', this.streamConfig.dstLocation, null).withConfig(this.streamConfig));
        this.eventStream.registerPeersChangeCallback(this.onPeersChange);
        this.active = true;
        if (statusCallback != null) {
            statusCallback('STARTING...', false);
        }
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
