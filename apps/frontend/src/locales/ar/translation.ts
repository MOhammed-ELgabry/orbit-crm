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
};

export default ar;