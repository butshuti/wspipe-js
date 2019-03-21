"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const EventStream_1 = require("./EventStream");
const Peer_1 = require("./Peer");
const fetch_1 = require("./fetch");
//const MSG_SYNC_KEY = 'sync';
const MSG_TYPE_CTRL_KEY = 'ctrl';
const MSG_TYPE_DATA_KEY = 'data';
const API_WS_REQUEST_PATH = '/api/ws';
const SERVICE_CONFIG_PORT_KEY = 'port';
const SERVICE_CONFIG_SCHEME_KEY = 'scheme';
const SERVICE_CONFIG_PATH_KEY = 'path';
const MAX_RETRIES = 3;
const CONN_TIMEOUT = 5000;
const OPEN_SOCKETS = new Map();
;
class WSEventStream extends EventStream_1.EventStream {
    constructor(config, handler, statusMonitor) {
        super(handler, statusMonitor);
        this.ws = null;
        this.wsStreamConfig = config;
        if (this.wsStreamConfig.path == null) {
            this.wsStreamConfig.withPath(API_WS_REQUEST_PATH);
        }
        this.counter = 0;
        this.retryCounter = 0;
        this.wsTimeout = 0;
        this.pendingCommandACKs = new Map();
    }
    withConfig(config) {
        this.wsStreamConfig = config;
        return this;
    }
    getEventStreamConfig() {
        return this.wsStreamConfig;
    }
    initiateWSSession(selectedPeer, eventCode) {
        let dstLocation = selectedPeer.getURL();
        if (dstLocation == null) {
            dstLocation = this.wsStreamConfig.dstLocation;
        }
        let thiz = this;
        fetch_1.timedFetch(dstLocation.origin + this.wsStreamConfig.path, {}, CONN_TIMEOUT).then((response) => {
            if (response.ok) {
                return response.json();
            }
            else {
                throw new Error('Received ' + response.status + ' from server: ' + response.statusText);
            }
        }).then((json) => {
            if (json.hasOwnProperty(SERVICE_CONFIG_PORT_KEY) && json.hasOwnProperty(SERVICE_CONFIG_SCHEME_KEY)
                && json.hasOwnProperty(SERVICE_CONFIG_PATH_KEY)) {
                let url = thiz.buildWSURL(json[SERVICE_CONFIG_SCHEME_KEY], dstLocation.hostname, json[SERVICE_CONFIG_PORT_KEY], json[SERVICE_CONFIG_PATH_KEY]);
                let peer = new Peer_1.Peer('', new URL('', url), null);
                peer.markPending(eventCode);
                thiz.startWS(peer);
            }
            else {
                console.error('Received incomplete configuration response.');
            }
        }).catch((err) => {
            console.error(err);
            thiz.onError('Error connecting to ' + dstLocation);
        });
    }
    buildWSURL(scheme, hostname, port, path) {
        if (path[0] == '/') {
            path = path.substring(1);
        }
        return scheme + '://' + (hostname + ':' + port + '/' + path).replace(/\/+/g, '/');
    }
    onConnected(selectedPeer) {
        this.getStatusMonitor().clearErrorState();
        let eventCode = selectedPeer.getPendingEventCode();
        if (eventCode != null && this.pendingCommandACKs.get(eventCode) !== undefined) {
            this.startSession(selectedPeer, eventCode, true);
        }
        console.log('Connected to ' + selectedPeer.getPeerName());
    }
    onDisconnected(selectedPeer) {
        this.ws = null;
        console.log('Disconnected from ' + selectedPeer.getPeerName() + '@' + selectedPeer.getURI());
    }
    onError(msg) {
        console.error(msg);
        this.getStatusMonitor().setErrorMessage(msg);
    }
    onStatus(msg) {
        this.getStatusMonitor().setStatusMessage(msg);
    }
    registerConnection(url, socket) {
        if (url != null && socket != null) {
            OPEN_SOCKETS.set(url, socket);
        }
    }
    getConnectionSocket(url) {
        if (OPEN_SOCKETS.has(url)) {
            let ret = OPEN_SOCKETS.get(url);
            if (ret !== undefined) {
                return ret;
            }
        }
        return null;
    }
    isConnected(url) {
        if (OPEN_SOCKETS.has(url)) {
            let socket = OPEN_SOCKETS.get(url);
            if (socket !== undefined) {
                return (socket.OPEN == 1 || socket.CONNECTING == 1) && socket.url == url;
            }
        }
        return false;
    }
    clearConnection(url) {
        if (OPEN_SOCKETS.has(url)) {
            try {
                let socket = OPEN_SOCKETS.get(url);
                if (socket !== undefined) {
                    socket.close();
                }
            }
            catch (e) {
                console.error(e);
            }
            OPEN_SOCKETS.delete(url);
        }
    }
    setWSConnectTimeout(timeout) {
        this.wsTimeout = setTimeout(() => {
            if (this.ws != null && this.ws.readyState == WebSocket.CONNECTING) {
                this.ws.close();
                this.onError('Connection to ' + this.ws.url.replace(/.+:\/\//, '').replace(/\/.+/, '') + ' timed out');
            }
        }, timeout);
    }
    clearWSConnectionTimeout() {
        clearTimeout(this.wsTimeout);
    }
    startWS(selectedPeer) {
        this.getStatusMonitor().clearErrorState();
        let url = selectedPeer.getURL().href;
        console.log('WSEventStream::: Connecting to ' + url + (this.isConnected(url) ? ' -- CONNECTION EXISTS.(' + this.ws + ')' : '...'));
        this.clearWSConnectionTimeout();
        if (this.isConnected(url)) {
            this.ws = this.getConnectionSocket(url);
        }
        else if (this.ws != null && this.ws.url != url) {
            this.ws.close();
            this.ws = null;
        }
        if (this.ws == null || this.ws.readyState == WebSocket.CLOSED || this.ws.readyState == WebSocket.CLOSING) {
            this.ws = new WebSocket(url);
        }
        else if (this.ws.readyState == WebSocket.OPEN) {
            this.onConnected(selectedPeer);
            return;
        }
        this.setWSConnectTimeout(CONN_TIMEOUT);
        let thiz = this;
        let ws = this.ws;
        this.ws.onopen = function () {
            thiz.onConnected(selectedPeer);
        };
        this.ws.onclose = function () {
            console.log('Closed!');
            thiz.clearConnection(ws.url);
            thiz.onDisconnected(selectedPeer);
        };
        this.ws.onmessage = function (evt) {
            thiz.broadcastEvent(evt.data, ws.url);
        };
        this.ws.onerror = function (evt) {
            console.log(evt);
            thiz.onError('Error connecting to ' + ws.url);
            thiz.clearConnection(this.url);
        };
        this.registerConnection(url, ws);
    }
    startSession(selectedPeer, eventCode, reset) {
        this.getStatusMonitor().clearErrorState();
        if (this.ws != null && this.ws.OPEN) {
            if (reset) {
                this.pendingCommandACKs.set(eventCode, 0);
            }
            this.ws.send(this.packMsg(eventCode, selectedPeer));
            this.onStatus('Starting a new session....');
            let thiz = this;
            setInterval(function () {
                let retryCounter = thiz.pendingCommandACKs.get(eventCode);
                if (retryCounter !== undefined && retryCounter < MAX_RETRIES) {
                    thiz.onStatus('startSession(): retry #' + thiz.retryCounter);
                    thiz.startSession(selectedPeer, eventCode, false);
                    thiz.pendingCommandACKs.set(eventCode, retryCounter + 1);
                }
            }, 3000);
        }
        else {
            console.log('Socket not open---CANNOT SEND MSG.');
        }
    }
    start(selectedPeer, eventCode) {
        if (this.ws != null && this.ws.readyState == WebSocket.OPEN) {
            this.startSession(selectedPeer, eventCode, true);
        }
        else {
            this.pendingCommandACKs.set(eventCode, 0);
            this.initiateWSSession(selectedPeer, eventCode);
            console.log('---pending start...');
        }
    }
    stop(selectedPeer, eventCode) {
        if (this.ws != null) {
            this.ws.send(this.packMsg(eventCode, selectedPeer));
            if (!this.wsStreamConfig.keepAlive) {
                let _ws = this.ws;
                setTimeout(() => {
                    _ws.close();
                }, 1000);
                this.ws = null;
            }
            this.onStatus('Requested SESSION STOP');
        }
        this.counter = 0;
    }
    sendTo(msg, selectedPeer) {
        this.sendMsg(this.packMsg(msg, selectedPeer));
    }
    sendMsg(msg) {
        if (this.ws != null && this.ws.OPEN) {
            this.ws.send(msg);
        }
    }
    packMsg(msg, selectedPeer) {
        console.log('Msg: ' + msg + '=>' + selectedPeer);
        return msg;
    }
    handleCtrlEvent(evt) {
        if (evt.ctrl !== undefined) {
            if (this.pendingCommandACKs.has(evt.ctrl) && this.pendingCommandACKs.get(evt.ctrl) !== undefined) {
                this.onStatus('Session in progress...');
                this.pendingCommandACKs.delete(evt.ctrl);
            }
        }
    }
    broadcastEvent(evtData, eventGroup) {
        let obj;
        try {
            obj = JSON.parse(evtData);
        }
        catch (e) {
            console.debug(e);
            return;
        }
        if (obj.sync == MSG_TYPE_CTRL_KEY) {
            this.handleCtrlEvent(obj);
        }
        else if (obj.sync === MSG_TYPE_DATA_KEY) {
            this.routeEvent(JSON.parse(obj.attachment), eventGroup);
        }
        else {
            this.routeEvent(JSON.parse(JSON.stringify(obj)), eventGroup);
        }
    }
}
exports.WSEventStream = WSEventStream;
