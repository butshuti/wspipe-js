import {EventStream} from './EventStream';
import {EventHandler} from './EventHandler';
import {WSEventStreamConfig} from './WSEventStreamConfig';
import {Peer} from './Peer';
import {timedFetch} from '../../shims';
import { StatusMonitor } from './StatusMonitor';

const MSG_START_SESSION = '_start_';
//const MSG_START_SESSION = '_start_network_delay_test_;200_hkghjgkdfhgjdfhkgjd';
const MSG_END_SESSION = '_end_';
//const MSG_END_SESSION = '_end_test_';
const MSG_SYNC_KEY = 'sync';
const MSG_TYPE_CTRL_KEY = 'ctrl';
const API_WS_REQUEST_PATH = '/api/ws';
const SERVICE_CONFIG_PORT_KEY = 'port';
const SERVICE_CONFIG_SCHEME_KEY = 'scheme';
const SERVICE_CONFIG_PATH_KEY = 'path';
const MAX_RETRIES = 3;

const CONN_TIMEOUT = 5000;

const OPEN_SOCKETS: Map<string, WebSocket> = new Map();

export class WSEventStream extends EventStream {
    ws: WebSocket;
    counter:number;
    retryCounter: number;
    wsStreamConfig: WSEventStreamConfig;
    pendingStart: boolean;
    wsTimeout: number;
    constructor(config: WSEventStreamConfig,  handler: EventHandler, statusMonitor: StatusMonitor){
        super(handler, statusMonitor);
        this.ws = null;
        this.wsStreamConfig = config;
        if(this.wsStreamConfig.path == null){
            this.wsStreamConfig.withPath(API_WS_REQUEST_PATH);
        }
        this.counter = 0;
        this.retryCounter = 0;
        this.pendingStart = false;
    }

    withConfig(config: WSEventStreamConfig): WSEventStream {
        this.wsStreamConfig = config;
        return this;
    }

    getEventStreamConfig(): WSEventStreamConfig {
        return this.wsStreamConfig;
    }

    initiateWSSession(selectedPeer: Peer): void{
        let dstLocation: URL = selectedPeer.getURL();
        if(dstLocation == null){
            dstLocation = this.wsStreamConfig.dstLocation;
        }
        let thiz = this;
        timedFetch(dstLocation.origin + this.wsStreamConfig.path, {}, CONN_TIMEOUT).then((response) => {
            console.log(response);
            if(response.ok){
                return response.json();
            }else{
                throw new Error('Received ' + response.status + ' from server: ' + response.statusText);
            }
        }).then((json) =>{
            if(json.hasOwnProperty(SERVICE_CONFIG_PORT_KEY) && json.hasOwnProperty(SERVICE_CONFIG_SCHEME_KEY)
            && json.hasOwnProperty(SERVICE_CONFIG_PATH_KEY)){
                let url: string = thiz.buildWSURL(json[SERVICE_CONFIG_SCHEME_KEY], dstLocation.hostname, json[SERVICE_CONFIG_PORT_KEY], json[SERVICE_CONFIG_PATH_KEY]);
                let peer: Peer = new Peer('', new URL('', url), null);
                thiz.startWS(peer);
            }else{
                console.error('Received incomplete configuration response.');
            }
        }).catch((err) => {
            console.error(err);
            thiz.onError('Error connecting to ' + dstLocation);
        });
    }

    buildWSURL(scheme: string, hostname: string, port: number, path: string): string {
        if(path[0] == '/'){
            path = path.substring(1);
        }
        return scheme + '://' + (hostname + ':' + port + '/' + path).replace(/\/+/g, '/');
    }

    onConnected(selectedPeer: Peer): void {
        this.getStatusMonitor().clearErrorState();
        if(this.pendingStart){
            this.startSession(selectedPeer, true);
        }
        console.log('Connected to ' + selectedPeer.getPeerName());
    }

