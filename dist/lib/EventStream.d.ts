import { EventHandler } from './EventHandler';
import { StatusMonitor } from './StatusMonitor';
import { Peer } from './Peer';
export declare class EventStream {
    handler: EventHandler | null;
    statusMonitor: StatusMonitor | null;
    counter: number;
    constructor(handler: EventHandler | null, statusMonitor: StatusMonitor | null);
    getCounter(): number;
    getEventHandler(eventGroup: string): EventHandler | null;
    getStatusMonitor(): StatusMonitor;
    routeEvent(obj: JSON, eventGroup: string): void;
    broadcast(evtIndex: number, obj: JSON): void;
    start(dstPeer: Peer): void;
    stop(dstPeer: Peer): void;
}
