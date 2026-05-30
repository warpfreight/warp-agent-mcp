declare global {
    interface Window {
        __warpRenderBatchBook?: (data: unknown) => void;
    }
}
export {};
