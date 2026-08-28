import logo from "../../assets/Subtract.png";

export default function Logo() {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <img
        src={logo}
        alt="Base logo"
        className="h-8 w-8 object-contain sm:h-9 sm:w-9"
      />

      <h1 className="font-nunito text-[18px] font-bold sm:text-[20px]">Base</h1>
    </div>
  );
}
