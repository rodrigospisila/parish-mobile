export enum EventType {
  LITURGICAL = 'LITURGICAL',
  PASTORAL = 'PASTORAL',
  FORMATION = 'FORMATION',
  SOCIAL = 'SOCIAL',
  MEETING = 'MEETING',
}

export interface Event {
  id: string;
  title: string;
  description?: string;
  type: EventType;
  startDate: string;
  endDate: string;
  location?: string;
  isRecurring: boolean;
  recurrenceRule?: string;
  parishId: string;
  communityId?: string;
  createdAt: string;
  updatedAt: string;
}

