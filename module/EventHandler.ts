export interface EventHandler {
    handleEvent(evtIndex: number, obj: JSON): void;
    clearEvents(): void;
}