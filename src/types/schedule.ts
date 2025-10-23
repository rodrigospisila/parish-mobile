export enum ScheduleType {
  MASS = 'MASS',
  CHOIR = 'CHOIR',
  CLEANING = 'CLEANING',
  CATECHESIS = 'CATECHESIS',
  YOUTH_GROUP = 'YOUTH_GROUP',
  OTHER = 'OTHER',
}

export enum AssignmentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  MISSED = 'MISSED',
}

export interface Schedule {
  id: string;
  title: string;
  description?: string;
  type: ScheduleType;
  date: string;
  parishId: string;
  communityId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleAssignment {
  id: string;
  scheduleId: string;
  memberId: string;
  role: string;
  status: AssignmentStatus;
  checkedInAt?: string;
  notes?: string;
  schedule?: Schedule;
  member?: {
    id: string;
    fullName: string;
    email: string;
  };
}

