"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class WSEventStreamConfig {
    constructor(dstLocation, keepAlive) {
        this.dstLocation = dstLocation;
        this.keepAlive = keepAlive;
        this.path = dstLocation.pathname;
        if (!Number.isInteger(parseInt(this.dstLocation.port))) {
            //Default to HTTP port if invalid port set.
            this.withPort(dstLocation.protocol.startsWith('https') || location.protocol.startsWith('https') ? 443 : 80);
        }
    }
    withPort(port) {
        let urlStr = this.dstLocation.hostname + ':' + port + '/' + this.dstLocation.pathname;
        urlStr = this.dstLocation.protocol.replace(':', '') + '://' + urlStr.replace(/\/+/g, '/');
        this.dstLocation = new URL('', urlStr);
        return this;
    }
    withPath(path) {
        this.path = path;
        return this;
    }
    setKeepAlive(keepAlive) {
        this.keepAlive = keepAlive;
    }
    getURI() {
        return (this.dstLocation.href + '/' + this.path).replace(/([^:/])\/+/g, '$1/');
    }
    getAddress() {
        return (this.dstLocation.href).replace(/([^:/])\/+/g, '$1/').replace(/\/$/, '');
    }
}
exports.WSEventStreamConfig = WSEventStreamConfig;
