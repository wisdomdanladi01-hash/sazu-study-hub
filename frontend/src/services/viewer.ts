import { apiBlob, apiRequest } from '@/services/api';

export interface ViewerPage {
  number: number;
  kind: 'image' | 'text';
}

export interface ViewerManifest {
  user_id: number;
  resource_id: number;
  title: string;
  version: string;
  viewable: boolean;
  message: string | null;
  page_count: number;
  pages: ViewerPage[];
  access_expires_at: string | null;
  offline_allowed: boolean;
  offline_expires_at: string | null;
  downloads_enabled: boolean;
  watermark: string;
}

export const viewerService = {
  getManifest(resourceId: string | number): Promise<ViewerManifest> {
    return apiRequest<ViewerManifest>(`/resources/${encodeURIComponent(String(resourceId))}/viewer`);
  },
  fetchPage(resourceId: string | number, pageNumber: number): Promise<Blob> {
    return apiBlob(`/resources/${encodeURIComponent(String(resourceId))}/viewer/pages/${pageNumber}`);
  },
};
