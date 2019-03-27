"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Peer {
    constructor(name, peerLocation, peerAddress) {
        this.peerName = name;
        this.peerAddress = peerAddress;
        this.url = peerLocation;
        this.eventStreamURI = peerLocation.href;
        this.inError = false;
        this.reachable = false;
        this.streamConfig = null;
        this.pendingEventCode = null;
    }
    markPending(eventCode) {
        this.pendingEventCode = eventCode;
    }
    getPendingEventCode() {
        return this.pendingEventCode;
    }
    withConfig(config) {
        if (config != null) {
            this.streamConfig = config;
        }
        return this;
    }
    getStreamConfig() {
        return this.streamConfig;
    }
    getPeerName() {
        return this.peerName;
    }
    getURI() {
        return this.eventStreamURI;
    }
    getURL() {
        return this.streamConfig != null ? this.streamConfig.dstLocation : this.url;
    }
    getPeerAddress() {
        return this.peerAddress;
    }
    getPeerLocation() {
        let addr = this.peerAddress != null ? (this.peerAddress + '@') : '';
        return (addr + this.getURI().substr(this.getURI().indexOf('://') + 3)).replace(/\/+/i, '/');
    }
    markAsReachable() {
        this.reachable = true;
    }
    isMarkedAsReachable() {
        return this.reachable;
    }
    isDirect() {
        return this.peerAddress == null;
    }
}
exports.Peer = Peer;
