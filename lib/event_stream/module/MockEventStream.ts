import {Peer} from './Peer';
import {EventStream} from './EventStream';
import {EventHandler} from './EventHandler';
import { StatusMonitor } from './StatusMonitor';

export class MockEventStream extends EventStream{
    timer: any;
    constructor(handler: EventHandler, statusMonitor: StatusMonitor){
        super(handler, statusMonitor);
    }

    getRandomValue(): number{
        return (Math.random() * 2.5);
    }

    getRandomDepthValue(): number{
        return Math.random() > 0.5 ? 1.8 : 2.6;
    }

    start(dstPeer: Peer): void {
        console.log('Starting mock sessiong with ' + dstPeer);
        this.timer = setInterval(()=>this.broadcast(this.getCounter(), this.getRandomDepthValue(), new Date().getTimezoneOffset(), Math.random()>0.4), 400);
    }

    stop(dstPeer: Peer): void {
        console.log('Ending mock session with ' + dstPeer);
        if(this.timer != null){
            clearInterval(this.timer);
        }
    }
}
