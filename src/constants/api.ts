// Configure this with your backend URL
// For local development, use your machine's IP address (not localhost)
// Example: 'http://192.168.1.100:3000/api/v1'
export const API_BASE_URL = __DEV__
  ? 'http://192.168.1.100:3000/api/v1' // Change to your local IP
  : 'https://api.parish.app/api/v1'; // Production URL

export const API_ENDPOINTS = {
  // Auth
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  REFRESH: '/auth/refresh',
  LOGOUT: '/auth/logout',
  ME: '/auth/me',

  // Liturgy
  LITURGY_TODAY: '/liturgy/today',
  LITURGY_DATE: (date: string) => `/liturgy/${date}`,

  // Events
  EVENTS: '/events',
  EVENT_BY_ID: (id: string) => `/events/${id}`,

  // Schedules
  SCHEDULES_MY: '/schedules/my-assignments',
  SCHEDULE_CHECKIN: (id: string) => `/schedules/assignments/${id}/checkin`,
  SCHEDULE_UNDO_CHECKIN: (id: string) => `/schedules/assignments/${id}/undo-checkin`,
} as const;

