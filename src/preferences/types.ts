export type Theme = 'light' | 'dark' | 'system';
export interface Preferences {
    theme: Theme;
    compact: boolean;
    pageSize: number;
    defaultKind: string;
    notifications: {
        email: boolean;
        inApp: boolean;
    };
}
export const defaultPreferences: Preferences = { theme: 'system', compact: false, pageSize: 25, defaultKind: 'all', notifications: { email: false, inApp: true } };
