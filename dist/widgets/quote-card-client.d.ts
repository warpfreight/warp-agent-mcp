declare global {
    interface Window {
        __warpRenderCard?: (data: unknown) => void;
    }
}
export {};
