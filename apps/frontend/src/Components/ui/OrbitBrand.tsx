import logo from "../../assets/Subtract.png";

interface OrbitBrandProps {
  /**
   * `auth` is the large stacked mark used above sign-in forms; `sidebar` is
   * the compact one-line mark used in the dashboard navigation.
   */
  variant?: "auth" | "sidebar";
  className?: string;
}

/**
 * The Orbit mark (green chart-line badge, `assets/Subtract.png`) followed by
 * the "Orbit" wordmark. One component so every screen shows the same brand.
 *
 * The product name is not translated and is always left-to-right, so the mark
 * keeps its order in Arabic (RTL) pages. The image is decorative: the visible
 * wordmark already names the product for assistive technology.
 */
export default function OrbitBrand({
  variant = "auth",
  className = "",
}: OrbitBrandProps) {
  const isAuth = variant === "auth";

  return (
    <div
      dir="ltr"
      data-testid="orbit-brand"
      className={`${
        isAuth ? "mb-3 flex-col gap-2" : "flex-row gap-3"
      } flex items-center ${className}`}
    >
      <img
        src={logo}
        alt=""
        aria-hidden="true"
        className={
          isAuth
            ? "h-[58px] w-[58px] object-contain sm:h-[66px] sm:w-[66px]"
            : "w-10"
        }
      />
      <span
        lang="en"
        className={
          isAuth
            ? "font-nunito text-[30px] font-extrabold leading-none tracking-tight text-brand-700 sm:text-[36px]"
            : "font-nunito text-[18px] font-bold sm:text-[20px] md:text-[24px]"
        }
      >
        Orbit
      </span>
    </div>
  );
}
