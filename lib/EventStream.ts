import {EventHandler} from './EventHandler';
import {StatusMonitor} from './StatusMonitor';
import {Peer} from './Peer';
class NoOpStatusMonitor implements StatusMonitor {
    setErrorMessage(msg: string) : void{
        console.error(msg);
    }
    setStatusMessage(msg: string): void {
        console.log(msg);
    }
    clearErrorState(): void {

    }
}
export abstract class EventStream {
    handler: EventHandler|null;
    statusMonitor: StatusMonitor|null;
    counter: number;
    constructor(handler: EventHandler|null, statusMonitor: StatusMonitor|null){
        this.handler = handler;
        this.statusMonitor = statusMonitor;
        this.counter = 0;
    }

    getEventHandler(eventGroup: string): EventHandler | null {
        if(eventGroup != null){
            return this.handler != null ? this.handler : null;
        }
        return this.handler;
    }

    getStatusMonitor(): StatusMonitor {
        return this.statusMonitor || new NoOpStatusMonitor();
    }

    routeEvent(eventData: string, eventGroup: string): void {
        let handler: EventHandler |null = this.getEventHandler(eventGroup);
        if(handler != null){
            handler.handleEvent(this.counter++, eventData);
        }
    }

    broadcast(evtIndex:number, eventData: string): void{
        if(this.handler != null){
            this.handler.handleEvent(evtIndex, eventData);
        }
    }

    abstract sendTo(payload: string, dstPeer: Peer): void;

    abstract start(dstPeer: Peer, eventCode: string): void;

    abstract stop(dstPeer: Peer, eventCode: string): void;

    abstract ping(timeout: number): Promise<boolean>;
}
