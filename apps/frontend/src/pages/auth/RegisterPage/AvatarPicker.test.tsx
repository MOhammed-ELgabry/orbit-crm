import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Form, Formik } from "formik";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../../../i18n";

const prepare = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/avatar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/avatar")>()),
  prepareAvatarBlob: prepare,
}));

import { AvatarError } from "../../../lib/avatar";
import AvatarPicker from "./AvatarPicker";

const picked = new Blob([new Uint8Array(10)], { type: "image/webp" });

function setup() {
  const seen: { avatar: Blob | null }[] = [];
  render(
    <Formik
      initialValues={{ avatar: null as Blob | null }}
      onSubmit={() => undefined}
    >
      {({ values }) => {
        seen.push({ avatar: values.avatar });
        return (
          <Form>
            <AvatarPicker inputClassName="x" />
          </Form>
        );
      }}
    </Formik>,
  );
  return { seen, input: screen.getByTestId("register-avatar-input") };
}

describe("register AvatarPicker", () => {
  beforeEach(() => {
    prepare.mockReset();
  });

  it("keeps the prepared image in the form and previews it", async () => {
    prepare.mockResolvedValue(picked);
    const { seen, input } = setup();

    await userEvent.upload(
      input,
      new File(["x"], "me.png", { type: "image/png" }),
    );

    expect(
      await screen.findByTestId("register-avatar-preview"),
    ).toBeInTheDocument();
    expect(seen.at(-1)?.avatar).toBe(picked);
  });

  it("is optional: nothing is picked, nothing is required", () => {
    const { seen } = setup();

    expect(seen.at(-1)?.avatar).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a clear message for a file that cannot be used and keeps nothing", async () => {
    prepare.mockRejectedValue(new AvatarError("decode"));
    const { seen, input } = setup();

    await userEvent.upload(
      input,
      new File(["x"], "me.png", { type: "image/png" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That file couldn't be read as an image.",
    );
    expect(seen.at(-1)?.avatar).toBeNull();
  });

  it("lets the user drop the chosen picture again", async () => {
    prepare.mockResolvedValue(picked);
    const { seen, input } = setup();

    await userEvent.upload(
      input,
      new File(["x"], "me.png", { type: "image/png" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove photo" }),
    );

    await waitFor(() => expect(seen.at(-1)?.avatar).toBeNull());
    expect(
      screen.queryByTestId("register-avatar-preview"),
    ).not.toBeInTheDocument();
  });
});
