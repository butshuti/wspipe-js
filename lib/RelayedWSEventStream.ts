import {WSEventStream} from './WSEventStream';
import {EventHandler} from './EventHandler';
import {WSEventStreamConfig} from './WSEventStreamConfig';
import {Peer} from './Peer';
import { StatusMonitor } from './StatusMonitor';

interface EventMessage {
    src: string;
    dst: string;
    event: string;
    msg: JSON;
    group: string;
    channel: string;
};

interface ErrorEventMessage {
    ref: string;
    reason: string;
};

interface GroupDescription {
    self: string;
    peers: string[]
};

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

export class RelayedWSEventStream extends WSEventStream{

    static INSTANCE: RelayedWSEventStream;
    static CONFIG: WSEventStreamConfig;
    static HANDLERS: Map<string, EventHandler>;
    sessionState: string;
    localAddress: string;
    remoteAddress: string;
    lastConnectionURL: URL;
    localName: string;
    currentPeers: Set<string>;
    eventChannels: Set<string>;
    useTLS: boolean;
    pingTimer: number;
    peersChangeCallback: Function;

    constructor(config: WSEventStreamConfig){
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
        this.initiateWSSession(new Peer('', config.dstLocation, null).withConfig(this.getEventStreamConfig()));
        this.localName = 'DASHBOARD-' + Math.random().toString(36).substring(10).toUpperCase();
    }

    static initialize(config: WSEventStreamConfig): void {
        RelayedWSEventStream.CONFIG = config;
        if(RelayedWSEventStream.INSTANCE != null){
            RelayedWSEventStream.INSTANCE.withConfig(config);
        }
    }
    static getInstance(): RelayedWSEventStream {
        if(RelayedWSEventStream.CONFIG == null){
            throw new ReferenceError('RelayedWSEventStream not configured. Must be initialized with WSEventStreamConfig first.');
        }
        if(RelayedWSEventStream.INSTANCE == null){
            RelayedWSEventStream.INSTANCE = new RelayedWSEventStream(RelayedWSEventStream.CONFIG);
            RelayedWSEventStream.HANDLERS = new Map();
        }
        return RelayedWSEventStream.INSTANCE;
    }

    registerHandler(peerName: string, handler: EventHandler): RelayedWSEventStream {
        RelayedWSEventStream.HANDLERS.set(peerName, handler);
        return this;
    }

    registerPeersChangeCallback(cbk: Function): void {
        this.peersChangeCallback = cbk;
    }

    withStatusMonitor(statusMonitor: StatusMonitor): RelayedWSEventStream {
        this.statusMonitor = statusMonitor;
        return this;
    }

    withConfig(config: WSEventStreamConfig): RelayedWSEventStream {
        super.withConfig(config);
        return this;
    }

    withDstLabel(remoteAddress: string): RelayedWSEventStream {
        if(remoteAddress != null){
            this.remoteAddress = remoteAddress;
        }
        return this;
    }

    open(): void {

    }

    close(): void {

    }

    onConnected(selectedPeer: Peer): void {
        console.log('RelayedWSEventStream: onConnected...');
        this.onStatus('Connected');
        this.queryConnectedPeers();
        this.lastConnectionURL = selectedPeer.getURL();
        if(this.pingTimer != null){
            clearInterval(this.pingTimer);
        }
        this.pingTimer = setInterval(this.queryConnectedPeers, PROTO_SESSION_PING_INTERVAL);
        super.onConnected(selectedPeer);
    }

    onDisconnected(selectedPeer: Peer): void {
        this.onError('Disconnected');
        if(selectedPeer == null){
            return;
        }
        console.log('RelayedWSEventStream: disconnected from ' + selectedPeer.getPeerName());
        let timeout: number = WS_RECONNECT_INTERVAL;
        if(this.pingTimer != null){
            clearInterval(this.pingTimer);
            timeout = WS_RECONNECT_INTERVAL;
        }else{
            timeout = WS_RECONNECT_INTERVAL * 5;
        }
        if(selectedPeer.getURL() != null && this.lastConnectionURL != null && 
                selectedPeer.getURL().toString() == this.lastConnectionURL.toString()){
            this.onError('Attempting to reconnect in ' + (timeout/1000) + ' seconds');
            setTimeout(() => {
                this.startWS(selectedPeer);
            }, timeout);
        }
    }

