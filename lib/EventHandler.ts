export interface EventHandler {
    handleEvent(evtIndex: number, obj: string): void;
    clearEvents(): void;
}