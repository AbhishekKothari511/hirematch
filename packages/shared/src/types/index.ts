export type UserRole = 'student' | 'recruiter' | 'admin';

export interface User {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export type JobType = 'full-time' | 'part-time' | 'internship' | 'contract' | 'remote';
export type ExperienceLevel = 'entry' | 'mid' | 'senior' | 'lead';
export type JobStatus = 'draft' | 'active' | 'archived' | 'closed';

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  jobType: JobType;
  experienceLevel: ExperienceLevel;
  description: string;
  requirements: string[];
  skills: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
}

export interface JobEmbedding {
  id: string;
  jobId: string;
  embedding: number[];
  modelName: string;
  dimensions: number;
  createdAt: string;
  updatedAt: string;
}

export type ResumeStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Resume {
  id: string;
  userId: string;
  fileName: string;
  s3Key: string;
  s3Bucket: string;
  fileSizeBytes: number;
  mimeType: string;
  parsedText: string | null;
  embedding: number[] | null;
  status: ResumeStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatchExplanation {
  matchReasons: string[];
  missingSkills: string[];
}

export interface JobMatch {
  id: string;
  resumeId: string;
  jobId: string;
  userId: string;
  similarityScore: number;
  keywordRank: number | null;
  vectorRank: number | null;
  rrfScore: number;
  matchReasons: string[];
  missingSkills: string[];
  status: 'computing' | 'computed' | 'failed';
  createdAt: string;
  updatedAt: string;
  job?: Job;
}

export interface HybridSearchResult {
  jobId: string;
  title: string;
  company: string;
  location: string;
  jobType: JobType;
  experienceLevel: ExperienceLevel;
  description: string;
  requirements: string[];
  skills: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  keywordRank: number | null;
  vectorRank: number | null;
  rrfScore: number;
  vectorDistance: number | null;
}

export type ApplicationStatus =
  | 'submitted'
  | 'under_review'
  | 'interviewing'
  | 'accepted'
  | 'rejected';

export interface Application {
  id: string;
  userId: string;
  jobId: string;
  resumeId: string;
  status: ApplicationStatus;
  coverNote: string | null;
  createdAt: string;
  updatedAt: string;
  job?: Job;
}

export interface ResumeJobPayload {
  resumeId: string;
  userId: string;
  s3Key: string;
  s3Bucket: string;
  fileName: string;
}

export interface DeadLetterJobPayload {
  originalJobId: string;
  queueName: string;
  payload: ResumeJobPayload;
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
}
