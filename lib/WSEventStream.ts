import {EventStream} from './EventStream';
import {EventHandler} from './EventHandler';
import {WSEventStreamConfig} from './WSEventStreamConfig';
import {Peer} from './Peer';
import {timedFetch} from './fetch';
import { StatusMonitor } from './StatusMonitor';

//const MSG_SYNC_KEY = 'sync';
const MSG_TYPE_CTRL_KEY = 'ctrl';
const MSG_TYPE_DATA_KEY = 'data';
const API_WS_REQUEST_PATH = '/api/ws';
const SERVICE_CONFIG_PORT_KEY = 'port';
const SERVICE_CONFIG_SCHEME_KEY = 'scheme';
const SERVICE_CONFIG_PATH_KEY = 'path';
const SERVICE_CONFIG_PROTOCOL_KEY = 'protocol';
const SERVICE_CONFIG_NODE_NAME_KEY = 'nodeName';

const DEFAULT_STREAM_PROTOCOL = 'p2p';

const MAX_RETRIES = 3;

const CONN_TIMEOUT = 5000;
const WS_RECONNECT_INTERVAL = 3000;

const OPEN_SOCKETS: Map<string, WebSocket> = new Map();

interface CtrlMessage {
    ctrl: string;
    sync: string;
    attachment: string;
};

export interface StreamDescriptor {
    port: number;
    scheme: string;
    path: string;
    protocol: string;
    nodeName: string;
    isDirect: Function;
};

export class WSEventStream extends EventStream {
    ws: WebSocket|null;
    counter:number;
    retryCounter: number;
    wsStreamConfig: WSEventStreamConfig;
    pendingCommandACKs: Map<string, number>;
    activeSessions: Map<string, string>;
    wsTimeout: number;
    constructor(config: WSEventStreamConfig,  handler: EventHandler|null, statusMonitor: StatusMonitor|null){
        super(handler, statusMonitor);
        this.ws = null;
        this.wsStreamConfig = config;
        if(this.wsStreamConfig.path == null){
            this.wsStreamConfig.withPath(API_WS_REQUEST_PATH);
        }
        this.counter = 0;
        this.retryCounter = 0;
        this.wsTimeout= 0;
        this.pendingCommandACKs = new Map();
        this.activeSessions = new Map();
    }

    withConfig(config: WSEventStreamConfig): WSEventStream {
        this.wsStreamConfig = config;
        return this;
    }

    getEventStreamConfig(): WSEventStreamConfig {
        return this.wsStreamConfig;
    }

    static async getStreamDescriptor(url: string): Promise<StreamDescriptor> {
        url = url.replace(/\/$/g, '') + API_WS_REQUEST_PATH;
        return new Promise<StreamDescriptor>((resolve, reject) => {
            timedFetch(url, {}, CONN_TIMEOUT).then((response) => {
                if(response.ok){
                    return response.json();
                }else{
                    throw new Error(response.statusText);
                }
            }).then((json) =>{
                if(json.hasOwnProperty(SERVICE_CONFIG_PORT_KEY) && json.hasOwnProperty(SERVICE_CONFIG_SCHEME_KEY)
                && json.hasOwnProperty(SERVICE_CONFIG_PATH_KEY)){
                    resolve({
                        port: Number.parseInt(json[SERVICE_CONFIG_PORT_KEY]), 
                        scheme: json[SERVICE_CONFIG_SCHEME_KEY], 
                        path: json[SERVICE_CONFIG_PATH_KEY], 
                        protocol: json[SERVICE_CONFIG_PROTOCOL_KEY] || DEFAULT_STREAM_PROTOCOL,
                        nodeName: json[SERVICE_CONFIG_NODE_NAME_KEY] || new URL(url).hostname,
                        isDirect: ()=> (json[SERVICE_CONFIG_PROTOCOL_KEY] || DEFAULT_STREAM_PROTOCOL) === DEFAULT_STREAM_PROTOCOL
                    });
                }else{
                    reject(new Error('Received incomplete configuration response.'));
                }
            }).catch(err => {
                reject(err);
            });
        });
    }

