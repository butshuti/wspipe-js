export class WSEventStreamConfig{
    dstLocation: URL;
    keepAlive: boolean;
    path: string;
    constructor(dstLocation: URL, keepAlive: boolean){
        this.dstLocation = dstLocation;
        this.keepAlive = keepAlive;
        this.path = null;
        if(!Number.isInteger(parseInt(this.dstLocation.port))){
            //Default to HTTP port if invalid port set.
            this.withPort(dstLocation.protocol.startsWith('https') || location.protocol.startsWith('https') ? 443 : 80);

        }
    }

    withPort(port: number): WSEventStreamConfig {
        let urlStr = this.dstLocation.hostname + ':' + port + '/' + this.dstLocation.pathname;
        urlStr = this.dstLocation.protocol.replace(':', '') + '://' + urlStr.replace(/\/+/g, '/');
        this.dstLocation = new URL('', urlStr);
        return this;
    }

    withPath(path: string): WSEventStreamConfig {
        this.path = path;
        return this;
    }

    setKeepAlive(keepAlive: boolean): void {
        this.keepAlive = keepAlive;
    }

    getURI(): string {
        return (this.dstLocation.href + '/' + this.path).replace(/([^:/])\/+/g, '$1/');
    }

    getAddress(): string {
        return (this.dstLocation.href).replace(/([^:/])\/+/g, '$1/').replace(/\/$/, '');
    }
}
