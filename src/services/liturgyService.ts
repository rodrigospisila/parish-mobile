import api, { getErrorMessage } from '../config/api';

export interface LiturgyReading {
  title: string;
  text: string;
  reference: string;
}

export interface LiturgyData {
  date: string;
  liturgy: string;
  liturgicalColor: string;
  firstReading?: LiturgyReading;
  psalm?: LiturgyReading;
  secondReading?: LiturgyReading;
  gospel?: LiturgyReading;
}

const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === 'true';

const buildMockLiturgy = (date: string): LiturgyData => ({
  date,
  liturgy: 'Tempo Comum',
  liturgicalColor: 'Verde',
  firstReading: {
    title: 'Primeira Leitura',
    text: '',
    reference: 'At 4,32-35',
  },
  psalm: {
    title: 'Salmo',
    text: '',
    reference: 'Sl 118',
  },
  gospel: {
    title: 'Evangelho',
    text: '',
    reference: 'Jo 3,16-18',
  },
});

export const getTodayLiturgy = async (): Promise<LiturgyData> => {
  const today = new Date().toISOString().slice(0, 10);

  if (USE_MOCK) {
    return buildMockLiturgy(today);
  }

  try {
    const response = await api.get<LiturgyData>('/liturgy/today');
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const getLiturgyByDate = async (date: string): Promise<LiturgyData> => {
  if (USE_MOCK) {
    return buildMockLiturgy(date);
  }

  try {
    const response = await api.get<LiturgyData>(`/liturgy/${date}`);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export default {
  getTodayLiturgy,
  getLiturgyByDate,
};
