import { useTranslation } from "react-i18next";
import type { IconType } from "react-icons";

interface IndustryCardProps {
  title: string;
  description: string;
  icon: IconType;
}

export default function IndustryCard({
  title,
  description,
  icon: Icon,
}: IndustryCardProps) {
  const { t } = useTranslation();
  return (
    <div
      className="
        group
        w-full
        bg-white
        border border-[#E8E8EE]
        rounded-[16px]
        p-5
        sm:p-6
        cursor-pointer
        transition-all
        duration-300
        hover:border-[#605BFF]
        hover:bg-[#FAF9FF]
        hover:-translate-y-1
        hover:shadow-[0_8px_25px_rgba(96,91,255,0.12)]
      "
    >
      {/* Icon */}
      <div
        className="
          w-[52px]
          h-[52px]
          rounded-[14px]
          bg-[#F0EDFF]
          flex
          items-center
          justify-center
          text-[#605BFF]
          transition-transform
          duration-300
          group-hover:scale-110
        
        "
      >
        <Icon size={26} />
      </div>

      {/* Title */}
      <h3
        className="
          font-nunito
          font-bold
          text-[17px]
          sm:text-[18px]
          text-[#030229]
          mt-5
        "
      >
        {t(title)}
      </h3>

      {/* Description */}
      <p
        className="
          text-xs
          sm:text-sm
          text-gray-500
          leading-5
          mt-2
          max-w-[300px]
        "
      >
        {t(description)}
      </p>
    </div>
  );
}