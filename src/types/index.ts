/**
 * Tipos e interfaces para o app Parish Mobile
 * Correspondem aos modelos do backend NestJS/Prisma
 */

// ============================================
// ENUMS
// ============================================

/**
 * Roles de usuário
 */
export type UserRole =
  | 'SYSTEM_ADMIN'
  | 'DIOCESAN_ADMIN'
  | 'PARISH_ADMIN'
  | 'COMMUNITY_COORDINATOR'
  | 'PASTORAL_COORDINATOR'
  | 'SECRETARY'
  | 'CATECHIST'
  | 'MINISTER'
  | 'FAITHFUL';

/**
 * Tipos de evento
 */
export type EventType =
  | 'MASS'
  | 'SACRAMENT'
  | 'PASTORAL_MEETING'
  | 'PASTORAL_ACTIVITY'
  | 'COMMUNITY_EVENT'
  | 'RETREAT'
  | 'FORMATION'
  | 'VISITATION'
  | 'OTHER';

/**
 * Status de evento
 */
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

/**
 * Tipos de recorrência
 */
export type RecurrenceType = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';

/**
 * Gênero
 */
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

/**
 * Estado civil
 */
export type MaritalStatus = 'SINGLE' | 'MARRIED' | 'WIDOWED' | 'DIVORCED' | 'RELIGIOUS';

/**
 * Status de membro
 */
export type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'DECEASED';

// ============================================
// ESTRUTURA ECLESIAL
// ============================================

/**
 * Diocese
 */
