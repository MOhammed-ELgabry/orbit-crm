import api from "./api";
import type { ApiEnvelope, PaginatedEnvelope, PaginationMeta } from "../types/api";
import type {
  CreateTaskInput,
  Task,
  TaskQuery,
  UpdateTaskInput,
} from "../types/task";

export interface TaskListResult {
  tasks: Task[];
  meta: PaginationMeta;
}

export const listTasks = async (
  query: TaskQuery = {},
): Promise<TaskListResult> => {
  const response = await api.get<PaginatedEnvelope<Task>>("/tasks", {
    params: query,
  });

  return { tasks: response.data.data, meta: response.data.meta };
};

export const getTask = async (id: string): Promise<Task> => {
  const response = await api.get<ApiEnvelope<Task>>(`/tasks/${id}`);
  return response.data.data;
};

export const createTask = async (input: CreateTaskInput): Promise<Task> => {
  const response = await api.post<ApiEnvelope<Task>>("/tasks", input);
  return response.data.data;
};

export const updateTask = async (
  id: string,
  input: UpdateTaskInput,
): Promise<Task> => {
  const response = await api.patch<ApiEnvelope<Task>>(`/tasks/${id}`, input);
  return response.data.data;
};

export const deleteTask = async (id: string): Promise<void> => {
  await api.delete(`/tasks/${id}`);
};