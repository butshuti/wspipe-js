declare module "module/EventHandler" {
    export interface EventHandler {
        handleEvent(evtIndex: number, obj: JSON): void;
        clearEvents(): void;
    }
}
declare module "module/StatusMonitor" {
    export interface StatusMonitor {
        setErrorMessage(msg: string): void;
        setStatusMessage(msg: string): void;
        clearErrorState(): void;
    }
}
declare module "module/WSEventStreamConfig" {
    export class WSEventStreamConfig {
        dstLocation: URL;
        keepAlive: boolean;
        path: string;
        constructor(dstLocation: URL, keepAlive: boolean);
        withPort(port: number): WSEventStreamConfig;
        withPath(path: string): WSEventStreamConfig;
        setKeepAlive(keepAlive: boolean): void;
        getURI(): string;
        getAddress(): string;
    }
}
declare module "module/Peer" {
    import { WSEventStreamConfig } from "module/WSEventStreamConfig";
    export class Peer {
        peerName: string;
        eventStreamURI: string;
        url: URL;
        peerAddress: string;
        inError: boolean;
        streamConfig: WSEventStreamConfig;
        reachable: boolean;
        constructor(name: string, peerLocation: URL, peerAddress: string);
        withConfig(config: WSEventStreamConfig): Peer;
        getStreamConfig(): WSEventStreamConfig;
        getPeerName(): string;
        getURI(): string;
        getURL(): URL;
        getPeerAddress(): string;
        getPeerLocation(): string;
        markAsReachable(): void;
        isMarkedAsReachable(): boolean;
        isReachable(): boolean;
        isDirect(): boolean;
    }
}
declare module "module/EventStream" {
    import { EventHandler } from "module/EventHandler";
    import { StatusMonitor } from "module/StatusMonitor";
    import { Peer } from "module/Peer";
    export class EventStream {
        handler: EventHandler;
        statusMonitor: StatusMonitor;
        counter: number;
        constructor(handler: EventHandler, statusMonitor: StatusMonitor);
        getCounter(): number;
        getEventHandler(eventGroup: string): EventHandler;
        getStatusMonitor(): StatusMonitor;
        routeEvent(obj: JSON, eventGroup: string): void;
        broadcast(evtIndex: number, obj: JSON): void;
        start(dstPeer: Peer): void;
        stop(dstPeer: Peer): void;
    }
}
declare module "module/fetch" {
    export const timedFetch: (url: string, options: Object, timeout?: number) => Promise<Response>;
}
declare module "module/WSEventStream" {
    import { EventStream } from "module/EventStream";
    import { EventHandler } from "module/EventHandler";
    import { WSEventStreamConfig } from "module/WSEventStreamConfig";
    import { Peer } from "module/Peer";
    import { StatusMonitor } from "module/StatusMonitor";
    interface CtrlMessage {
        ctrl: string;
        sync: string;
    }
    export class WSEventStream extends EventStream {
        ws: WebSocket;
        counter: number;
        retryCounter: number;
        wsStreamConfig: WSEventStreamConfig;
        pendingStart: boolean;
        wsTimeout: number;
        constructor(config: WSEventStreamConfig, handler: EventHandler, statusMonitor: StatusMonitor);
        withConfig(config: WSEventStreamConfig): WSEventStream;
        getEventStreamConfig(): WSEventStreamConfig;
        initiateWSSession(selectedPeer: Peer): void;
        buildWSURL(scheme: string, hostname: string, port: number, path: string): string;
        onConnected(selectedPeer: Peer): void;
        onDisconnected(selectedPeer: Peer): void;
        onError(msg: string): void;
        onStatus(msg: string): void;
        isPendingStart(): boolean;
        registerConnection(url: string, socket: WebSocket): void;
        getConnectionSocket(url: string): WebSocket;
        isConnected(url: string): boolean;
        clearConnection(url: string): void;
        setWSConnectTimeout(timeout: number): void;
        clearWSConnectionTimeout(): void;
        startWS(selectedPeer: Peer): void;
        startSession(selectedPeer: Peer, reset: boolean): void;
        start(selectedPeer: Peer): void;
        stop(selectedPeer: Peer): void;
        sendMsg(msg: string): void;
        packMsg(msg: string, selectedPeer: Peer): string;
        handleCtrlEvent(evt: CtrlMessage): void;
        broadcastEvent(evtData: string, eventGroup: string): void;
    }
}
declare module "module/RelayedWSEventStream" {
    import { WSEventStream } from "module/WSEventStream";
    import { EventHandler } from "module/EventHandler";
    import { WSEventStreamConfig } from "module/WSEventStreamConfig";
    import { Peer } from "module/Peer";
    import { StatusMonitor } from "module/StatusMonitor";
    interface EventMessage {
        src: string;
        dst: string;
        event: string;
        msg: JSON;
        group: string;
        channel: string;
    }
    interface GroupDescription {
        self: string;
        peers: string[];
    }
    export class RelayedWSEventStream extends WSEventStream {
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
        constructor(config: WSEventStreamConfig);
        static initialize(config: WSEventStreamConfig): void;
        static getInstance(): RelayedWSEventStream;
        registerHandler(peerName: string, handler: EventHandler): RelayedWSEventStream;
        registerPeersChangeCallback(cbk: Function): void;
        withStatusMonitor(statusMonitor: StatusMonitor): RelayedWSEventStream;
        withConfig(config: WSEventStreamConfig): RelayedWSEventStream;
        withDstLabel(remoteAddress: string): RelayedWSEventStream;
        open(): void;
        close(): void;
        onConnected(selectedPeer: Peer): void;
        onDisconnected(selectedPeer: Peer): void;
        packMsg(msg: string, selectedPeer: Peer): string;
        wrapMsg(msg: string, dst: string): string;
        subscribeToSessionEvents(): void;
        unsubscribeFromSessionEvents(): void;
        startSession(selectedPeer: Peer, reset: boolean): void;
        stop(selectedPeer: Peer): void;
        queryConnectedPeers(): void;
        invitePeer(peer: string): void;
        joinPeerSession(peer: string): void;
        onPeersChanged(): void;
        registerPeer(peer: string): void;
        initiateWSSession(selectedPeer: Peer): void;
        isValidSessionMessage(obj: EventMessage): boolean;
        isSensorLabel(label: string): boolean;
        parsePeerAddress(label: string): string;
        savePeers(groupDescr: GroupDescription): void;
        handleEventMessage(obj: EventMessage, eventType: string): void;
        broadcastEvent(evtData: string): void;
        getEventHandler(eventGroup: string): EventHandler;
    }
}
declare module "module/DiscoveryClient" {
    import { RelayedWSEventStream } from "module/RelayedWSEventStream";
    import { WSEventStreamConfig } from "module/WSEventStreamConfig";
    import { Peer } from "module/Peer";
    export class PeersChangeListener {
        onNewPeers(peers: Peer[]): void;
    }
    export class DiscoveryClient {
        eventStream: RelayedWSEventStream;
        peersChangeListener: PeersChangeListener;
        active: boolean;
        uri: string;
        streamConfig: WSEventStreamConfig;
        constructor(url: URL, peersListener: PeersChangeListener);
        startAsync(): Promise<URL>;
        start(statusCallback: Function): void;
        extractPeerName(label: string): string;
        onPeersChange(peers: string[]): void;
        isActive(): boolean;
    }
}
declare module "index" {
    export * from "module/DiscoveryClient";
    export * from "module/EventHandler";
    export * from "module/StatusMonitor";
    export * from "module/EventStream";
    export * from "module/Peer";
    export * from "module/RelayedWSEventStream";
    export * from "module/WSEventStream";
    export * from "module/WSEventStreamConfig";
}
