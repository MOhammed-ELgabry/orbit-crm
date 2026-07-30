export interface ICompany {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  logo: string | null;
  website: string | null;
  taxNumber: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}