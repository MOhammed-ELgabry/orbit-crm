// import RegisterForm from "./RegisterForm";
// import RegisterSide from "./RegisterSide";
// import { useTranslation } from "react-i18next";
// import "animate.css";
// export default function RegisterPage() {
//   const { i18n } = useTranslation();

//   return (
//     <div
//       dir={i18n.language === "ar" ? "rtl" : "ltr"}
//       className="min-h-screen flex flex-col lg:flex-row bg-white"
//     >
//       {/* Register Form */}
//       <div className="w-full lg:w-1/2 min-h-screen animate__animated animate__fadeInLeft">
//         <RegisterForm />
//       </div>

//       {/* Register Side */}
//       <div className="w-full lg:w-1/2 min-h-screen animate__animated animate__fadeInRight">
//         <RegisterSide />
//       </div>
//     </div>
//   );
// }

import RegisterForm from "./RegisterForm";
import RegisterSide from "./RegisterSide";
import { useTranslation } from "react-i18next";

export default function RegisterPage() {
  const { i18n } = useTranslation();

  return (
    <div
      dir={i18n.language === "ar" ? "rtl" : "ltr"}
      className="flex min-h-screen flex-col overflow-hidden bg-white lg:flex-row"
    >
      {/* Register Form */}
      <div className="min-h-screen w-full lg:w-1/2 animate__animated animate__fadeInLeft">
        <RegisterForm />
      </div>

      {/* Register Side */}
      <div className="min-h-screen w-full lg:w-1/2 animate__animated animate__fadeInRight">
        <RegisterSide />
      </div>
    </div>
  );
}
