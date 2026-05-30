declare global {
    interface Window {
        __warpRenderBatchQuote?: (data: unknown) => void;
    }
}
export {};
