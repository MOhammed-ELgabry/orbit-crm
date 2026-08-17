import axios from "axios";

const api = axios.create({
  baseURL: "http://162.35.172.155:3000",
});
export default api;
