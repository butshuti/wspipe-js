export interface EventHandler {
    handleEvent(evtIndex: number, value: number, ts: number, recoil: boolean): void;
    clearEvents(): void;
}