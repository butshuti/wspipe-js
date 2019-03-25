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
export class EventStream {
    handler: EventHandler|null;
    statusMonitor: StatusMonitor|null;
    counter: number;
    constructor(handler: EventHandler|null, statusMonitor: StatusMonitor|null){
        this.handler = handler;
        this.statusMonitor = statusMonitor;
        this.counter = 0;
    }

    getCounter(): number{
        return this.counter++;
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

    routeEvent(obj: JSON, eventGroup: string): void {
        let handler: EventHandler |null = this.getEventHandler(eventGroup);
        if(handler != null){
            handler.handleEvent(this.counter++, obj);
        }
    }

    sendTo(payload: string, dstPeer: Peer): void {
        console.log(payload + ': dstPeer => ' + dstPeer);
    }

    broadcast(evtIndex:number, obj: JSON): void{
        if(this.handler != null){
            this.handler.handleEvent(evtIndex, obj);
        }
    }

    start(dstPeer: Peer, eventCode: string): void {
        console.log(eventCode + ': dstPeer => ' + dstPeer);
    }

    stop(dstPeer: Peer, eventCode: string): void {
        console.log(eventCode + ': dstPeer => ' + dstPeer);
    }

    testConnectivity(url: string): Promise<Response> {
        throw new Error('Cannot check connectivity to ' + url + ': Not implemented.');
    }
}
