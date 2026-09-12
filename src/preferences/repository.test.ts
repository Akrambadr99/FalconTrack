import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../data/memory-storage';
import { PreferenceRepository } from './repository';
describe('preference repository', () => { it('returns defaults for malformed input', () => { const storage = new MemoryStorage(); storage.setItem('prefs', 'bad'); expect(new PreferenceRepository(storage, 'prefs').read().pageSize).toBe(25); }); it('persists preferences', () => { const storage = new MemoryStorage(), repository = new PreferenceRepository(storage, 'prefs'), value = repository.read(); repository.save({ ...value, compact: true }); expect(repository.read().compact).toBe(true); }); });
