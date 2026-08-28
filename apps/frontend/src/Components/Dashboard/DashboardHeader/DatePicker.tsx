import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useState } from "react";
import { FaCalendarAlt } from "react-icons/fa";

export default function DatePickerComponent() {
  const [date, setDate] = useState<Date>(new Date());

  return (
    <div className="relative">
      <FaCalendarAlt
        className="
          pointer-events-none
          absolute
          left-2.5
          top-1/2
          z-10
          -translate-y-1/2
          text-[12px]
          text-blue-500
          sm:left-3
          sm:text-[13px]
        "
      />

      <DatePicker
        selected={date}
        onChange={(selectedDate: Date | null) => {
          if (selectedDate) {
            setDate(selectedDate);
          }
        }}
        dateFormat="dd/MM/yyyy"
        className="
          h-9
          w-[112px]
          rounded-xl
          border border-slate-200
          bg-slate-50
          pl-8
          pr-2
          text-[10px]
          font-medium
          text-slate-700
          shadow-sm
          outline-none
          transition-all
          duration-200

          hover:border-blue-200
          hover:bg-white

          focus:border-blue-400
          focus:bg-white
          focus:ring-2
          focus:ring-blue-50

          sm:h-10
          sm:w-[130px]
          sm:pl-9
          sm:pr-3
          sm:text-[12px]
        "
      />
    </div>
  );
}