    packMsg(msg: string, selectedPeer: Peer): string {
        return this.wrapMsg(msg, selectedPeer.getPeerName());
    }

    wrapMsg(msg: string, dst: string): string{
        return JSON.stringify({
            [PROTO_HDR]: PROTO_EVENT_TYPE_MSG,
            [PROTO_HDR_MSG]: msg,
            [PROTO_HDR_DST]: dst
        });
    }

    subscribeToSessionEvents(): void {
        this.eventChannels.forEach(channel => {
            this.onStatus('Subscribing to ' + channel + ' channel');
            this.currentPeers.forEach(peer => {
                this.sendMsg(JSON.stringify({
                    [PROTO_HDR]: PROTO_EVENT_TYPE_SUBSCRIBE,
                    [PROTO_MSG_HDR_CHANNEL]: channel,
                    [PROTO_HDR_DST]: peer}));
            });
        });
    }

    unsubscribeFromSessionEvents(): void {
        this.eventChannels.forEach(channel => {
            this.currentPeers.forEach(peer => {
                this.sendMsg(JSON.stringify({
                    [PROTO_HDR]: PROTO_EVENT_TYPE_UNSUBSCRIBE,
                    [PROTO_MSG_HDR_CHANNEL]: channel,
                    [PROTO_HDR_DST]: peer}));
            });
        });
    }

    startSession(selectedPeer: Peer, reset: boolean): void {
        this.subscribeToSessionEvents();
        super.startSession(selectedPeer, reset);
    }

    stop(selectedPeer: Peer): void {
        this.unsubscribeFromSessionEvents();
        super.stop(selectedPeer);
    }

    queryConnectedPeers(): void {
        this.onStatus('Updating connected devices...');
        this.sendMsg(JSON.stringify({[PROTO_HDR]: PROTO_EVENT_TYPE_ALIAS, [PROTO_HDR_MSG]: this.localName}));
        this.sendMsg(JSON.stringify({[PROTO_HDR]: PROTO_EVENT_TYPE_ROLE, [PROTO_HDR_MSG]: PROTO_PEER_ROLE_DASHBOARD}));
        this.sendMsg(JSON.stringify({[PROTO_HDR]: PROTO_EVENT_TYPE_DISCOVERY}));
    }

    invitePeer(peer: string): void {
        this.sendMsg(JSON.stringify({[PROTO_HDR]: PROTO_EVENT_TYPE_INVITE, [PROTO_HDR_DST]: peer}));
    }

    joinPeerSession(peer: string): void {
        this.sendMsg(JSON.stringify({[PROTO_HDR]: PROTO_EVENT_TYPE_JOIN, [PROTO_HDR_DST]: peer}));
    }

    onPeersChanged():void {
        this.peersChangeCallback([...this.currentPeers]);
    }

    registerPeer(peer: string): void {
        if(peer != null && !this.currentPeers.has(peer)){
            this.currentPeers.add(this.parsePeerAddress(peer));
            this.onPeersChanged();
        }
    }

    initiateWSSession(selectedPeer: Peer): void{
        let dstLocation: URL = selectedPeer != null ? selectedPeer.getURL() : null;
        if(dstLocation == null){
            dstLocation = this.getEventStreamConfig().dstLocation;
        }
        let port: number = parseInt(dstLocation.port);
        if(Number.isNaN(port)){
            port = location.protocol.startsWith('https') ? PROTO_DEFAULT_HTTPS_PORT : PROTO_DEFAULT_HTTP_PORT;
        }
        this.onStatus('Connecting to ' + dstLocation);
        console.log('RelayedWSEventStream: CONECTING TO ' + dstLocation);
        let scheme: string = this.useTLS || dstLocation.href.startsWith('https') ? 'wss':'ws';
        let url : string = this.buildWSURL(scheme, dstLocation.hostname, port, this.wsStreamConfig.path);
        let peerName: string = selectedPeer != null ? selectedPeer.getPeerName() : '[UNNAMED-DEVICE]';
        let peer: Peer = new Peer(peerName, new URL('', url), selectedPeer.getPeerAddress());
        this.startWS(peer);
    }

