const ar = {
  // Login
  login: "تسجيل الدخول",
  email: "البريد الإلكتروني",
  password: "كلمة المرور",
  enterEmail: "أدخل بريدك الإلكتروني",
  enterPassword: "أدخل كلمة المرور",
  rememberMe: "تذكرني",
  forgotPassword: "نسيت كلمة المرور؟",
  dontHaveAccount: "ليس لديك حساب؟",
  signUp: "إنشاء حساب",
  alreadyHaveAccount: "لديك حساب بالفعل؟",
  signIn: "تسجيل الدخول",
  google: "جوجل",
  facebook: "فيسبوك",
  microsoft: "مايكروسوفت",
  or: "أو",

  // Login Validation
  invalidEmail: "البريد الإلكتروني غير صحيح",
  emailRequired: "البريد الإلكتروني مطلوب",
  passwordMin: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
  passwordRequired: "كلمة المرور مطلوبة",

  // Forgot / Reset Password
  forgotPasswordTitle: "نسيت كلمة المرور؟",
  forgotPasswordDescription:
    "أدخل البريد الإلكتروني المرتبط بحسابك وسنرسل لك رابطًا لإعادة تعيين كلمة المرور.",
  sendResetLink: "إرسال رابط إعادة التعيين",
  backToLogin: "العودة لتسجيل الدخول",
  noWorries: "لا داعي للقلق!",
  forgotPasswordSideDescription:
    "يحدث هذا للجميع. سنساعدك على العودة إلى حسابك.",

  resetPasswordTitle: "إعادة تعيين كلمة المرور",
  resetPasswordDescription: "أدخل كلمة مرور جديدة لحسابك أدناه.",
  newPassword: "كلمة المرور الجديدة",
  enterNewPassword: "أدخل كلمة المرور الجديدة",
  confirmPassword: "تأكيد كلمة المرور",
  enterConfirmPassword: "أعد إدخال كلمة المرور الجديدة",
  resetPassword: "إعادة تعيين كلمة المرور",
  passwordMinReset: "كلمة المرور يجب أن تكون 8 أحرف على الأقل",
  passwordsMustMatch: "يجب أن تتطابق كلمتا المرور",
  confirmPasswordRequired: "يرجى تأكيد كلمة المرور الجديدة",
  createNewPassword: "أنشئ كلمة مرور جديدة",
  resetPasswordSideDescription:
    "اختر كلمة مرور قوية لا تستخدمها في أي مكان آخر.",

  // Register
  firstName: "الاسم الأول",
  lastName: "اسم العائلة",
  enterFirstName: "أدخل اسمك الأول",
  enterLastName: "أدخل اسم العائلة",
  companyName: "اسم الشركة",
  enterCompanyName: "أدخل اسم الشركة",
  phone: "رقم الهاتف",
  enterPhone: "أدخل رقم هاتفك",
  avatar: "الصورة الشخصية",
  optional: "اختياري",
  createAccount: "إنشاء حساب",

  // Terms
  termsText: "بإنشاء حساب، فإنك توافق على",
  termsOfUse: "شروط الاستخدام",
  andOur: "و",
  privacyPolicy: "سياسة الخصوصية",

  // Register Validation
  firstNameRequired: "الاسم الأول مطلوب",
  lastNameRequired: "اسم العائلة مطلوب",
  companyNameRequired: "اسم الشركة مطلوب",

  // Email Verification
  verifyYourEmail: "تأكيد بريدك الإلكتروني",
  checkYourEmail: "تحقق من بريدك الإلكتروني",
  verificationDescription:
    "لقد أرسلنا رمز التحقق إلى بريدك الإلكتروني. أدخل الرمز أدناه لتأكيد حسابك.",
  verifyEmail: "تأكيد البريد الإلكتروني",
  didntReceiveCode: "لم يصلك الرمز؟",
  resendCode: "إعادة إرسال الرمز",
  resending: "جاري إعادة الإرسال...",
  changeEmail: "تغيير البريد الإلكتروني",

  almostThere: "أوشكت على الانتهاء!",
  completeAccountSetup: "قم بتأكيد بريدك الإلكتروني لإكمال إعداد حسابك.",

  // Industry Selection — يجب أن يبقى متوافقًا مع BUSINESS_TYPES في الخادم
  // (medical_clinics / real_estate / auto_spare_parts).
  welcomeToOrbit: "مرحبًا بك في Orbit CRM",
  chooseBusinessIndustry: "اختر مجال عملك",
  chooseWorkspaceDescription:
    "اختر مساحة العمل التي تناسب نشاطك التجاري.",

  medicalClinics: "العيادات الطبية",
  medicalClinicsDescription: "إدارة المرضى والمواعيد والعلاجات.",

  realEstate: "العقارات",
  realEstateDescription: "إدارة العقارات والعملاء المحتملين والصفقات.",

  autoSpareParts: "قطع غيار السيارات",
  autoSparePartsDescription: "إدارة المخزون والموردين والطلبات والمبيعات.",

  continue: "متابعة",

  // Dashboard
  logout: "تسجيل الخروج",
  welcomeBack: "مرحبًا بعودتك، {{name}}!",
  dashboardSubtitle: "إليك ما يحدث في نشاطك التجاري اليوم.",
  totalContacts: "إجمالي العملاء",
  teamMembers: "أعضاء الفريق",
  accountOwner: "مالك الحساب",
  yes: "نعم",
  no: "لا",
  dashboardComingSoon:
    "المزيد من أدوات إدارة العملاء قريبًا. هذه نقطة البداية.",

  // Alerts (SweetAlert2)
  ok: "حسناً",
  genericErrorMessage: "حدث خطأ ما. يرجى المحاولة مرة أخرى.",

  loginFailedTitle: "فشل تسجيل الدخول",
  loginFailedMessage: "البريد الإلكتروني أو كلمة المرور غير صحيحة. حاول مرة أخرى.",
  loginSuccessTitle: "مرحبًا بعودتك",
  loginSuccessMessage: "تم تسجيل دخولك بنجاح.",

  registerSuccessTitle: "تم إنشاء الحساب",
  registerSuccessMessage:
    "تم إنشاء حسابك بنجاح. يرجى التحقق من بريدك الإلكتروني لتأكيد حسابك.",
  registerFailedTitle: "فشل إنشاء الحساب",
  registerFailedMessage:
    "تعذر إنشاء حسابك. يرجى التحقق من بياناتك والمحاولة مرة أخرى.",

  verifyEmailSuccessTitle: "تم تأكيد البريد الإلكتروني",
  verifyEmailSuccessMessage: "تم تأكيد بريدك الإلكتروني بنجاح.",
  verifyEmailFailedTitle: "فشل التحقق",
  verifyEmailFailedMessage:
    "الرمز الذي أدخلته غير صحيح أو منتهي الصلاحية. حاول مرة أخرى.",

  resendCodeSuccessTitle: "تم إعادة إرسال الرمز",
  resendCodeSuccessMessage: "تم إرسال رمز تحقق جديد إلى بريدك الإلكتروني.",
  resendCodeFailedTitle: "تعذر إعادة إرسال الرمز",
  resendCodeFailedMessage: "تعذر إعادة إرسال رمز التحقق. يرجى المحاولة مرة أخرى.",

  businessTypeSuccessTitle: "تم حفظ نوع النشاط",
  businessTypeSuccessMessage: "تم حفظ نوع نشاطك التجاري بنجاح.",
  businessTypeFailedTitle: "تعذر حفظ نوع النشاط",
  businessTypeFailedMessage: "تعذر حفظ نوع نشاطك التجاري. يرجى المحاولة مرة أخرى.",

  forgotPasswordSuccessTitle: "تحقق من بريدك الإلكتروني",
  forgotPasswordSuccessMessage:
    "إذا كان هناك حساب مرتبط بهذا البريد الإلكتروني، فسيتم إرسال رابط إعادة تعيين كلمة المرور إليه.",
  forgotPasswordFailedTitle: "حدث خطأ ما",
  forgotPasswordFailedMessage: "تعذرت معالجة طلبك. يرجى المحاولة مرة أخرى.",

  resetPasswordSuccessTitle: "تم إعادة تعيين كلمة المرور",
  resetPasswordSuccessMessage:
    "تم إعادة تعيين كلمة مرورك بنجاح. يرجى تسجيل الدخول بكلمة المرور الجديدة.",
  resetPasswordFailedTitle: "تعذر إعادة تعيين كلمة المرور",
  resetPasswordFailedMessage:
    "رابط إعادة التعيين غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد.",

  socialLoginFailedTitle: "فشل تسجيل الدخول",

  // إجراءات عامة
  save: "حفظ",
  saveChanges: "حفظ التغييرات",
  cancel: "إلغاء",
  close: "إغلاق",
  edit: "تعديل",
  delete: "حذف",
  create: "إنشاء",
  add: "إضافة",
  search: "بحث",
  actions: "إجراءات",
  status: "الحالة",
  loading: "جارٍ التحميل...",
  confirmDeleteTitle: "هل أنت متأكد؟",
  confirmDeleteMessage: "لا يمكن التراجع عن هذا الإجراء.",
  somethingWentWrong: "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
  comingSoonTitle: "قريبًا",
  comingSoonDescription: "هذه الميزة قيد التطوير — تابعنا قريبًا.",
  retry: "إعادة المحاولة",

  // شعارات لوحة التحكم حسب نوع النشاط
  dashboardTaglineMedical: "إليك ما يحدث في عيادتك اليوم.",
  dashboardTaglineRealEstate: "إليك ما يحدث مع عقاراتك اليوم.",
  dashboardTaglineAutoParts: "إليك ما يحدث في محلك اليوم.",

  // أسماء الكيانات حسب نوع النشاط
  patients: "المرضى",
  patient: "مريض",
  clients: "العملاء",
  client: "عميل",
  customers: "العملاء",
  customer: "عميل",
  contacts: "الجهات",
  contact: "جهة اتصال",
  appointments: "المواعيد",
  propertyActivity: "نشاط العقارات",
  serviceVisits: "زيارات الخدمة",
  activities: "الأنشطة",
  upcoming: "القادمة",
  team: "الفريق",

  // صفحة جهات الاتصال
  searchContactsPlaceholder: "ابحث بالاسم أو البريد الإلكتروني أو الجهة...",
  noContactsFoundTitle: "لا يوجد {{label}} بعد",
  noContactsFoundDescription: "أضف أول {{label}} للبدء.",
  addContact: "إضافة {{label}}",
  editContact: "تعديل {{label}}",
  deleteContactConfirm: "حذف هذا الـ {{label}}؟ لا يمكن التراجع عن ذلك.",
  organization: "المؤسسة",
  jobTitle: "المسمى الوظيفي",
  assignedTo: "مسند إلى",
  unassigned: "غير مسند",
  notes: "ملاحظات",
  source: "المصدر",
  allStatuses: "كل الحالات",
  backToList: "العودة إلى {{label}}",
  contactStatusActive: "نشط",
  contactStatusInactive: "غير نشط",
  contactStatusLead: "عميل محتمل",
  contactStatusCustomer: "عميل",
  contactStatusArchived: "مؤرشف",

  // الخط الزمني للنشاط
  activityTimelineTitle: "الخط الزمني",
  logActivity: "تسجيل نشاط",
  activityTypeLabel: "النوع",
  activityTitleLabel: "العنوان",
  activityDescriptionLabel: "الوصف (اختياري)",
  activityDateLabel: "التاريخ والوقت",
  noActivitiesYetTitle: "لا يوجد نشاط مسجل بعد",
  noActivitiesYetDescription: "سجّل مكالمة أو اجتماعًا أو ملاحظة للبدء.",
  activityTypeNote: "ملاحظة",
  activityTypeCall: "مكالمة",
  activityTypeEmail: "بريد إلكتروني",
  activityTypeMeeting: "اجتماع",
  activityTypeTask: "مهمة",
  activityTypeStatusChange: "تغيير الحالة",
  activityTypeSystem: "نظام",
  activityTypeOther: "أخرى",

  // صفحة الفريق
  teamPageTitle: "الفريق",
  addTeamMember: "إضافة عضو فريق",
  roleLabel: "الدور",
  ownerBadge: "المالك",
  activeStatus: "نشط",
  inactiveStatus: "غير نشط",
  deactivate: "إلغاء التفعيل",
  activateAction: "تفعيل",
  noRoleAssigned: "لا يوجد دور معين",
  roleNameManager: "مدير",
  roleNameSales: "مبيعات",
  roleNameSupport: "دعم",
  roleNameEmployee: "موظف",
  teamMemberAdded: "تمت إضافة عضو الفريق",
  addTeamMemberDescription: "يمكن للأعضاء الجدد تسجيل الدخول فورًا باستخدام كلمة المرور التي تحددها هنا.",
  noTeamMembersYet: "لا يوجد أعضاء فريق بعد",
  you: "أنت",

  // صفحة الإعدادات
  companySettingsTitle: "إعدادات الشركة",
  companyNameLabel: "اسم الشركة",
  businessTypeLabel: "نوع النشاط",
  contactEmailLabel: "بريد التواصل",
  addressLabel: "العنوان",
  websiteLabel: "الموقع الإلكتروني",
  ownerOnlyNotice: "يمكن لمالك الحساب فقط تعديل هذه الإعدادات.",
  settingsSaved: "تم حفظ الإعدادات بنجاح.",

  // تسميات القائمة الجانبية
  dashboardNavLabel: "لوحة التحكم",
  teamNavLabel: "الفريق",
  leadsNavLabel: "العملاء المحتملون",
  dealsNavLabel: "الصفقات",
  tasksNavLabel: "المهام",
  calendarNavLabel: "التقويم",
  reportsNavLabel: "التقارير",
  settingsNavLabel: "الإعدادات",
  logoutConfirmTitle: "تسجيل الخروج؟",
  logoutConfirmMessage: "ستحتاج إلى تسجيل الدخول مرة أخرى للوصول إلى لوحة التحكم.",
  loadMore: "عرض المزيد",
};

export default ar;