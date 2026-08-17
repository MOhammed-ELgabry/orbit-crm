import api from "./api";

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  companyName: string;
  avatar: File | null ;
}

export interface VerifyEmailData {
  email: string;
  code: string;
}

export const registerUser = async (data: RegisterData) => {
  const response = await api.post("/auth/register", data);

  return response.data;
};

export const verifyEmail = async (data: VerifyEmailData) => {
  const response = await api.post("/auth/verify-email", data);

  return response.data;
};

export interface LoginData {
  email: string;
  password: string;
}

export const loginUser = async (data: LoginData) => {
  const response = await api.post("/auth/login", data);

  return response.data;
};
