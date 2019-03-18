export interface StatusMonitor {
    setErrorMessage(msg: string) : void;
    setStatusMessage(msg: string): void;
    clearErrorState(): void;
}