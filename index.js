define("module/EventHandler", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
});
define("module/StatusMonitor", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
});
define("module/WSEventStreamConfig", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class WSEventStreamConfig {
        constructor(dstLocation, keepAlive) {
            this.dstLocation = dstLocation;
            this.keepAlive = keepAlive;
            this.path = null;
            if (!Number.isInteger(parseInt(this.dstLocation.port))) {
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
});
define("module/Peer", ["require", "exports"], function (require, exports) {
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
            return this.streamConfig != null ? this.getStreamConfig().dstLocation : this.url;
        }
        getPeerAddress() {
            return this.peerAddress;
        }
        getPeerLocation() {
            let addr = this.getPeerAddress() != null ? (this.getPeerAddress() + '@') : '';
            return (addr + this.getURI().substr(this.getURI().indexOf('://') + 3)).replace(/\/+/i, '/');
        }
        markAsReachable() {
            this.reachable = true;
        }
        isMarkedAsReachable() {
            return this.reachable;
        }
        isReachable() {
            if (this.url == null) {
                return false;
            }
            let thiz = this;
            let ping = Math.random().toString(36).toString();
            fetch(this.url.href + 'echo?ping=' + ping, { method: 'GET' }).then(function (response) {
                return response.text();
            }).then(function (text) {
                thiz.reachable = text == ping;
                console.log(text);
            }).catch(function (e) {
                console.error(e);
                thiz.reachable = false;
            });
            return thiz.reachable;
        }
        isDirect() {
            return this.peerAddress == null;
        }
    }
    exports.Peer = Peer;
});
define("module/EventStream", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class NoOpStatusMonitor {
        setErrorMessage(msg) {
            console.error(msg);
        }
        setStatusMessage(msg) {
            console.log(msg);
        }
        clearErrorState() {
        }
    }
    class EventStream {
        constructor(handler, statusMonitor) {
            this.handler = handler;
            this.statusMonitor = statusMonitor;
            this.counter = 0;
        }
        getCounter() {
            return this.counter++;
        }
        getEventHandler(eventGroup) {
            if (eventGroup != null) {
                return this.handler != null ? this.handler : null;
            }
            return this.handler;
        }
        getStatusMonitor() {
            return this.statusMonitor || new NoOpStatusMonitor();
        }
        routeEvent(obj, eventGroup) {
            let handler = this.getEventHandler(eventGroup);
            if (handler != null) {
                if (obj.hasOwnProperty('depth') && obj.hasOwnProperty('ts') && obj.hasOwnProperty('recoil')) {
                    handler.handleEvent(this.counter++, obj);
                }
            }
        }
        broadcast(evtIndex, obj) {
            if (this.handler != null) {
                this.handler.handleEvent(evtIndex, obj);
            }
        }
        start(dstPeer) {
            console.log('dstPeer => ' + dstPeer);
        }
        stop(dstPeer) {
            console.log('dstPeer => ' + dstPeer);
        }
    }
    exports.EventStream = EventStream;
});
define("module/fetch", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.timedFetch = (url, options, timeout = 5000) => new Promise((resolve, reject) => {
        let timer = setTimeout(() => reject('Fetch: request timeout out.'), timeout);
        fetch(url, options).then(response => resolve(response), error => reject(error)).finally(() => clearTimeout(timer));
    });
});
define("module/WSEventStream", ["require", "exports", "module/EventStream", "module/Peer", "module/fetch"], function (require, exports, EventStream_1, Peer_1, fetch_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const MSG_START_SESSION = '_start_';
    const MSG_END_SESSION = '_end_';
    const MSG_TYPE_CTRL_KEY = 'ctrl';
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
            this.pendingStart = false;
        }
        withConfig(config) {
            this.wsStreamConfig = config;
            return this;
        }
        getEventStreamConfig() {
            return this.wsStreamConfig;
        }
        initiateWSSession(selectedPeer) {
            let dstLocation = selectedPeer.getURL();
            if (dstLocation == null) {
                dstLocation = this.wsStreamConfig.dstLocation;
            }
            let thiz = this;
            fetch_1.timedFetch(dstLocation.origin + this.wsStreamConfig.path, {}, CONN_TIMEOUT).then((response) => {
                console.log(response);
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
            if (this.pendingStart) {
                this.startSession(selectedPeer, true);
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
            console.log(msg);
            this.getStatusMonitor().setStatusMessage(msg);
        }
        isPendingStart() {
            return this.pendingStart;
        }
        registerConnection(url, socket) {
            if (url != null && socket != null) {
                OPEN_SOCKETS.set(url, socket);
            }
        }
        getConnectionSocket(url) {
            if (OPEN_SOCKETS.has(url)) {
                return OPEN_SOCKETS.get(url);
            }
            return null;
        }
        isConnected(url) {
            if (OPEN_SOCKETS.has(url)) {
                let socket = OPEN_SOCKETS.get(url);
                return (socket.OPEN == 1 || socket.CONNECTING == 1) && socket.url == url;
            }
            return false;
        }
        clearConnection(url) {
            if (OPEN_SOCKETS.has(url)) {
                try {
                    OPEN_SOCKETS.get(url).close();
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
        startSession(selectedPeer, reset) {
            this.getStatusMonitor().clearErrorState();
            if (this.ws != null && this.ws.OPEN) {
                if (reset) {
                    this.retryCounter = 0;
                    this.pendingStart = true;
                }
                this.ws.send(this.packMsg(MSG_START_SESSION, selectedPeer));
                this.onStatus('Starting a new session....');
                let thiz = this;
                setInterval(function () {
                    if (thiz.pendingStart && thiz.retryCounter < MAX_RETRIES) {
                        thiz.onStatus('startSession(): retry #' + thiz.retryCounter);
                        thiz.startSession(selectedPeer, false);
                        thiz.retryCounter++;
                    }
                }, 3000);
            }
            else {
                console.log('Socket not open---CANNOT SEND MSG.');
            }
        }
        start(selectedPeer) {
            console.log('WS? ' + this.ws);
            if (this.ws != null && this.ws.readyState == WebSocket.OPEN) {
                this.startSession(selectedPeer, true);
            }
            else {
                this.pendingStart = true;
                this.initiateWSSession(selectedPeer);
                console.log('---pending start...');
            }
            console.log('Start????');
        }
        stop(selectedPeer) {
            if (this.ws != null) {
                this.ws.send(this.packMsg(MSG_END_SESSION, selectedPeer));
                if (!this.wsStreamConfig.keepAlive) {
                    this.ws.close();
                    this.ws = null;
                }
                this.onStatus('Requested SESSION STOP');
            }
            this.counter = 0;
            this.pendingStart = false;
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
                if (evt.ctrl == MSG_START_SESSION.split(';')[0]) {
                    if (this.pendingStart) {
                        this.onStatus('Session in progress...');
                    }
                    this.pendingStart = false;
                }
                else if (evt.ctrl == MSG_END_SESSION) {
                    this.pendingStart = false;
                    this.onStatus('Session ended.');
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
            if (obj.sync !== undefined && obj.sync == MSG_TYPE_CTRL_KEY) {
                this.handleCtrlEvent(obj);
            }
            else {
                this.routeEvent(JSON.parse(JSON.stringify(obj)), eventGroup);
            }
            console.log(obj);
        }
    }
    exports.WSEventStream = WSEventStream;
});
define("module/RelayedWSEventStream", ["require", "exports", "module/WSEventStream", "module/Peer"], function (require, exports, WSEventStream_1, Peer_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
            this.currentPeers = new Set([]);
            this.eventChannels = new Set(['network_delay_test', 'app_data']);
            this.useTLS = USE_TLS;
            this.pingTimer = null;
            this.queryConnectedPeers = this.queryConnectedPeers.bind(this);
            this.initiateWSSession(new Peer_2.Peer('', config.dstLocation, null).withConfig(this.getEventStreamConfig()));
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
        startSession(selectedPeer, reset) {
            this.subscribeToSessionEvents();
            super.startSession(selectedPeer, reset);
        }
        stop(selectedPeer) {
            this.unsubscribeFromSessionEvents();
            super.stop(selectedPeer);
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
            this.peersChangeCallback([...this.currentPeers]);
        }
        registerPeer(peer) {
            if (peer != null && !this.currentPeers.has(peer)) {
                this.currentPeers.add(this.parsePeerAddress(peer));
                this.onPeersChanged();
            }
        }
        initiateWSSession(selectedPeer) {
            let dstLocation = selectedPeer != null ? selectedPeer.getURL() : null;
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
            let url = this.buildWSURL(scheme, dstLocation.hostname, port, this.wsStreamConfig.path);
            let peerName = selectedPeer != null ? selectedPeer.getPeerName() : '[UNNAMED-DEVICE]';
            let peer = new Peer_2.Peer(peerName, new URL('', url), selectedPeer.getPeerAddress());
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
                return RelayedWSEventStream.HANDLERS.get(eventGroup);
            }
        }
    }
    exports.RelayedWSEventStream = RelayedWSEventStream;
});
define("module/DiscoveryClient", ["require", "exports", "module/RelayedWSEventStream", "module/WSEventStreamConfig", "module/Peer"], function (require, exports, RelayedWSEventStream_1, WSEventStreamConfig_1, Peer_3) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
            this.eventStream.initiateWSSession(new Peer_3.Peer('', this.streamConfig.dstLocation, null).withConfig(this.streamConfig));
            this.eventStream.registerPeersChangeCallback(this.onPeersChange);
            this.active = true;
            if (statusCallback != null) {
                statusCallback('STARTING...', false);
            }
        }
        extractPeerName(label) {
            return label.indexOf('@') < 0 ? label : label.substr(0, label.indexOf('@'));
        }
        onPeersChange(peers) {
            console.log({ 'PEERS_CHG': peers });
            if (peers != null) {
                let peerUpdates = peers.map((element) => new Peer_3.Peer(this.extractPeerName(element), new URL('', this.uri), element));
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
});
define("index", ["require", "exports", "module/DiscoveryClient", "module/EventStream", "module/Peer", "module/RelayedWSEventStream", "module/WSEventStream", "module/WSEventStreamConfig"], function (require, exports, DiscoveryClient_1, EventStream_2, Peer_4, RelayedWSEventStream_2, WSEventStream_2, WSEventStreamConfig_2) {
    "use strict";
    function __export(m) {
        for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    __export(DiscoveryClient_1);
    __export(EventStream_2);
    __export(Peer_4);
    __export(RelayedWSEventStream_2);
    __export(WSEventStream_2);
    __export(WSEventStreamConfig_2);
});