export interface Diocese {
  id: string;
  name: string;
  description?: string;
  bishopName?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Paróquia
 */
export interface Parish {
  id: string;
  name: string;
  description?: string;
  patronSaint?: string;
  parishPriest?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  dioceseId: string;
  diocese?: Diocese;
  createdAt: string;
  updatedAt: string;
}

/**
 * Comunidade
 */
export interface Community {
  id: string;
  name: string;
  description?: string;
  patronSaint?: string;
  address?: string;
  phone?: string;
  email?: string;
  parishId: string;
  parish?: Parish;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// USUÁRIO E MEMBRO
// ============================================

/**
 * Usuário do sistema
 */
export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  forcePasswordChange?: boolean;
  dioceseId?: string;
  parishId?: string;
  communityId?: string;
  primaryCommunityId?: string;
  createdAt: string;
  updatedAt?: string;
  lastLogin?: string;
}

/**
 * Membro da comunidade
 */
export interface Member {
  id: string;
  fullName: string;
  birthDate?: string;
  cpf?: string;
  rg?: string;
  gender?: Gender;
  maritalStatus?: MaritalStatus;
  occupation?: string;
  photoUrl?: string;
  phone?: string;
  email?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  fatherName?: string;
  motherName?: string;
  status: MemberStatus;
  userId?: string;
  communityId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// PASTORAIS
// ============================================

/**
 * Pastoral global (catálogo)
 */
export interface GlobalPastoral {
  id: string;
  name: string;
  description?: string;
  category?: string;
  iconName?: string;
  color?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Pastoral da comunidade
 */
export interface CommunityPastoral {
  id: string;
  description?: string;
  meetingDay?: number;
  meetingTime?: string;
  meetingLocation?: string;
  isActive: boolean;
  communityId: string;
  community?: Community;
  globalPastoralId: string;
  globalPastoral?: GlobalPastoral;
  members?: PastoralMember[];
  coordinators?: PastoralCoordinator[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Membro de pastoral
 */
export interface PastoralMember {
  id: string;
  role?: string;
  isActive: boolean;
  communityPastoralId?: string;
  communityPastoral?: CommunityPastoral;
  pastoralGroupId?: string;
  memberId: string;
  member?: Member;
  joinedAt: string;
  leftAt?: string;
}

/**
 * Coordenador de pastoral
 */
export interface PastoralCoordinator {
  id: string;
  communityPastoralId: string;
  memberId: string;
  member?: Member;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Grupo de pastoral (sub-grupo)
 */
export interface PastoralGroup {
  id: string;
  name: string;
  description?: string;
  communityPastoralId: string;
  communityPastoral?: CommunityPastoral;
  members?: PastoralMember[];
  createdAt: string;
  updatedAt: string;
}

// ============================================
// EVENTOS
// ============================================

/**
 * Evento
 */
export interface Event {
  id: string;
  title: string;
  description?: string;
  type: EventType;
  startDate: string;
  endDate?: string;
  location?: string;
  notes?: string;
  isRecurring: boolean;
  recurrenceType?: RecurrenceType;
  recurrenceInterval?: number;
  recurrenceDays?: string;
  recurrenceEndDate?: string;
  recurrenceRule?: string;
  maxParticipants?: number;
  isPublic: boolean;
  status: EventStatus;
  communityId: string;
  community?: Community;
  eventPastorals?: EventPastoral[];
  participants?: EventParticipant[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Participante de evento
 */
export interface EventParticipant {
  id: string;
  eventId: string;
  memberId: string;
  member?: Member;
  registeredAt: string;
  attended: boolean;
  notes?: string;
}

/**
 * Pastoral vinculada a um evento
 */
export interface EventPastoral {
  id: string;
  eventId: string;
  event?: Event;
  communityPastoralId: string;
  communityPastoral?: CommunityPastoral;
  role?: string;
  isLeader: boolean;
  notes?: string;
  assignments?: EventPastoralAssignment[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Atribuição de membro em evento (escala)
 */
export interface EventPastoralAssignment {
  id: string;
  eventPastoralId: string;
  eventPastoral?: EventPastoral;
  memberId: string;
  member?: Member;
  role: string;
  checkedIn: boolean;
  checkedInAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// ESCALAS (SCHEDULES)
// ============================================

/**
 * Escala
 */
export interface Schedule {
  id: string;
  title: string;
  description?: string;
  date: string;
  eventId: string;
  event?: Event;
  assignments?: ScheduleAssignment[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Atribuição de escala
 */
export interface ScheduleAssignment {
  id: string;
  role: string;
  checkedIn: boolean;
  checkedInAt?: string;
  scheduleId: string;
  schedule?: Schedule;
  memberId: string;
  member?: Member;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// HORÁRIOS DE MISSA
// ============================================

/**
 * Tipo de horário de missa
 */
export type MassScheduleType = 'REGULAR' | 'SPECIAL' | 'HOLIDAY';

/**
 * Horário de missa
 */
export interface MassSchedule {
  id: string;
  dayOfWeek: number;
  time: string;
  type: MassScheduleType;
  notes?: string;
  isSpecial: boolean;
  specialDate?: string;
  communityId: string;
  community?: Community;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// NOTÍCIAS E AVISOS
// ============================================

/**
 * Notícia/Aviso
 */
export interface News {
  id: string;
  title: string;
  content: string;
  summary?: string;
  imageUrl?: string;
  isPublished: boolean;
  isPinned: boolean;
  publishedAt?: string;
  expiresAt?: string;
  authorId: string;
  communityId: string;
  community?: Community;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// PEDIDOS DE ORAÇÃO
// ============================================

/**
 * Categoria de pedido de oração
 */
export type PrayerRequestCategory =
  | 'HEALTH'
  | 'FAMILY'
  | 'WORK'
  | 'SPIRITUAL'
  | 'THANKSGIVING'
  | 'OTHER';

/**
 * Status de pedido de oração
 */
export type PrayerRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ANSWERED';

/**
 * Pedido de oração
 */
export interface PrayerRequest {
  id: string;
  title: string;
  description: string;
  category: PrayerRequestCategory;
  isAnonymous: boolean;
  status: PrayerRequestStatus;
  prayerCount: number;
  communityId: string;
  community?: Community;
  memberId?: string;
  member?: Member;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// INTENÇÕES DE MISSA
// ============================================

/**
 * Tipo de intenção
 */
export type IntentionType = 'LIVING' | 'DECEASED' | 'THANKSGIVING' | 'SPECIAL';

/**
 * Intenção de missa
 */
export interface MassIntention {
  id: string;
  intentionFor: string;
  type: IntentionType;
  requestedDate: string;
  notes?: string;
  amount?: number;
  isPaid: boolean;
  paidAt?: string;
  paymentMethod?: string;
  communityId: string;
  community?: Community;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// HELPERS
// ============================================

/**
 * Mapeia o tipo de evento do backend para label em português
 */
export const eventTypeLabels: Record<EventType, string> = {
  MASS: 'Missa',
  SACRAMENT: 'Sacramento',
  PASTORAL_MEETING: 'Reunião de Pastoral',
  PASTORAL_ACTIVITY: 'Atividade de Pastoral',
  COMMUNITY_EVENT: 'Evento Comunitário',
  RETREAT: 'Retiro',
  FORMATION: 'Formação',
  VISITATION: 'Visita',
  OTHER: 'Outro',
};

/**
 * Mapeia o tipo de evento para cor
 */
export const eventTypeColors: Record<EventType, string> = {
  MASS: '#E53935', // Vermelho
  SACRAMENT: '#8E24AA', // Roxo
  PASTORAL_MEETING: '#1E88E5', // Azul
  PASTORAL_ACTIVITY: '#43A047', // Verde
  COMMUNITY_EVENT: '#FB8C00', // Laranja
  RETREAT: '#00ACC1', // Ciano
  FORMATION: '#5E35B1', // Roxo escuro
  VISITATION: '#6D4C41', // Marrom
  OTHER: '#757575', // Cinza
};

/**
 * Mapeia o role do usuário para label em português
 */
export const userRoleLabels: Record<UserRole, string> = {
  SYSTEM_ADMIN: 'Administrador do Sistema',
  DIOCESAN_ADMIN: 'Administrador Diocesano',
  PARISH_ADMIN: 'Administrador Paroquial',
  COMMUNITY_COORDINATOR: 'Coordenador de Comunidade',
  PASTORAL_COORDINATOR: 'Coordenador de Pastoral',
  SECRETARY: 'Secretário(a)',
  CATECHIST: 'Catequista',
  MINISTER: 'Ministro(a)',
  FAITHFUL: 'Fiel',
};
