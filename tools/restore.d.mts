/** Types for the restore tool, so the gate can call it from TypeScript. */
export function runRestore(input: {
  from: string;
  url: string;
  storage: string;
  containerName?: string;
}): Promise<{ transport: string; files: number; takenAt: string }>;
