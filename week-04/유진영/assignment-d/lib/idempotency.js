'use strict';

/**
 * 멱등 키(Idempotency-Key) 저장소
 * ------------------------------------------------------------------
 * 같은 키로 요청이 다시 오면 처음 응답을 그대로 돌려주기 위해 키별 상태를 기억한다.
 *
 *   begin(key, fingerprint)
 *     new        처음 보는 키. 호출한 쪽이 실제로 처리한 뒤 complete 또는 abort를 불러야 한다
 *     replay     이미 끝난 키. response를 그대로 돌려주면 된다
 *     in_flight  같은 키의 첫 요청이 아직 처리 중 (409로 "잠시 뒤 다시" 알린다)
 *     mismatch   같은 키인데 본문이 다르다 (키를 잘못 재사용한 클라이언트 버그, 422)
 *
 * fingerprint는 요청 본문의 해시. 같은 키에 다른 주문을 실어 보내는 실수를 잡는다.
 * 메모리에만 두므로 서버를 재시작하면 잊는다. 실서비스라면 Redis나 DB에 둔다.
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 하루. Stripe도 키를 24시간 기억한다

/** 응답을 깊게 얼려서, 꺼내 간 쪽이 바꿔도 저장된 원본이 바뀌지 않게 한다 */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/**
 * @param {{ ttlMs?: number, clock?: () => number }} [options]
 */
function createIdempotencyStore({ ttlMs = DEFAULT_TTL_MS, clock = Date.now } = {}) {
  /** @type {Map<string, { fingerprint: string, response: object | null, createdAt: number }>} */
  const entries = new Map();

  function isExpired(entry) {
    return clock() - entry.createdAt > ttlMs;
  }

  /**
   * @param {string} key
   * @param {string} fingerprint
   * @returns {{ state: 'new' } | { state: 'replay', response: object } | { state: 'in_flight' } | { state: 'mismatch' }}
   */
  function begin(key, fingerprint) {
    const entry = entries.get(key);
    if (entry && !isExpired(entry)) {
      if (entry.fingerprint !== fingerprint) return { state: 'mismatch' };
      if (entry.response === null) return { state: 'in_flight' };
      return { state: 'replay', response: entry.response };
    }
    entries.set(key, { fingerprint, response: null, createdAt: clock() });
    return { state: 'new' };
  }

  /** 처리가 끝나면 응답을 기억한다 */
  function complete(key, response) {
    const entry = entries.get(key);
    if (!entry) throw new Error(`begin 없이 complete를 불렀다: ${key}`);
    const frozen = deepFreeze(structuredClone(response));
    entries.set(key, { ...entry, response: frozen });
  }

  /** 처리 중 실패하면 키를 지워서 클라이언트가 같은 키로 다시 시도할 수 있게 한다 */
  function abort(key) {
    entries.delete(key);
  }

  return { begin, complete, abort };
}

module.exports = { createIdempotencyStore };
