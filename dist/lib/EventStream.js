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
            handler.handleEvent(this.counter++, obj);
        }
    }
    broadcast(evtIndex, obj) {
        if (this.handler != null) {
            this.handler.handleEvent(evtIndex, obj);
        }
    }
}
exports.EventStream = EventStream;
