import imgbg from "../../../assets/Illustration.png";

export default function RegisterSide() {
  return (
    <div className="w-full h-full min-h-[300px] lg:min-h-screen bg-[#f6f6f6] flex items-center justify-center p-6">
      <img
        src={imgbg}
        alt="Register illustration"
        className="w-full max-w-[450px] lg:max-w-[550px] h-auto object-contain"
      />
    </div>
  );
}
