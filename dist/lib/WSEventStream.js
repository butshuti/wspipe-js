"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const EventStream_1 = require("./EventStream");
const Peer_1 = require("./Peer");
const fetch_1 = require("./fetch");
const WS_CODE_NORMAL_CLOSURE = 1000;
//const MSG_SYNC_KEY = 'sync';
const MSG_TYPE_CTRL_KEY = 'ctrl';
const MSG_TYPE_DATA_KEY = 'data';
const API_WS_REQUEST_PATH = '/api/ws';
const SERVICE_CONFIG_PORT_KEY = 'port';
const SERVICE_CONFIG_SCHEME_KEY = 'scheme';
const SERVICE_CONFIG_PATH_KEY = 'path';
const SERVICE_CONFIG_PROTOCOL_KEY = 'protocol';
const SERVICE_CONFIG_NODE_NAME_KEY = 'nodeName';
const PROTO_PING_REQ_PREFIX = ':ping:';
const PROTO_PING_ACK_PREFIX = ':pong:';
const DEFAULT_STREAM_PROTOCOL = 'p2p';
const MAX_RETRIES = 3;
const CONN_TIMEOUT = 5000;
const WS_RECONNECT_INTERVAL = 3000;
const CONNECT_ON_SEND_REPEAT_INTERVAL = 5000;
const OPEN_SOCKETS = new Map();
const LATEST_PINGS = new Map();
;
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
        this.reconnectInterval = WS_RECONNECT_INTERVAL;
        this.wsTimeout = 0;
        this.wsRetryTimer = -1;
        this.pingTimer = -1;
        this.lastPingTs = -1;
        this.lastConnectOnSend = -1;
        this.pingInterval = CONNECT_ON_SEND_REPEAT_INTERVAL;
        this.pendingCommandACKs = new Map();
        this.activeSessions = new Map();
        this.lastReceivedMsg = new Map();
    }
    withConfig(config) {
        this.wsStreamConfig = config;
        return this;
    }
    getEventStreamConfig() {
        return this.wsStreamConfig;
    }
    static async getStreamDescriptor(url) {
        url = url.replace(/\/$/g, '') + API_WS_REQUEST_PATH;
        return new Promise((resolve, reject) => {
            fetch_1.timedFetch(url, { credentials: 'include' }, CONN_TIMEOUT).then((response) => {
                if (response.ok) {
                    return response.json();
                }
                else {
                    throw new Error(response.statusText);
                }
            }).then((json) => {
                if (json.hasOwnProperty(SERVICE_CONFIG_PORT_KEY) && json.hasOwnProperty(SERVICE_CONFIG_SCHEME_KEY)
                    && json.hasOwnProperty(SERVICE_CONFIG_PATH_KEY)) {
                    resolve({
                        port: Number.parseInt(json[SERVICE_CONFIG_PORT_KEY]),
                        scheme: json[SERVICE_CONFIG_SCHEME_KEY],
                        path: json[SERVICE_CONFIG_PATH_KEY],
                        protocol: json[SERVICE_CONFIG_PROTOCOL_KEY] || DEFAULT_STREAM_PROTOCOL,
                        nodeName: json[SERVICE_CONFIG_NODE_NAME_KEY] || new URL(url).hostname,
                        isDirect: () => (json[SERVICE_CONFIG_PROTOCOL_KEY] || DEFAULT_STREAM_PROTOCOL) === DEFAULT_STREAM_PROTOCOL
                    });
                }
                else {
                    reject(new Error('Received incomplete configuration response.'));
                }
            }).catch(err => {
                reject(err);
            });
        });
    }
    initiateWSSession(selectedPeer, eventCode) {
        let dstLocation = selectedPeer.getURL();
        if (dstLocation == null) {
            dstLocation = this.wsStreamConfig.dstLocation;
        }
        WSEventStream.getStreamDescriptor(dstLocation.href).then((streamDescr) => {
            let url = this.buildWSURL(streamDescr.scheme, dstLocation, streamDescr.port, streamDescr.path);
            let peer = new Peer_1.Peer(selectedPeer.getPeerName(), new URL('', url), null);
            peer.markPending(eventCode);
            this.startWS(peer);
        }).catch((err) => {
            console.error(err);
            this.onError('Error connecting to ' + selectedPeer.getURI());
        });
    }
    buildWSURL(scheme, baseURL, port, path) {
        let ret = new URL(path.replace(/^\/+/g, '/'), baseURL);
        ret.port = '' + port;
        ret.protocol = scheme.replace(/:$/g, '');
        +':';
        return ret.href;
    }
    onConnected(selectedPeer) {
        this.onStatus('Connected to ' + selectedPeer.getPeerName());
        this.getStatusMonitor().clearErrorState();
        let eventCode = selectedPeer.getPendingEventCode();
        if (eventCode != null && this.pendingCommandACKs.get(eventCode) !== undefined) {
            this.startSession(selectedPeer, eventCode, true);
        }
        this.wsRetryTimer = -1;
        this.reconnectInterval = WS_RECONNECT_INTERVAL;
        if (this.pingTimer > 0) {
            clearInterval(this.pingTimer);
        }
        let peerName = selectedPeer.getPeerName();
        this.pingInterval = CONNECT_ON_SEND_REPEAT_INTERVAL;
        this.pingTimer = setInterval(() => {
            let now = Date.now();
            let lastReceipt = this.lastReceivedMsg.get(peerName) || now;
            let lastReceiptWindow = now - (CONN_TIMEOUT * 2);
            if ((this.lastPingTs < now - this.pingInterval) && (lastReceipt < lastReceiptWindow)) {
                this.lastPingTs = now;
                this.ping(CONN_TIMEOUT).then(success => {
                    if (success) {
                        this.pingInterval *= 2;
                    }
                    else {
                        console.error('Ping timed out.');
                        this.onError('Connection lost.');
                        let ws = this.ws;
                        if (ws != null) {
                            ws.close();
                            this.clearConnection(ws.url);
                            clearInterval(this.pingTimer);
                            this.pingTimer = -1;
                        }
                    }
                }).catch(err => {
                    console.error(err);
                    this.pingInterval *= 3;
                });
            }
        }, this.pingInterval);
    }
    onDisconnected(selectedPeer) {
        this.onError('Disconnected from ' + selectedPeer.getPeerName());
        this.ws = null;
        if (this.activeSessions.has(selectedPeer.getPeerName())) {
            let eventCode = this.activeSessions.get(selectedPeer.getPeerName());
            if (eventCode) {
                this.onError('Attempting to reconnect to ' + selectedPeer.getPeerName() + ' in ' + (this.reconnectInterval / 1000) + ' seconds');
                if (this.wsRetryTimer < 0) {
                    this.wsRetryTimer = setTimeout(() => {
                        this.wsRetryTimer = -1;
                        if (this.ws == null) {
                            this.startWS(selectedPeer);
                        }
                    }, this.reconnectInterval);
                    this.reconnectInterval *= 2;
                }
                return;
            }
        }
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
                    socket.close(WS_CODE_NORMAL_CLOSURE);
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
            let ws = this.ws;
            if (ws != null && ws.readyState == WebSocket.CONNECTING) {
                ws.close(WS_CODE_NORMAL_CLOSURE);
                this.onError('Connection to ' + ws.url.replace(/.+:\/\//, '').replace(/\/.+/, '') + ' timed out');
            }
        }, timeout);
    }
    clearWSConnectionTimeout() {
        clearTimeout(this.wsTimeout);
    }
    ping(timeout) {
        let token = '' + Math.floor(Math.random() * Date.now());
        LATEST_PINGS.set(token, false);
        return new Promise(resolve => {
            setTimeout(() => {
                let result = LATEST_PINGS.get(token) || false;
                LATEST_PINGS.delete(token);
                resolve(result);
            }, timeout);
        });
    }
    pong(msg) {
        let token = msg.startsWith(PROTO_PING_ACK_PREFIX) ? msg.substring(PROTO_PING_ACK_PREFIX.length) : null;
        if (token != null) {
            if (LATEST_PINGS.has(token)) {
                LATEST_PINGS.set(token, true);
            }
        }
    }
    isPingMsg(msg) {
        return msg.startsWith(PROTO_PING_REQ_PREFIX);
    }
    isPongMsg(msg) {
        return msg.startsWith(PROTO_PING_ACK_PREFIX);
    }
    recordPong(msg) {
        let token = msg.startsWith(PROTO_PING_ACK_PREFIX) ? msg.substring(PROTO_PING_ACK_PREFIX.length) : null;
        if (token != null && LATEST_PINGS.has(token)) {
            LATEST_PINGS.set(token, true);
        }
    }
    processPingPongMsg(msg) {
        if (this.isPingMsg(msg)) {
            this.pong(msg);
            return true;
        }
        if (this.isPongMsg(msg)) {
            this.recordPong(msg);
            return true;
        }
        return false;
    }
    startWS(selectedPeer) {
        this.getStatusMonitor().clearErrorState();
        let url = selectedPeer.getURL().href;
        this.clearWSConnectionTimeout();
        this.onStatus('Connecting to ' + selectedPeer.getPeerName());
        if (this.isConnected(url)) {
            this.ws = this.getConnectionSocket(url);
        }
        else if (this.ws != null && this.ws.url != url) {
            this.ws.close(WS_CODE_NORMAL_CLOSURE);
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
        let peerName = selectedPeer.getPeerName();
        this.ws.onopen = function () {
            thiz.lastReceivedMsg.set(peerName, Date.now() + CONN_TIMEOUT);
            thiz.onConnected(selectedPeer);
        };
        this.ws.onclose = function () {
            thiz.clearConnection(ws.url);
            thiz.onDisconnected(selectedPeer);
        };
        this.ws.onmessage = function (evt) {
            thiz.lastReceivedMsg.set(peerName, Date.now());
            if (thiz.processPingPongMsg(evt.data)) {
                console.debug('PING-PONG:' + evt.data);
            }
            else {
                thiz.broadcastEvent(evt.data, ws.url);
            }
        };
        this.ws.onerror = function (evt) {
            console.error(evt);
            thiz.onError('Error connecting to ' + ws.url);
            thiz.clearConnection(this.url);
        };
        this.registerConnection(url, ws);
    }
    startSession(selectedPeer, eventCode, reset) {
        this.getStatusMonitor().clearErrorState();
        if (this.ws != null && this.ws.readyState == WebSocket.OPEN) {
            if (reset) {
                this.pendingCommandACKs.set(eventCode, 0);
            }
            this.ws.send(this.packMsg(eventCode, selectedPeer));
            let thiz = this;
            setInterval(function () {
                let retryCounter = thiz.pendingCommandACKs.get(eventCode);
                if (retryCounter !== undefined && retryCounter < MAX_RETRIES) {
                    thiz.startSession(selectedPeer, eventCode, false);
                    thiz.pendingCommandACKs.set(eventCode, retryCounter + 1);
                }
            }, 3000);
        }
        else {
            console.debug('Socket not open---CANNOT SEND MSG.');
        }
    }
    start(selectedPeer, eventCode) {
        this.activeSessions.set(selectedPeer.getPeerName(), eventCode);
        if (this.ws != null && this.ws.readyState == WebSocket.OPEN) {
            this.startSession(selectedPeer, eventCode, true);
        }
        else {
            this.pendingCommandACKs.set(eventCode, 0);
            this.initiateWSSession(selectedPeer, eventCode);
        }
    }
    stop(selectedPeer, eventCode) {
        this.activeSessions.delete(selectedPeer.getPeerName());
        if (this.ws != null) {
            this.ws.send(this.packMsg(eventCode, selectedPeer));
            if (!this.wsStreamConfig.keepAlive) {
                let _ws = this.ws;
                setTimeout(() => {
                    _ws.close(WS_CODE_NORMAL_CLOSURE);
                }, 1000);
                this.ws = null;
            }
            this.onStatus('Requested SESSION STOP');
        }
        this.counter = 0;
    }
    sendTo(msg, selectedPeer) {
        if (this.ws != null) {
            this.sendMsg(this.packMsg(msg, selectedPeer));
        }
        else if ((Date.now() - this.lastConnectOnSend) > this.pingInterval) {
            this.onError('Reconnecting to ' + selectedPeer.getPeerName());
            this.lastConnectOnSend = Date.now();
            this.pingInterval *= 2;
            this.startWS(selectedPeer);
            setTimeout(() => {
                this.sendMsg(this.packMsg(msg, selectedPeer));
            }, 2000);
        }
    }
    sendMsg(msg) {
        if (this.ws != null && this.ws.OPEN) {
            this.ws.send(msg);
        }
    }
    packMsg(msg, selectedPeer) {
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
            this.routeEvent(obj.attachment, eventGroup);
        }
    }
}
exports.WSEventStream = WSEventStream;
