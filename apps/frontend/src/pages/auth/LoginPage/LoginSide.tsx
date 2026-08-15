import imgbg from "../../../assets/Illustration2.png";

export default function LoginSide() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#f6f6f6] p-6 lg:p-10">
      <img
        src={imgbg}
        alt="Login illustration"
        className="h-auto w-full max-w-[600px] object-contain"
      />
    </div>
  );
}