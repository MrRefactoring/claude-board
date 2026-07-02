export type ScanPhase = 'idle' | 'scanning' | 'preview' | 'saved' | 'error';

export interface Prescan {
  fileCount?: number;
  projectTypes?: string[];
}

export interface ScanHistoryItem {
  id: number;
  content?: string;
  createdAt?: string;
  date?: string;
  scanType?: string;
  fileCount?: number;
}
