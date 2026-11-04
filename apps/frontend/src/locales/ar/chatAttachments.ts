/** مرفقات المحادثة (صور وPDF وExcel في المحادثات الفردية). */
const chatAttachments = {
  chatAttachFile: "إرفاق صورة أو ملف PDF أو Excel",
  chatAttachmentRemove: "إزالة المرفق",
  chatAttachmentRetry: "إعادة محاولة الرفع",
  chatAttachmentUploading: "جارٍ الرفع… {{percent}}٪",
  chatAttachmentUploadingLabel: "جارٍ رفع {{name}}",
  chatAttachmentReady: "جاهز للإرسال",
  chatAttachmentWaitUpload: "انتظر حتى ينتهي الرفع قبل الإرسال.",
  chatAttachmentFixFirst: "عالج المرفق أو أزله لتتمكن من الإرسال.",
  chatAttachmentLoading: "جارٍ تحميل {{name}}",
  chatAttachmentEnlarge: "تكبير الصورة {{name}}",
  chatAttachmentShrink: "تصغير الصورة {{name}}",
  chatAttachmentDownload: "تنزيل {{name}}",
  chatAttachmentUnavailable: "هذا المرفق لم يعد متاحًا.",
  chatAttachmentPreviewImage: "📷 صورة",
  chatAttachmentPreviewPdf: "📄 ملف PDF",
  chatAttachmentPreviewSpreadsheet: "📊 ملف Excel",
  chatAttachmentKindExcel: "Excel",

  chatAttachmentErrDisabled: "المرفقات غير متاحة حاليًا.",
  chatAttachmentErrDirectOnly: "يمكن إرسال المرفقات في المحادثات الفردية فقط.",
  chatAttachmentErrEmpty: "هذا الملف فارغ.",
  chatAttachmentErrUnsupported:
    "المدعوم فقط: صور PNG وJPEG وWebP وملفات PDF وملفات Excel (‎.xlsx و‎.xls).",
  chatAttachmentErrCorrupt: "هذا الملف تالف أو ليس من النوع المعلن.",
  chatAttachmentErrTooLarge:
    "حجم الملف كبير (الصور حتى 5 ميجابايت وPDF وExcel حتى 10 ميجابايت).",
  chatAttachmentErrDimensions: "أبعاد هذه الصورة كبيرة جدًا.",
  chatAttachmentErrPdfEncrypted: "ملفات PDF المحمية بكلمة مرور غير مقبولة.",
  chatAttachmentErrPdfActive:
    "يحتوي هذا الملف على محتوى نشط (سكربتات أو ملفات مضمّنة) ولم يتم قبوله.",
  chatAttachmentErrTypeMismatch:
    "اسم الملف ونوعه ومحتواه غير متطابقة. اختر ملف ‎.xlsx أو ‎.xls أو صورة أو PDF حقيقيًا.",
  chatAttachmentErrSheetMacro:
    "ملفات Excel التي تحتوي على ماكرو غير مقبولة. احفظ نسخة بصيغة ‎.xlsx وحاول مرة أخرى.",
  chatAttachmentErrSheetEncrypted: "ملفات Excel المحمية بكلمة مرور غير مقبولة.",
  chatAttachmentErrSheetActive:
    "يحتوي ملف Excel هذا على كائنات مضمّنة أو روابط خارجية أو محتوى نشط ولم يتم قبوله.",
  chatAttachmentErrQuotaPending:
    "لديك مرفقات كثيرة بانتظار الإرسال. أرسل أحدها أو أزله أولًا.",
  chatAttachmentErrQuotaDaily: "وصلت إلى حد المرفقات اليومي.",
  chatAttachmentErrStorageFull:
    "مساحة تخزين المرفقات ممتلئة. تواصل مع مسؤول النظام.",
  chatAttachmentErrBusy: "الخادم مشغول. حاول مرة أخرى بعد قليل.",
  chatAttachmentErrStorage: "المرفقات غير متاحة مؤقتًا.",
  chatAttachmentErrExpired: "انتهت صلاحية هذا المرفق. ارفعه من جديد.",
  chatAttachmentErrNotReady: "تعذر إرسال المرفق. ارفعه من جديد.",
  chatAttachmentErrUsed: "تم إرسال هذا المرفق من قبل.",
  chatAttachmentErrInvalid: "الرفع غير صالح. حاول مرة أخرى.",
  chatAttachmentErrNetwork: "مشكلة في الاتصال. تحقق من الاتصال وحاول مرة أخرى.",
  chatAttachmentErrGeneric: "تعذرت معالجة المرفق.",
};

export default chatAttachments;
