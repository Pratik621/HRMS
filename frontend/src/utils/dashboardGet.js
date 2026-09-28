import axios from '../config/axios';
import { createInFlightGet } from './inFlightGet';

export const dashboardGet = createInFlightGet(
  (url, config) => axios.get(url, config),
  () => localStorage.getItem('token'),
);