    isValidSessionMessage(obj: EventMessage): boolean {
        console.log(this.currentPeers, 'curAddr: ' + this.localAddress);
        if(obj.hasOwnProperty(PROTO_HDR_SRC) && obj.hasOwnProperty(PROTO_HDR_DST)){
            let src: string = this.parsePeerAddress(obj[PROTO_HDR_SRC]);
            if(this.currentPeers.has(src) && obj[PROTO_HDR_DST] == this.localAddress){
                return true;
            }
        }
        return false;
    }

    isSensorLabel(label: string): boolean {
        return label != null && label.startsWith(PROTO_PEER_ROLE_SENSOR + '/');
    }

    parsePeerAddress(label: string): string {
        return label.substring(label.indexOf('/')+1);
    }

    savePeers(groupDescr: GroupDescription): void {
        console.log('RelayedWSEventStream: PEERS: ', groupDescr);
        if(this.peersChangeCallback != null){
            let peers: string[] = groupDescr.peers;
            peers = peers.filter((label) => this.isSensorLabel(label)).map((label) => this.parsePeerAddress(label));
            this.onStatus('Discovered ' + peers.length + ' devices.');
            let oldPeers: number = this.currentPeers.size;
            this.currentPeers = new Set([...this.currentPeers].filter((peer) => peers.findIndex((x)=> x==peer) >= 0));
            console.log('Old peers: ' + oldPeers + ', current: ' + this.currentPeers.size);
            if(oldPeers != this.currentPeers.size){
                this.peersChangeCallback([...this.currentPeers]);
            }
            peers.forEach((peer) => {
                this.invitePeer(peer);
            });
        }
    }

    handleEventMessage(obj: EventMessage, eventType: string): void {
        if(eventType == PROTO_EVENT_TYPE_INVITE || eventType == PROTO_EVENT_TYPE_JOIN){
            if(obj.hasOwnProperty(PROTO_HDR_SRC) && obj.hasOwnProperty(PROTO_HDR_DST)){
                let src: string = obj[PROTO_HDR_SRC];
                let target: string = obj[PROTO_HDR_DST];
                this.getStatusMonitor().clearErrorState();
                if(this.localAddress != '' && this.localAddress == target){
                    if(eventType == PROTO_EVENT_TYPE_INVITE){
                        console.log('INVITE from ' + src);
                        this.joinPeerSession(src);
                    }else{
                        console.log(src + ' joined this session.');
                        this.registerPeer(src);
                    }
                }
                //this.queryConnectedPeers();
                this.sessionState = STATE_ACTIVE;
            }
        }else if(eventType == PROTO_EVENT_TYPE_DISCOVERY){
            if(obj.hasOwnProperty(PROTO_HDR_MSG)){
                let payload: GroupDescription = JSON.parse(JSON.stringify(obj[PROTO_HDR_MSG]));
                if(payload != null && payload.hasOwnProperty(PROTO_HDR_PEER_INFO) && payload.hasOwnProperty(PROTO_MSG_HDR_SELF_ADDR)){
                    this.localAddress = payload.self;
                    this.savePeers(payload);
                }
            }
        }else if(eventType == PROTO_EVENT_TYPE_ERROR){
            let payload: ErrorEventMessage = JSON.parse(JSON.stringify(obj[PROTO_HDR_MSG]));
            if(payload != null && payload.hasOwnProperty(PROTO_HDR_ERROR_REASON)){
                this.sessionState = STATE_ERROR;
                console.log({'Connection state=>ERROR; reason=': payload[PROTO_HDR_ERROR_REASON]});
                this.onError('Connection error: ' + payload[PROTO_HDR_ERROR_REASON]);
            }
        }else if(eventType == PROTO_EVENT_TYPE_MSG){
            if(this.isValidSessionMessage(obj)){
                super.broadcastEvent(JSON.stringify(obj[PROTO_HDR_MSG]), obj[PROTO_HDR_SRC]);
            }
        }
    }

    broadcastEvent(evtData: string): void {
        let obj: EventMessage = JSON.parse(evtData);
        if(obj.hasOwnProperty(PROTO_HDR) && obj.hasOwnProperty(PROTO_HDR_MSG)){
            this.handleEventMessage(obj, obj.event);
        }else{
            console.log('Unknown msg format: ' + evtData);
        }
    }

    getEventHandler(eventGroup: string): EventHandler {
        if(eventGroup == null){
            return null;
        }
        if(RelayedWSEventStream.HANDLERS.has(eventGroup)){
            return RelayedWSEventStream.HANDLERS.get(eventGroup);
        }
    }
}
