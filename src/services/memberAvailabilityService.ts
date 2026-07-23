import api, { USE_MOCK, getErrorMessage } from '../config/api';

export interface MemberAvailabilityRule {
  id?: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  isActive: boolean;
  notes?: string | null;
}

export interface MemberAvailabilityException {
  id?: string;
  startDate: string;
  endDate: string;
  notes?: string | null;
}

export interface MemberAvailabilityResponse {
  hasMember: boolean;
  memberId: string | null;
  memberName: string | null;
  rules: MemberAvailabilityRule[];
  exceptions: MemberAvailabilityException[];
}

export interface UpdateMemberAvailabilityPayload {
  rules: Array<{
    dayOfWeek: number;
    startMinutes: number;
    endMinutes: number;
    isActive?: boolean;
    notes?: string;
  }>;
  exceptions: Array<{
    startDate: string;
    endDate: string;
    notes?: string;
  }>;
}

export const getMyAvailability = async (): Promise<MemberAvailabilityResponse> => {
  if (USE_MOCK) {
    return {
      hasMember: true,
      memberId: 'mock-member',
      memberName: 'Membro Teste',
      rules: [],
      exceptions: [],
    };
  }

  try {
    const response = await api.get<MemberAvailabilityResponse>('/members/me/availability');
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const updateMyAvailability = async (
  payload: UpdateMemberAvailabilityPayload,
): Promise<MemberAvailabilityResponse> => {
  if (USE_MOCK) {
    return {
      hasMember: true,
      memberId: 'mock-member',
      memberName: 'Membro Teste',
      rules: payload.rules.map((rule) => ({
        ...rule,
        isActive: rule.isActive ?? true,
      })),
      exceptions: payload.exceptions,
    };
  }

  try {
    const response = await api.put<MemberAvailabilityResponse>('/members/me/availability', payload);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};
