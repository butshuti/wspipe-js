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
    async isReachable() {
        if (this.url == null) {
            return Promise.resolve(false);
        }
        let thiz = this;
        let ping = Math.random().toString(36).toString();
        return fetch(this.url.href + 'echo?ping=' + ping, { method: 'GET' }).then(function (response) {
            return response.text();
        }).then(function (text) {
            thiz.reachable = text == ping;
            return thiz.reachable;
        }).catch(function (e) {
            console.error(e);
            thiz.reachable = false;
            return thiz.reachable;
        });
    }
    isDirect() {
        return this.peerAddress == null;
    }
}
exports.Peer = Peer;