    initiateWSSession(selectedPeer: Peer, eventCode: string): void{
        let dstLocation: URL = selectedPeer.getURL();
        if(dstLocation == null){
            dstLocation = this.wsStreamConfig.dstLocation;
        }
        WSEventStream.getStreamDescriptor(dstLocation.href).then((streamDescr) =>{
            let url: string = this.buildWSURL(streamDescr.scheme, dstLocation, streamDescr.port, streamDescr.path);
            let peer: Peer = new Peer(selectedPeer.getPeerName(), new URL('', url), null);
            peer.markPending(eventCode);
            this.startWS(peer);
        }).catch((err) => {
            console.error(err);
            this.onError('Error connecting to ' + selectedPeer.getURI());
        });
    }

    buildWSURL(scheme: string, baseURL: URL, port: number, path: string): string {
        let ret: URL = new URL(path.replace(/^\/+/g, '/'), baseURL);
        ret.port = ''+port;
        ret.protocol = scheme.replace(/:$/g, ''); + ':';
        return ret.href;
    }

    onConnected(selectedPeer: Peer): void {
        this.onStatus('Connected to ' + selectedPeer.getPeerName());
        this.getStatusMonitor().clearErrorState();
        let eventCode: string | null = selectedPeer.getPendingEventCode();
        if(eventCode != null && this.pendingCommandACKs.get(eventCode) !== undefined){
            this.startSession(selectedPeer, eventCode, true);
        }
    }

    onDisconnected(selectedPeer: Peer): void {
        this.onError('Disconnected from ' + selectedPeer.getPeerName());
        this.ws = null;
        if(this.activeSessions.has(selectedPeer.getPeerName())){
            let eventCode: string | undefined = this.activeSessions.get(selectedPeer.getPeerName());
            if(eventCode){
                this.onError('Attempting to reconnect to ' + selectedPeer.getPeerName() + ' in ' + (WS_RECONNECT_INTERVAL/1000) + ' seconds');
                setTimeout(()=> {
                    this.startWS(selectedPeer);
                }, WS_RECONNECT_INTERVAL);
                return;
            }
        }
        console.log('No active session: reconnection will not be attempted.');
    }

    onError(msg: string): void {
        console.error(msg);
        this.getStatusMonitor().setErrorMessage(msg);
    }

    onStatus(msg: string): void {
        console.log(msg);
        this.getStatusMonitor().setStatusMessage(msg);
    }

    registerConnection(url: string, socket: WebSocket): void {
        if(url != null && socket != null){
            OPEN_SOCKETS.set(url, socket);
        }
    }

    getConnectionSocket(url: string): WebSocket|null {
        if(OPEN_SOCKETS.has(url)){
            let ret: WebSocket|undefined = OPEN_SOCKETS.get(url);
            if(ret !== undefined){
                return ret;
            }
        }
        return null;
    }

    isConnected(url: string): boolean {
        if(OPEN_SOCKETS.has(url)){
            let socket: WebSocket|undefined = OPEN_SOCKETS.get(url);
            if(socket !== undefined){
                return (socket.OPEN == 1 || socket.CONNECTING == 1) && socket.url == url ;
            }
        }
        return false;
    }

    clearConnection(url: string): void {
        if(OPEN_SOCKETS.has(url)){
            try{
                let socket: WebSocket|undefined = OPEN_SOCKETS.get(url);
                if(socket !== undefined){
                    socket.close();
                }
            }catch (e){
                console.error(e);
            }
            OPEN_SOCKETS.delete(url);
        }
    }

