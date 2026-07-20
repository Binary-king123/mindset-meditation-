// ============================================================
// Core Domain Types for The Mindset Meditation Platform
// ============================================================

// --- Enums ---

export enum UserRole {
  GUEST = 'guest',
  USER = 'user',
  PREMIUM = 'premium',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

export enum TrackStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  TRIAL = 'trial',
  PAST_DUE = 'past_due',
}

export enum SubscriptionPlan {
  FREE = 'free',
  PREMIUM_MONTHLY = 'premium_monthly',
  PREMIUM_YEARLY = 'premium_yearly',
}

export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  NEW_TRACK = 'new_track',
  SUBSCRIPTION = 'subscription',
}

export enum AnalyticsEventType {
  TRACK_PLAY = 'track_play',
  TRACK_PAUSE = 'track_pause',
  TRACK_COMPLETE = 'track_complete',
  TRACK_DOWNLOAD = 'track_download',
  TRACK_FAVORITE = 'track_favorite',
  TRACK_UNFAVORITE = 'track_unfavorite',
  SEARCH = 'search',
  USER_SIGNUP = 'user_signup',
  USER_LOGIN = 'user_login',
  SUBSCRIPTION_START = 'subscription_start',
  SUBSCRIPTION_CANCEL = 'subscription_cancel',
  PAGE_VIEW = 'page_view',
}

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LOGIN = 'login',
  LOGOUT = 'logout',
  UPLOAD = 'upload',
  DOWNLOAD = 'download',
  ROLE_ASSIGN = 'role_assign',
  PERMISSION_GRANT = 'permission_grant',
  PERMISSION_REVOKE = 'permission_revoke',
}

// --- Base Types ---

export interface Timestamps {
  created_at: string;
  updated_at: string;
}

export interface SoftDelete {
  deleted_at: string | null;
}

// --- User / Profile Types ---

export interface Profile extends Timestamps {
  id: string; // UUID = auth.users.id
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  website: string | null;
  is_verified: boolean;
  is_active: boolean;
  last_seen_at: string | null;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications_enabled: boolean;
  email_notifications: boolean;
  playback_speed: number;
  sleep_timer_minutes: number | null;
  autoplay: boolean;
  continue_listening: boolean;
}

export interface Role {
  id: string;
  name: UserRole;
  description: string | null;
  created_at: string;
}

export interface Permission {
  id: string;
  name: string;
  description: string | null;
  resource: string;
  action: string;
  created_at: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  created_at: string;
}

export interface UserRoleAssignment {
  id: string;
  user_id: string;
  role_id: string;
  assigned_by: string | null;
  created_at: string;
}

export interface UserWithRole extends Profile {
  role: UserRole;
}

// --- Track Types ---

export interface Track extends Timestamps, SoftDelete {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  duration_seconds: number;
  audio_url: string;
  audio_path: string; // Supabase storage path
  thumbnail_url: string | null;
  thumbnail_path: string | null;
  category_id: string | null;
  instructor_name: string | null;
  instructor_avatar_url: string | null;
  is_premium: boolean;
  is_featured: boolean;
  status: TrackStatus;
  play_count: number;
  download_count: number;
  favorite_count: number;
  tags: string[];
  language: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  mood: string | null;
  search_vector: string | null; // tsvector stored as text
  metadata: Record<string, unknown>;
}

export interface TrackWithCategory extends Track {
  category: Category | null;
}

// --- Category Types ---

export interface Category extends Timestamps, SoftDelete {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  image_path: string | null;
  icon: string | null;
  color: string | null;
  is_featured: boolean;
  sort_order: number;
  track_count?: number;
}

// --- Playlist Types ---

export interface Playlist extends Timestamps, SoftDelete {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  is_public: boolean;
  track_count: number;
  total_duration_seconds: number;
}

export interface PlaylistTrack {
  id: string;
  playlist_id: string;
  track_id: string;
  position: number;
  added_at: string;
  track?: Track;
}

export interface PlaylistWithTracks extends Playlist {
  tracks: PlaylistTrack[];
}

// --- User Activity Types ---

export interface Favorite {
  id: string;
  user_id: string;
  track_id: string;
  created_at: string;
  track?: Track;
}

export interface Download {
  id: string;
  user_id: string;
  track_id: string;
  downloaded_at: string;
  ip_address: string | null;
  user_agent: string | null;
  track?: Track;
}

export interface ListeningHistory {
  id: string;
  user_id: string;
  track_id: string;
  listened_at: string;
  duration_listened_seconds: number;
  completed: boolean;
  playback_position_seconds: number;
  track?: Track;
}

// --- Subscription Types ---

export interface Subscription extends Timestamps {
  id: string;
  user_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  started_at: string;
  ends_at: string | null;
  cancelled_at: string | null;
  trial_ends_at: string | null;
  external_subscription_id: string | null;
  metadata: Record<string, unknown>;
}

// --- Notification Types ---

export interface Notification extends Timestamps, SoftDelete {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  read_at: string | null;
  action_url: string | null;
  metadata: Record<string, unknown>;
}

// --- Analytics Types ---

export interface AnalyticsEvent {
  id: string;
  user_id: string | null;
  event_type: AnalyticsEventType;
  track_id: string | null;
  session_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  referrer: string | null;
  page_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: AuditAction;
  resource_type: string;
  resource_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// --- Settings Types ---

export interface AppSetting {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  is_public: boolean;
  updated_by: string | null;
  updated_at: string;
}

// --- API Response Types ---

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface PaginatedResponse<T> {
  data: T;
  meta: PaginationMeta;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface TrackListParams extends PaginationParams {
  category_id?: string;
  is_premium?: boolean;
  is_featured?: boolean;
  status?: TrackStatus;
  difficulty?: string;
  mood?: string;
  tags?: string[];
  search?: string;
}

export interface SearchResult {
  tracks: TrackWithCategory[];
  categories: Category[];
  total: number;
}

// --- Upload Types ---

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  path: string;
  url: string;
  fullPath: string;
}

// --- Audio Player Types ---

export interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackSpeed: number;
  sleepTimerMinutes: number | null;
  sleepTimerEndsAt: number | null;
  isRepeat: boolean;
  isShuffle: boolean;
}

// --- Health Types ---

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  services: {
    database: ServiceStatus;
    storage: ServiceStatus;
    auth: ServiceStatus;
  };
  metrics?: {
    uptime_seconds: number;
    memory_mb: number;
    cpu_percent: number;
  };
}

export interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency_ms?: number;
  message?: string;
}

// --- Auth Types ---

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  is_premium: boolean;
  profile?: Profile;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  full_name: string;
}

export interface ResetPasswordRequest {
  email: string;
}

export interface UpdatePasswordRequest {
  password: string;
  confirm_password: string;
}

// --- Dashboard Analytics Types ---

export interface DashboardStats {
  total_users: number;
  new_users_today: number;
  total_tracks: number;
  total_plays_today: number;
  total_plays_all_time: number;
  total_downloads_today: number;
  active_subscriptions: number;
  storage_used_gb: number;
}

export interface PlayCountByDay {
  date: string;
  count: number;
}

export interface TopTrack {
  track: Track;
  play_count: number;
  download_count: number;
}
