import { EventHandler } from './EventHandler';
import { StatusMonitor } from './StatusMonitor';
import { Peer } from './Peer';
export declare abstract class EventStream {
    handler: EventHandler | null;
    statusMonitor: StatusMonitor | null;
    counter: number;
    constructor(handler: EventHandler | null, statusMonitor: StatusMonitor | null);
    getEventHandler(eventGroup: string): EventHandler | null;
    getStatusMonitor(): StatusMonitor;
    routeEvent(eventData: string, eventGroup: string): void;
    broadcast(evtIndex: number, eventData: string): void;
    abstract sendTo(payload: string, dstPeer: Peer): void;
    abstract start(dstPeer: Peer, eventCode: string): void;
    abstract stop(dstPeer: Peer, eventCode: string): void;
    abstract ping(timeout: number): Promise<boolean>;
}
