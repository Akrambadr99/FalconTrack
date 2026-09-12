import { defaultPreferences, type Preferences } from './types';
export interface PreferenceStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
export class PreferenceRepository {
    private readonly storage: PreferenceStorage;
    private readonly key: string;
    constructor(storage: PreferenceStorage, key: string) { this.storage = storage; this.key = key; }
    read(): Preferences {
        const raw = this.storage.getItem(this.key);
        if (!raw)
            return structuredClone(defaultPreferences);
        try {
            return { ...defaultPreferences, ...JSON.parse(raw) as Partial<Preferences> };
        }
        catch {
            return structuredClone(defaultPreferences);
        }
    }
    save(preferences: Preferences) { this.storage.setItem(this.key, JSON.stringify(preferences)); }
}
