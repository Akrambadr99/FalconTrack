export type Result<T, E = string> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: E;
};
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
export function mapResult<T, U, E>(result: Result<T, E>, map: (value: T) => U): Result<U, E> { return result.ok ? { ok: true, value: map(result.value) } : result; }
export function unwrap<T, E>(result: Result<T, E>): T {
    if (!result.ok)
        throw new Error(String(result.error));
    return result.value;
}
