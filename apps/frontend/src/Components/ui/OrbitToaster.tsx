import { Toaster } from "react-hot-toast";

/**
 * The single toast outlet for the Dashboard (top-center).
 *
 * Direction: toasts render inside <html dir>, which AuthContext keeps in sync
 * with the user's language, so RTL/LTR needs no handling here. Reduced
 * motion is handled in index.css (`.orbit-toaster`), not in JS.
 */
export default function OrbitToaster() {
  return (
    <Toaster
      position="top-center"
      containerClassName="orbit-toaster"
      containerStyle={{ top: 72 }}
      toastOptions={{
        className: "orbit-toast",
        style: {
          maxWidth: 420,
          borderRadius: 14,
          padding: "10px 14px",
          background: "#ffffff",
          color: "#172019",
          boxShadow: "var(--shadow-pop)",
          border: "1px solid #e2e7e4",
          fontFamily: "var(--font-sans)",
        },
      }}
    />
  );
}
