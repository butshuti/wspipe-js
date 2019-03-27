"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const RelayedWSEventStream_1 = require("./RelayedWSEventStream");
const WSEventStream_1 = require("./WSEventStream");
const WSEventStreamConfig_1 = require("./WSEventStreamConfig");
const Peer_1 = require("./Peer");
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
        this.relayedEventStream = null;
        this.streamConfig = new WSEventStreamConfig_1.WSEventStreamConfig(url, true);
        this.peersChangeListener = peersListener;
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
        if (statusCallback != null) {
            statusCallback('STARTING...', false);
        }
        else {
            console.log('STARTING DISCOVERY CLIENT....');
        }
        return new Promise((resolve, reject) => {
            WSEventStream_1.WSEventStream.getStreamDescriptor(this.streamConfig.dstLocation.href).then(streamDescriptor => {
                console.log('STREAM_DESCR', streamDescriptor);
                this.streamConfig = this.streamConfig.withPath(streamDescriptor.path);
                let peerAddress = streamDescriptor.isDirect() ? null : this.streamConfig.getURI();
                let peerName = streamDescriptor.nodeName;
                let peer = new Peer_1.Peer(peerName, this.streamConfig.dstLocation, peerAddress).withConfig(this.streamConfig);
                if (streamDescriptor.isDirect()) {
                    this.registerPeers([peer]);
                }
                else {
                    RelayedWSEventStream_1.RelayedWSEventStream.initialize(this.streamConfig);
                    let eventStream = RelayedWSEventStream_1.RelayedWSEventStream.getInstance();
                    eventStream.initiateWSSession(peer);
                    eventStream.registerPeersChangeCallback(this.onPeersChange);
                }
                this.active = true;
                if (statusCallback != null) {
                    statusCallback('Registering ' + peer.getPeerName(), false);
                }
                resolve(true);
            }).catch(err => {
                console.error(err);
                reject(err);
            });
        });
    }
    static async test(url) {
        return new Promise(resolve => {
            WSEventStream_1.WSEventStream.getStreamDescriptor(url).then(streamDescriptor => {
                console.log('STREAM DESCR?', streamDescriptor);
                resolve(true);
            }).catch(_ => {
                resolve(false);
            });
        });
    }
    async checkStatus() {
        if (this.relayedEventStream) {
            return await this.relayedEventStream.testConnectivity(this.streamConfig.getURI()).then(httpResponse => {
                return { code: DiscoveryClient.convertHttpCode(httpResponse.status), statusMsg: httpResponse.statusText };
            }).catch(err => {
                return { code: exports.SERVER_CONNECTIVITY_STATUS_CODES.UNREACHABLE, statusMsg: err.message };
            });
        }
        return new Promise(resolve => {
            DiscoveryClient.test(this.streamConfig.dstLocation.href).then(success => {
                if (success) {
                    resolve({ code: exports.SERVER_CONNECTIVITY_STATUS_CODES.ONLINE, statusMsg: 'Connected' });
                }
                else {
                    resolve({ code: exports.SERVER_CONNECTIVITY_STATUS_CODES.UNREACHABLE, statusMsg: 'Offline' });
                }
            });
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
    extractPeerName(label) {
        return label.indexOf('@') < 0 ? label : label.substr(0, label.indexOf('@'));
    }
    registerPeers(peerUpdates) {
        if (this.peersChangeListener != null) {
            this.peersChangeListener.onNewPeers(peerUpdates);
        }
    }
    onPeersChange(peers) {
        console.log({ 'PEERS_CHG': peers });
        if (peers != null) {
            let peerUpdates = peers.map((element) => new Peer_1.Peer(this.extractPeerName(element), new URL('', this.uri), element));
            peerUpdates = peerUpdates.filter((peer, index, arr) => arr.findIndex((val) => val.getPeerName() == peer.getPeerName()) == index);
            peerUpdates.forEach(peer => peer.withConfig(this.streamConfig));
            this.registerPeers(peerUpdates);
        }
    }
    isActive() {
        return this.active;
    }
}
exports.DiscoveryClient = DiscoveryClient;
