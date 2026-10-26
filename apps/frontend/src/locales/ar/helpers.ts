import {
  flattenHelpers,
  type HelperContent,
  type HelperId,
} from "../../lib/helperRegistry";

const content: Record<HelperId, HelperContent> = {
  navDashboard: {
    title: "لوحة التحكم",
    body: "صفحتك الرئيسية بأهم الأعداد وآخر النشاطات.",
    benefit: "تعرف ما يحتاج انتباهك بنظرة واحدة.",
  },
  navContacts: {
    title: "الجهات",
    body: "الأشخاص والجهات التي تتعامل معها في قائمة واحدة.",
    benefit: "تجد أي جهة بسرعة وتفتح سجلها الكامل.",
  },
  navTeam: {
    title: "الفريق",
    body: "المستخدمون في هذه المساحة وما يستطيع كل منهم فعله.",
    benefit: "تتحكم في من يملك الوصول.",
  },
  navLeads: {
    title: "العملاء المحتملون",
    body: "أشخاص لا تزال تقيّم اهتمامهم.",
    benefit: "تتابع كل واحد حتى يتحول إلى صفقة.",
  },
  navDeals: {
    title: "الصفقات",
    body: "فرص البيع وهي تتحرك عبر مراحل المسار.",
    benefit: "تعرف مرحلة كل صفقة وقيمتها.",
  },
  navTasks: {
    title: "المهام",
    body: "متابعات ومهام لك ولفريقك.",
    benefit: "لا يفوتك أي موعد استحقاق.",
  },
  navCalendar: {
    title: "التقويم",
    body: "الاجتماعات والنشاطات المجدولة حسب التاريخ.",
    benefit: "تخطط ليومك وأسبوعك.",
  },
  navReports: {
    title: "التقارير",
    body: "مؤشرات أداء المسار والعملاء المحتملين والمهام.",
    benefit: "تفهم النتائج عبر أي فترة.",
  },
  navAudit: {
    title: "سجل التدقيق",
    body: "سجل للقراءة فقط لأهم الإجراءات في هذه المساحة.",
    benefit: "ترى من غيّر ماذا ومتى. للمالك فقط.",
  },
  navSettings: {
    title: "الإعدادات",
    body: "بيانات الشركة واللغة والمظهر والإشعارات.",
  },
  logout: {
    title: "تسجيل الخروج",
    body: "ينهي جلستك على هذا الجهاز.",
  },
  notifications: {
    title: "الإشعارات",
    body: "تنبيهات حديثة عن نشاط يخصّك.",
    benefit: "افتح أي إشعار لتنتقل مباشرة إلى العنصر.",
  },
  chat: {
    title: "محادثة الفريق",
    body: "راسل زملاءك دون مغادرة Orbit.",
  },
  importContacts: {
    title: "استيراد الجهات",
    body: "يضيف جهات من ملف CSV أو Excel مدعوم.",
    benefit: "تراجع الصفوف قبل حفظ أي شيء.",
  },
  reportsPeriod: {
    title: "فترة التقرير",
    body: "تحدد المدى الزمني لكل التقارير أدناه.",
    benefit: "تقارن فترات مختلفة دون مغادرة الصفحة.",
  },
  authLanguage: {
    title: "اللغة",
    body: "تغيّر لغة شاشة الدخول هذه فقط.",
    benefit: "لغة حسابك المحفوظة لا تتغير.",
  },
  settingsLanguage: {
    title: "لغة الواجهة",
    body: "اللغة المستخدمة في التطبيق كله لك.",
    benefit: "تُحفظ في حسابك وتتبعك على أي جهاز.",
  },
  settingsAppearance: {
    title: "المظهر",
    body: "تحدد لون خلفية منطقة المحتوى الرئيسية.",
    benefit: "يتكيف لون النص تلقائيًا ليبقى مقروءًا.",
  },
  settingsNotifications: {
    title: "إعدادات الإشعارات",
    body: "اختر الأحداث التي تُنبَّه إليها.",
    benefit: "تشتيت أقل دون أن يفوتك المهم.",
  },
};

const helpers = {
  ...flattenHelpers(content),
  helperBenefitLabel: "الفائدة:",
  helperIconLabel: "ما هو «{{name}}»؟",
};

export default helpers;
