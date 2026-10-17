import { Job, Resume, JobMatch } from '@hirematch/shared';
import { getBrowserSupabase } from './supabaseClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export async function getAuthHeader(): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {};

  // Check Supabase session
  try {
    const supabase = getBrowserSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    // Fallback to demo token
  }

  const demoToken = localStorage.getItem('hirematch_demo_token');
  if (demoToken) {
    return { Authorization: `Bearer ${demoToken}` };
  }

  return {};
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeader();
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }

  return data as T;
}

// ----------------------------------------------------------------------------
// API Services
// ----------------------------------------------------------------------------

export async function getJobs(params?: {
  query?: string;
  jobType?: string;
  experienceLevel?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: Job[]; pagination: any }> {
  const searchParams = new URLSearchParams();
  if (params?.query) searchParams.set('query', params.query);
  if (params?.jobType) searchParams.set('jobType', params.jobType);
  if (params?.experienceLevel) searchParams.set('experienceLevel', params.experienceLevel);
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());

  return apiRequest(`/jobs?${searchParams.toString()}`);
}

export async function getJobById(id: string): Promise<{ data: Job }> {
  return apiRequest(`/jobs/${id}`);
}

export async function getResumeUploadUrl(fileName: string, fileSizeBytes: number): Promise<{
  uploadUrl: string;
  s3Key: string;
  s3Bucket: string;
  expiresInSeconds: number;
}> {
  return apiRequest('/resumes/upload-url', {
    method: 'POST',
    body: JSON.stringify({
      fileName,
      fileSizeBytes,
      mimeType: 'application/pdf',
    }),
  });
}

export async function confirmResumeUpload(payload: {
  s3Key: string;
  fileName: string;
  fileSizeBytes: number;
  s3Bucket?: string;
}): Promise<{ data: Resume; jobId: string }> {
  return apiRequest('/resumes/confirm', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      mimeType: 'application/pdf',
    }),
  });
}

export async function getResumes(): Promise<{ data: Resume[] }> {
  return apiRequest('/resumes');
}

export async function getResumeById(id: string): Promise<{ data: Resume & { downloadUrl?: string } }> {
  return apiRequest(`/resumes/${id}`);
}

export async function deleteResume(id: string): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/resumes/${id}`, {
    method: 'DELETE',
  });
}

export async function getMatches(resumeId: string): Promise<{
  cached: boolean;
  count: number;
  data: JobMatch[];
}> {
  return apiRequest(`/matches?resumeId=${resumeId}`);
}

export async function computeMatches(resumeId: string): Promise<{
  message: string;
  count: number;
  data: JobMatch[];
}> {
  return apiRequest('/matches/compute', {
    method: 'POST',
    body: JSON.stringify({ resumeId }),
  });
}
