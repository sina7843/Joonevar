/** Types for the backup tool, so the gate can call it from TypeScript. */
export interface BackupManifest {
  readonly takenAt: string;
  readonly transport: string;
  readonly database: { readonly sha256: string; readonly bytes: number };
  readonly privateFiles: {
    readonly count: number;
    readonly files: ReadonlyArray<{ key: string; bytes: number; sha256: string }>;
  };
}

export function runBackup(input: {
  url: string;
  storage: string;
  out: string;
  containerName?: string;
}): Promise<{ snapshot: string; manifest: BackupManifest }>;

/** Rewrites a host-side database URL for a client running inside the container. */
export function containerUrl(url: string): string;
