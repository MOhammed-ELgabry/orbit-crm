import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./api", () => ({ default: api, API_BASE_URL: "http://api.test" }));

import { registerUser } from "./authService";

const data = {
  firstName: "Mona",
  lastName: "Ali",
  email: "mona@example.com",
  password: "Str0ng!Passw0rd",
  companyName: "Orbit Test Co",
  phone: "+201001234567",
};

describe("registerUser", () => {
  beforeEach(() => {
    api.post.mockReset();
    api.post.mockResolvedValue({ data: { success: true } });
  });

  it("stays a plain JSON request when there is no picture", async () => {
    await registerUser(data);

    expect(api.post).toHaveBeenCalledWith("/auth/register", data);
  });

  it("leaves an empty phone out instead of sending an invalid empty string", async () => {
    await registerUser({ ...data, phone: "  " });

    const [, body] = api.post.mock.calls[0];
    expect(body).not.toHaveProperty("phone");
  });

  it("sends multipart/form-data with the picture in the avatar field when one is picked", async () => {
    const picture = new Blob([new Uint8Array(10)], { type: "image/webp" });

    await registerUser(data, picture);

    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/auth/register");
    expect(body).toBeInstanceOf(FormData);

    const form = body as FormData;
    expect(form.get("email")).toBe("mona@example.com");
    expect(form.get("companyName")).toBe("Orbit Test Co");
    const file = form.get("avatar") as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("avatar.webp");
    expect(file.type).toBe("image/webp");
  });
});
