import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useState } from "react";
import { LuCalendarDays } from "react-icons/lu";

export default function DatePickerComponent() {
  const [date, setDate] = useState<Date>(new Date());

  return (
    <div className="relative">
      <LuCalendarDays className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[13px] text-brand-500" />

      <DatePicker
        selected={date}
        onChange={(selectedDate: Date | null) => {
          if (selectedDate) {
            setDate(selectedDate);
          }
        }}
        dateFormat="dd/MM/yyyy"
        className="
          h-10 w-[140px]
          rounded-xl
          border border-slate-200
          bg-slate-50
          pl-9 pr-3
          text-[13px] font-medium text-slate-700
          shadow-sm outline-none
          transition-all duration-200
          hover:border-brand-200 hover:bg-white
          focus:border-brand-400 focus:bg-white
          focus:ring-2 focus:ring-brand-50
        "
      />
    </div>
  );
}
