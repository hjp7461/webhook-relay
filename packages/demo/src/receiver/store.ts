import { RECEIVER_STORE_LIMIT } from "../constants.js";

// demo/receiver/store.ts
//
// 데모 수신자(/_demo/receiver)가 받은 페이로드를 최근 N건 보관하는
// 인메모리 FIFO 저장소(PRD `01` F1.3).
//
// 본 데모 전용. 인증 없음(데모 수신자 정책 — Q-API-1 의 작업 등록 API
// 인증과는 별개).

export interface ReceivedEntry {
  readonly receivedAt: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export class ReceiverStore {
  // 단일 프로세스/워커 가정. 분산 환경에서는 의미 없는 저장소.
  private readonly entries: ReceivedEntry[] = [];
  private readonly limit: number;

  constructor(limit: number = RECEIVER_STORE_LIMIT) {
    this.limit = Math.max(1, limit);
  }

  add(entry: ReceivedEntry): void {
    this.entries.push(entry);
    while (this.entries.length > this.limit) {
      this.entries.shift();
    }
  }

  list(): readonly ReceivedEntry[] {
    return [...this.entries];
  }

  size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries.length = 0;
  }
}