    onDisconnected(selectedPeer: Peer): void {
        this.ws = null;
        console.log('Disconnected from ' + selectedPeer.getPeerName() + '@' + selectedPeer.getURI());
    }

    onError(msg: string): void {
        console.error(msg);
        this.getStatusMonitor().setErrorMessage(msg);
    }

    onStatus(msg: string): void {
        console.log(msg);
        this.getStatusMonitor().setStatusMessage(msg);
    }

    isPendingStart(): boolean {
        return this.pendingStart;
    }

    registerConnection(url: string, socket: WebSocket): void {
        if(url != null && socket != null){
            OPEN_SOCKETS.set(url, socket);
        }
    }

    getConnectionSocket(url: string): WebSocket {
        if(OPEN_SOCKETS.has(url)){
            return OPEN_SOCKETS.get(url);
        }
        return null;
    }

    isConnected(url: string): boolean {
        if(OPEN_SOCKETS.has(url)){
            let socket: WebSocket = OPEN_SOCKETS.get(url);
            return (socket.OPEN == 1 || socket.CONNECTING == 1) && socket.url == url ;
        }
        return false;
    }

    clearConnection(url: string): void {
        if(OPEN_SOCKETS.has(url)){
            try{
                OPEN_SOCKETS.get(url).close();
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

    startSession(selectedPeer: Peer, reset: boolean): void{
        this.getStatusMonitor().clearErrorState();
        if(this.ws != null && this.ws.OPEN){
            if(reset){
                this.retryCounter = 0;
                this.pendingStart = true;
            }
            this.ws.send(this.packMsg(MSG_START_SESSION, selectedPeer));
            this.onStatus('Starting a new session....');
            let thiz = this;
            setInterval(function(){
                if(thiz.pendingStart && thiz.retryCounter < MAX_RETRIES){
                    thiz.onStatus('startSession(): retry #' + thiz.retryCounter);
                    thiz.startSession(selectedPeer, false);
                    thiz.retryCounter++;
                }
            }, 3000);
        }else{
            console.log('Socket not open---CANNOT SEND MSG.');
        }
    }

    start(selectedPeer: Peer): void {
        console.log('WS? ' + this.ws);
        if(this.ws != null && this.ws.readyState == WebSocket.OPEN){
            this.startSession(selectedPeer, true);
        }else{
            this.pendingStart = true;
            this.initiateWSSession(selectedPeer);
            console.log('---pending start...');
        }
        console.log('Start????');
    }

    stop(selectedPeer: Peer): void {
        if(this.ws != null){
            this.ws.send(this.packMsg(MSG_END_SESSION, selectedPeer));
            if(!this.wsStreamConfig.keepAlive){
                this.ws.close();
                this.ws = null;
            }
            this.onStatus('Requested SESSION STOP');
        }
        this.counter = 0;
        this.pendingStart = false;
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

    handleCtrlEvent(evt: JSON): void{
        if(evt.hasOwnProperty(MSG_TYPE_CTRL_KEY)){
            if(evt[MSG_TYPE_CTRL_KEY] == MSG_START_SESSION.split(';')[0]){
                if(this.pendingStart){
                    this.onStatus('Session in progress...');
                }
                this.pendingStart = false;
            }else if(evt[MSG_TYPE_CTRL_KEY] == MSG_END_SESSION){
                this.pendingStart = false;
                this.onStatus('Session ended.');
            }
        }
    }

    broadcastEvent(evtData: string, eventGroup: string): void {
        let obj: JSON;
        try{
            obj = JSON.parse(evtData);
        }catch (e){
            console.debug(e);
            return;
        }
        if(obj.hasOwnProperty(MSG_SYNC_KEY) && obj[MSG_SYNC_KEY] == MSG_TYPE_CTRL_KEY){
            this.handleCtrlEvent(obj);
        }else{
            this.routeEvent(obj, eventGroup);
        }
        console.log(obj);
    }
}