    setWSConnectTimeout(timeout: number): void {
        this.wsTimeout = setTimeout(() => {
            if(this.ws != null && this.ws.readyState == WebSocket.CONNECTING){
                this.ws.close();
                this.onError('Connection to ' + this.ws.url.replace(/.+:\/\//, '').replace(/\/.+/, '') + ' timed out');
            }
        }, timeout);
    }

    clearWSConnectionTimeout(): void {
        clearTimeout(this.wsTimeout);
    }

    startWS(selectedPeer: Peer): void {
        this.getStatusMonitor().clearErrorState();
        let url: string = selectedPeer.getURL().href;
        console.log('WSEventStream::: Connecting to ' + url + (this.isConnected(url) ? ' -- CONNECTION EXISTS.(' + this.ws + ')' : '...'));
        this.clearWSConnectionTimeout();
        this.onStatus('Connecting to ' + selectedPeer.getPeerName());
        if(this.isConnected(url)){
            this.ws = this.getConnectionSocket(url);
        }else if(this.ws != null && this.ws.url != url){
            this.ws.close();
            this.ws = null;
        }
        if(this.ws == null || this.ws.readyState == WebSocket.CLOSED || this.ws.readyState == WebSocket.CLOSING){
            this.ws = new WebSocket(url);
        }else if(this.ws.readyState == WebSocket.OPEN){
            this.onConnected(selectedPeer);
            return;
        }
        this.setWSConnectTimeout(CONN_TIMEOUT);
        let thiz = this;
        let ws = this.ws;
        this.ws.onopen = function(){
            thiz.onConnected(selectedPeer);
        };
        this.ws.onclose = function(){
            console.log('Closed!');
            thiz.clearConnection(ws.url);
            thiz.onDisconnected(selectedPeer);
        };
        this.ws.onmessage = function(evt){
            thiz.broadcastEvent(evt.data, ws.url);
        };
        this.ws.onerror = function(evt){
            console.log(evt);
            thiz.onError('Error connecting to ' + ws.url);
            thiz.clearConnection(this.url);
        };
        this.registerConnection(url, ws);
    }

    startSession(selectedPeer: Peer, eventCode: string, reset: boolean): void{
        this.getStatusMonitor().clearErrorState();
        if(this.ws != null && this.ws.OPEN){
            if(reset){
                this.pendingCommandACKs.set(eventCode, 0);
            }
            this.ws.send(this.packMsg(eventCode, selectedPeer));
            this.onStatus('Starting a new session....');
            let thiz = this;
            setInterval(function(){
                let retryCounter: number | undefined = thiz.pendingCommandACKs.get(eventCode);
                if(retryCounter !== undefined && retryCounter < MAX_RETRIES){
                    thiz.onStatus('startSession(): retry #' + thiz.retryCounter);
                    thiz.startSession(selectedPeer, eventCode, false);
                    thiz.pendingCommandACKs.set(eventCode, retryCounter + 1);
                }
            }, 3000);
        }else{
            console.log('Socket not open---CANNOT SEND MSG.');
        }
    }

    start(selectedPeer: Peer, eventCode: string): void {
        this.activeSessions.set(selectedPeer.getPeerName(), eventCode);
        if(this.ws != null && this.ws.readyState == WebSocket.OPEN){
            this.startSession(selectedPeer, eventCode, true);
        }else{
            this.pendingCommandACKs.set(eventCode, 0);
            this.initiateWSSession(selectedPeer, eventCode);
            console.log('---pending start...');
        }
    }

    stop(selectedPeer: Peer, eventCode: string): void {
        this.activeSessions.delete(selectedPeer.getPeerName());
        if(this.ws != null){
            this.ws.send(this.packMsg(eventCode, selectedPeer));
            if(!this.wsStreamConfig.keepAlive){
                let _ws = this.ws;
                setTimeout(()=>{
                    _ws.close();
                }, 1000);
                this.ws = null;
            }
            this.onStatus('Requested SESSION STOP');
        }
        this.counter = 0;
    }

    sendTo(msg: string, selectedPeer: Peer): void {
        this.sendMsg(this.packMsg(msg, selectedPeer));
    }

    sendMsg(msg: string): void {
        if(this.ws != null && this.ws.OPEN){
            this.ws.send(msg);
        }
    }

    packMsg(msg: string, selectedPeer: Peer): string {
        console.log('Msg: ' + msg + '=>' + selectedPeer);
        return msg;
    }

    private handleCtrlEvent(evt: CtrlMessage): void{
        if(evt.ctrl !== undefined){
            if(this.pendingCommandACKs.has(evt.ctrl) && this.pendingCommandACKs.get(evt.ctrl) !== undefined){
                this.onStatus('Session in progress...');
                this.pendingCommandACKs.delete(evt.ctrl);
            }
        }
    }

    broadcastEvent(evtData: string, eventGroup: string): void {
        let obj: CtrlMessage;
        try{
            obj = JSON.parse(evtData);
        }catch (e){
            console.debug(e);
            return;
        }
        if(obj.sync == MSG_TYPE_CTRL_KEY){
            this.handleCtrlEvent(obj);
        }else if(obj.sync === MSG_TYPE_DATA_KEY){
            this.routeEvent(JSON.parse(obj.attachment), eventGroup);
        }else{
            this.routeEvent(JSON.parse(JSON.stringify(obj)), eventGroup);
        }
    }
}
