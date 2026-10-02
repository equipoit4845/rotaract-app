export type Role = 'PARTICIPANT' | 'SECRETARY' | 'PRESIDENT' | 'RDR' | 'COMPANY' | 'SUPERADMIN';

export interface AuthMembership {
  clubId: string;
  clubName: string;
  clubCode: string;
  title: string | null;
  isPresident: boolean;
}

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  memberships?: AuthMembership[];
}

export interface LoginResponse {
  access_token: string;
  user: AuthUser;
}

export type CompanyStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface CompanySummary {
  id: string;
  name: string;
  country?: string | null;
  city?: string | null;
  industry?: string | null;
  size?: string | null;
  website?: string | null;
  status: CompanyStatus;
}

export type TalentContactRequestStatus = 'NEW' | 'SHARED_WITH_MEMBER' | 'CLOSED';

export interface TalentContactRequestSummary {
  id: string;
  companyId: string;
  talentUserId: string;
  status: TalentContactRequestStatus;
  createdAt: string;
}
