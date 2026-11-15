export class LeaderElector {
  private channelName: string;
  private isLeaderState: boolean = false;
  private leadershipPromise: Promise<boolean> | null = null;
  private resolveLeadership?: (val: boolean) => void;
  private abortController: AbortController | null = null;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;

  constructor(dbName: string) {
    this.channelName = `xorindb_leader_${dbName}`;
  }

  isLeader(): boolean {
    return this.isLeaderState;
  }

  async waitForLeadership(): Promise<boolean> {
    if (this.isLeaderState) return true;
    if (this.leadershipPromise) return this.leadershipPromise;

    this.leadershipPromise = new Promise<boolean>((resolve) => {
      this.resolveLeadership = resolve;
    });

    // 1. Try modern Web Locks API if available (Supported across Chrome, Edge, Safari 15.4+, Firefox 96+)
    if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks.request) {
      this.abortController = new AbortController();
      navigator.locks.request(
        this.channelName,
        { signal: this.abortController.signal },
        () => {
          return new Promise<void>((lockResolver) => {
            this.isLeaderState = true;
            this.resolveLeadership?.(true);

            // Keep the lock active until elector is closed
            if (this.abortController) {
              this.abortController.signal.addEventListener('abort', () => {
                this.isLeaderState = false;
                lockResolver();
              });
            }
          });
        }
      ).catch(() => {
        // Lock request aborted or failed
        this.isLeaderState = false;
      });
    } else {
      // 2. Fallback for Node.js / non-browser / older environments
      // In single process / Node / SSR, claim leadership immediately
      this.isLeaderState = true;
      this.resolveLeadership?.(true);
    }

    return this.leadershipPromise;
  }

  close(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    this.isLeaderState = false;
    this.leadershipPromise = null;
  }
}
