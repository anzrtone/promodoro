import { API_BASE } from './api';

/**
 * Where opted-in welcome-survey answers go: `<API>/survey` on the Worker in worker/.
 * No API configured means nothing is ever sent: answers still personalise the app, and
 * consent is remembered for when an endpoint exists.
 */
export const SURVEY_ENDPOINT: string | null = API_BASE ? `${API_BASE}/survey` : null;
