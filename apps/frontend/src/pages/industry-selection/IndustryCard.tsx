import type { IconType } from "react-icons";

interface IndustryCardProps {
  title: string;
  description: string;
  icon: IconType;
  selected: boolean;
  onClick: () => void;
}

export default function IndustryCard({
  title,
  description,
  icon: Icon,
  selected,
  onClick,
}: IndustryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full text-left rounded-2xl border-2 p-5 transition-all duration-200 flex flex-col items-start gap-3 cursor-pointer ${
        selected
          ? "border-[#605BFF] bg-[#F7F6FF] shadow-[0_6px_20px_rgba(96,91,255,0.15)]"
          : "border-transparent bg-[#F7F7F8] hover:border-[#D9D6FF] hover:bg-[#FAFAFC]"
      }`}
    >
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors duration-200 ${
          selected ? "bg-[#605BFF]" : "bg-[#F0EDFF]"
        }`}
      >
        <Icon size={22} className={selected ? "text-white" : "text-[#605BFF]"} />
      </div>

      <div>
        <h3 className="font-nunito font-semibold text-[16px] text-[#030229]">
          {title}
        </h3>

        <p className="text-sm text-gray-500 mt-1 leading-5">{description}</p>
      </div>
    </button>
  );
}