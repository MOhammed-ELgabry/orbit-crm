import logo from "../../assets/Subtract.png";
export default function Logo() {
  return (
    <div className="flex flex-row  items-center gap-3  ">
      <img src={logo} alt="logo" className="w-10 " />
      <h1 className="font-nunito font-[700] text-[18px] sm:text-[20px] md:text-[24px] ">
        Base
      </h1>
    </div>
  );
}
