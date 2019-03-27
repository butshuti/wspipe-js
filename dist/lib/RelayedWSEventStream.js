"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const WSEventStream_1 = require("./WSEventStream");
const Peer_1 = require("./Peer");
;
;
;
const PROTO_HDR = 'event';
const PROTO_HDR_MSG = 'msg';
const PROTO_HDR_ERROR_REASON = 'reason';
const PROTO_HDR_PEER_INFO = 'peers';
const PROTO_HDR_SRC = 'src';
const PROTO_HDR_DST = 'dst';
const PROTO_MSG_HDR_SELF_ADDR = 'self';
const PROTO_MSG_HDR_CHANNEL = 'channel';
const PROTO_EVENT_TYPE_DISCOVERY = 'discovery';
const PROTO_EVENT_TYPE_ALIAS = 'alias';
const PROTO_EVENT_TYPE_ROLE = 'role';
const PROTO_EVENT_TYPE_MSG = 'msg';
const PROTO_EVENT_TYPE_INVITE = 'invite';
const PROTO_EVENT_TYPE_JOIN = 'join';
const PROTO_EVENT_TYPE_ERROR = 'error';
const PROTO_EVENT_TYPE_SUBSCRIBE = 'subscribe';
const PROTO_EVENT_TYPE_UNSUBSCRIBE = 'unsubscribe';
const PROTO_PEER_ROLE_SENSOR = 'SENSOR';
const PROTO_PEER_ROLE_DASHBOARD = 'DASHBOARD';
const STATE_IDLE = 'IDLE';
const STATE_ACTIVE = 'ACTIVE';
const STATE_ERROR = 'ERROR';
const PROTO_SESSION_PING_INTERVAL = 10000;
const PROTO_DEFAULT_HTTP_PORT = 80;
const PROTO_DEFAULT_HTTPS_PORT = 443;
const USE_TLS = false;
const WS_RECONNECT_INTERVAL = 3000;
class RelayedWSEventStream extends WSEventStream_1.WSEventStream {
    constructor(config) {
        super(config, null, null);
        this.sessionState = STATE_IDLE;
        this.localAddress = '';
        this.remoteAddress = '';
        this.lastConnectionURL = null;
        this.peersChangeCallback = null;
        this.currentPeers = new Set([]);
        this.eventChannels = new Set(['network_delay_test', 'app_data']);
        this.useTLS = USE_TLS;
        this.pingTimer = null;
        this.queryConnectedPeers = this.queryConnectedPeers.bind(this);
        this.initiateWSSession(new Peer_1.Peer('', config.dstLocation, null).withConfig(this.getEventStreamConfig()));
        this.localName = 'DASHBOARD-' + Math.random().toString(36).substring(10).toUpperCase();
    }
    static initialize(config) {
        RelayedWSEventStream.CONFIG = config;
        if (RelayedWSEventStream.INSTANCE != null) {
            RelayedWSEventStream.INSTANCE.withConfig(config);
        }
    }
    static getInstance() {
        if (RelayedWSEventStream.CONFIG == null) {
            throw new ReferenceError('RelayedWSEventStream not configured. Must be initialized with WSEventStreamConfig first.');
        }
        if (RelayedWSEventStream.INSTANCE == null) {
            RelayedWSEventStream.INSTANCE = new RelayedWSEventStream(RelayedWSEventStream.CONFIG);
            RelayedWSEventStream.HANDLERS = new Map();
        }
        return RelayedWSEventStream.INSTANCE;
    }
    registerHandler(peerName, handler) {
        RelayedWSEventStream.HANDLERS.set(peerName, handler);
        return this;
    }
    registerPeersChangeCallback(cbk) {
        this.peersChangeCallback = cbk;
    }
    withStatusMonitor(statusMonitor) {
        this.statusMonitor = statusMonitor;
        return this;
    }
    withConfig(config) {
        super.withConfig(config);
        return this;
    }
    withDstLabel(remoteAddress) {
        if (remoteAddress != null) {
            this.remoteAddress = remoteAddress;
        }
        return this;
    }
    open() {
    }
    close() {
    }
    onConnected(selectedPeer) {
        console.log('RelayedWSEventStream: onConnected...');
        this.onStatus('Connected');
        this.queryConnectedPeers();
        this.lastConnectionURL = selectedPeer.getURL();
        if (this.pingTimer != null) {
            clearInterval(this.pingTimer);
        }
        this.pingTimer = setInterval(this.queryConnectedPeers, PROTO_SESSION_PING_INTERVAL);
        super.onConnected(selectedPeer);
    }
    onDisconnected(selectedPeer) {
        this.onError('Disconnected');
        if (selectedPeer == null) {
            return;
        }
        console.log('RelayedWSEventStream: disconnected from ' + selectedPeer.getPeerName());
        let timeout = WS_RECONNECT_INTERVAL;
        if (this.pingTimer != null) {
            clearInterval(this.pingTimer);
            timeout = WS_RECONNECT_INTERVAL;
        }
        else {
            timeout = WS_RECONNECT_INTERVAL * 5;
        }
        if (selectedPeer.getURL() != null && this.lastConnectionURL != null &&
            selectedPeer.getURL().toString() == this.lastConnectionURL.toString()) {
            this.onError('Attempting to reconnect in ' + (timeout / 1000) + ' seconds');
            setTimeout(() => {
                this.startWS(selectedPeer);
            }, timeout);
        }
    }
    packMsg(msg, selectedPeer) {
        return this.wrapMsg(msg, selectedPeer.getPeerName());
    }
    wrapMsg(msg, dst) {
        return JSON.stringify({
            [PROTO_HDR]: PROTO_EVENT_TYPE_MSG,
            [PROTO_HDR_MSG]: msg,
            [PROTO_HDR_DST]: dst
        });
    }
    subscribeToSessionEvents() {
        this.eventChannels.forEach(channel => {
            this.onStatus('Subscribing to ' + channel + ' channel');
            this.currentPeers.forEach(peer => {
                this.sendMsg(JSON.stringify({
                    [PROTO_HDR]: PROTO_EVENT_TYPE_SUBSCRIBE,
                    [PROTO_MSG_HDR_CHANNEL]: channel,
                    [PROTO_HDR_DST]: peer
                }));
            });
        });
    }
    unsubscribeFromSessionEvents() {
        this.eventChannels.forEach(channel => {
            this.currentPeers.forEach(peer => {
                this.sendMsg(JSON.stringify({
                    [PROTO_HDR]: PROTO_EVENT_TYPE_UNSUBSCRIBE,
                    [PROTO_MSG_HDR_CHANNEL]: channel,
                    [PROTO_HDR_DST]: peer
                }));
            });
        });
    }
    startSession(selectedPeer, eventCode, reset) {
        this.subscribeToSessionEvents();
        super.startSession(selectedPeer, eventCode, reset);
    }
    stop(selectedPeer, eventCode) {
        super.stop(selectedPeer, eventCode);
        this.unsubscribeFromSessionEvents();
    }
    queryConnectedPeers() {
        this.onStatus('Updating connected devices...');
        this.sendMsg(JSON.stringify({ [PROTO_HDR]: PROTO_EVENT_TYPE_ALIAS, [PROTO_HDR_MSG]: this.localName }));
        this.sendMsg(JSON.stringify({ [PROTO_HDR]: PROTO_EVENT_TYPE_ROLE, [PROTO_HDR_MSG]: PROTO_PEER_ROLE_DASHBOARD }));
        this.sendMsg(JSON.stringify({ [PROTO_HDR]: PROTO_EVENT_TYPE_DISCOVERY }));
    }
    invitePeer(peer) {
        this.sendMsg(JSON.stringify({ [PROTO_HDR]: PROTO_EVENT_TYPE_INVITE, [PROTO_HDR_DST]: peer }));
    }
    joinPeerSession(peer) {
        this.sendMsg(JSON.stringify({ [PROTO_HDR]: PROTO_EVENT_TYPE_JOIN, [PROTO_HDR_DST]: peer }));
    }
    onPeersChanged() {
        if (this.peersChangeCallback != null) {
            this.peersChangeCallback([...this.currentPeers]);
        }
    }
    registerPeer(peer) {
        if (peer != null && !this.currentPeers.has(peer)) {
            this.currentPeers.add(this.parsePeerAddress(peer));
            this.onPeersChanged();
        }
    }
    testConnectivity(url) {
        let testWS;
        try {
            testWS = new WebSocket(url.replace('http', 'ws'));
            if (testWS.readyState == testWS.OPEN) {
                try {
                    testWS.close();
                }
                catch (err) { }
                return Promise.resolve(new Response());
            }
            else {
                let success = false;
                testWS.onerror = (evt) => {
                    success = false;
                };
                testWS.onopen = () => {
                    success = true;
                };
                return new Promise(resolve => {
                    setTimeout(() => {
                        resolve(new Response(null, { headers: {}, status: success ? 200 : 400, statusText: success ? 'OK' : 'Connection failed.' }));
                    }, 2000);
                });
            }
        }
        catch (err) {
            return Promise.resolve(new Response(null, { headers: {}, status: 400, statusText: err.message }));
        }
    }
    initiateWSSession(selectedPeer) {
        let dstLocation = selectedPeer.getURL();
        if (dstLocation == null) {
            dstLocation = this.getEventStreamConfig().dstLocation;
        }
        let port = parseInt(dstLocation.port);
        if (Number.isNaN(port)) {
            port = location.protocol.startsWith('https') ? PROTO_DEFAULT_HTTPS_PORT : PROTO_DEFAULT_HTTP_PORT;
        }
        this.onStatus('Connecting to ' + dstLocation);
        console.log('RelayedWSEventStream: CONECTING TO ' + dstLocation);
        let scheme = this.useTLS || dstLocation.href.startsWith('https') ? 'wss' : 'ws';
        let url = this.buildWSURL(scheme, dstLocation, port, this.wsStreamConfig.path);
        let peerName = selectedPeer != null ? selectedPeer.getPeerName() : '[UNNAMED-DEVICE]';
        let peer = new Peer_1.Peer(peerName, new URL('', url), selectedPeer.getPeerAddress());
        this.startWS(peer);
    }
    isValidSessionMessage(obj) {
        console.log(this.currentPeers, 'curAddr: ' + this.localAddress);
        if (obj.hasOwnProperty(PROTO_HDR_SRC) && obj.hasOwnProperty(PROTO_HDR_DST)) {
            let src = this.parsePeerAddress(obj[PROTO_HDR_SRC]);
            if (this.currentPeers.has(src) && obj[PROTO_HDR_DST] == this.localAddress) {
                return true;
            }
        }
        return false;
    }
    isSensorLabel(label) {
        return label != null && label.startsWith(PROTO_PEER_ROLE_SENSOR + '/');
    }
    parsePeerAddress(label) {
        return label.substring(label.indexOf('/') + 1);
    }
    savePeers(groupDescr) {
        console.log('RelayedWSEventStream: PEERS: ', groupDescr);
        if (this.peersChangeCallback != null) {
            let peers = groupDescr.peers;
            peers = peers.filter((label) => this.isSensorLabel(label)).map((label) => this.parsePeerAddress(label));
            this.onStatus('Discovered ' + peers.length + ' devices.');
            let oldPeers = this.currentPeers.size;
            this.currentPeers = new Set([...this.currentPeers].filter((peer) => peers.findIndex((x) => x == peer) >= 0));
            console.log('Old peers: ' + oldPeers + ', current: ' + this.currentPeers.size);
            if (oldPeers != this.currentPeers.size) {
                this.peersChangeCallback([...this.currentPeers]);
            }
            peers.forEach((peer) => {
                this.invitePeer(peer);
            });
        }
    }
    handleEventMessage(obj, eventType) {
        if (eventType == PROTO_EVENT_TYPE_INVITE || eventType == PROTO_EVENT_TYPE_JOIN) {
            if (obj.hasOwnProperty(PROTO_HDR_SRC) && obj.hasOwnProperty(PROTO_HDR_DST)) {
                let src = obj[PROTO_HDR_SRC];
                let target = obj[PROTO_HDR_DST];
                this.getStatusMonitor().clearErrorState();
                if (this.localAddress != '' && this.localAddress == target) {
                    if (eventType == PROTO_EVENT_TYPE_INVITE) {
                        console.log('INVITE from ' + src);
                        this.joinPeerSession(src);
                    }
                    else {
                        console.log(src + ' joined this session.');
                        this.registerPeer(src);
                    }
                }
                this.queryConnectedPeers();
                this.sessionState = STATE_ACTIVE;
            }
        }
        else if (eventType == PROTO_EVENT_TYPE_DISCOVERY) {
            if (obj.hasOwnProperty(PROTO_HDR_MSG)) {
                let payload = JSON.parse(JSON.stringify(obj[PROTO_HDR_MSG]));
                if (payload != null && payload.hasOwnProperty(PROTO_HDR_PEER_INFO) && payload.hasOwnProperty(PROTO_MSG_HDR_SELF_ADDR)) {
                    this.localAddress = payload.self;
                    this.savePeers(payload);
                }
            }
        }
        else if (eventType == PROTO_EVENT_TYPE_ERROR) {
            let payload = JSON.parse(JSON.stringify(obj[PROTO_HDR_MSG]));
            if (payload != null && payload.hasOwnProperty(PROTO_HDR_ERROR_REASON)) {
                this.sessionState = STATE_ERROR;
                console.log({ 'Connection state=>ERROR; reason=': payload[PROTO_HDR_ERROR_REASON] });
                this.onError('Connection error: ' + payload[PROTO_HDR_ERROR_REASON]);
            }
        }
        else if (eventType == PROTO_EVENT_TYPE_MSG) {
            if (this.isValidSessionMessage(obj)) {
                super.broadcastEvent(JSON.stringify(obj[PROTO_HDR_MSG]), obj[PROTO_HDR_SRC]);
            }
        }
    }
    broadcastEvent(evtData) {
        let obj = JSON.parse(evtData);
        if (obj.hasOwnProperty(PROTO_HDR) && obj.hasOwnProperty(PROTO_HDR_MSG)) {
            this.handleEventMessage(obj, obj.event);
        }
        else {
            console.log('Unknown msg format: ' + evtData);
        }
    }
    getEventHandler(eventGroup) {
        if (eventGroup == null) {
            return null;
        }
        if (RelayedWSEventStream.HANDLERS.has(eventGroup)) {
            let ret = RelayedWSEventStream.HANDLERS.get(eventGroup);
            if (ret !== undefined) {
                return ret;
            }
        }
        return null;
    }
}
exports.RelayedWSEventStream = RelayedWSEventStream;
