declare global {
    interface Window {
        __warpRenderBookings?: (data: unknown) => void;
        __warpOpenLink?: (url: string) => void;
    }
}
export {};
