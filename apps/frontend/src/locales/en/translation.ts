const en = {
  // Login
  login: "Login",
  email: "Email",
  password: "Password",
  enterEmail: "Enter your email",
  enterPassword: "Enter your password",
  rememberMe: "Remember me",
  forgotPassword: "Forgot Password?",
  dontHaveAccount: "Don't have an account?",
  signUp: "Sign Up",
  alreadyHaveAccount: "Already have an account?",
  signIn: "Sign In",
  google: "Google",
  facebook: "Facebook",
  microsoft: "Microsoft",
  or: "Or",

  // Login Validation
  invalidEmail: "Invalid email",
  emailRequired: "Email is required",
  passwordMin: "Password must be at least 6 characters",
  passwordRequired: "Password is required",

  // Forgot / Reset Password
  forgotPasswordTitle: "Forgot Password?",
  forgotPasswordDescription:
    "Enter the email associated with your account and we'll send you a link to reset your password.",
  sendResetLink: "Send Reset Link",
  backToLogin: "Back to Login",
  noWorries: "No Worries!",
  forgotPasswordSideDescription:
    "It happens to everyone. We'll help you get back into your account.",

  resetPasswordTitle: "Reset Password",
  resetPasswordDescription: "Enter a new password for your account below.",
  newPassword: "New Password",
  enterNewPassword: "Enter your new password",
  confirmPassword: "Confirm Password",
  enterConfirmPassword: "Re-enter your new password",
  resetPassword: "Reset Password",
  passwordMinReset: "Password must be at least 8 characters",
  passwordsMustMatch: "Passwords must match",
  confirmPasswordRequired: "Please confirm your new password",
  createNewPassword: "Create a New Password",
  resetPasswordSideDescription:
    "Choose a strong password you don't use anywhere else.",

  // Register
  firstName: "First Name",
  lastName: "Last Name",
  enterFirstName: "Enter your first name",
  enterLastName: "Enter your last name",
  companyName: "Company Name",
  enterCompanyName: "Enter your company name",
  phone: "Phone",
  enterPhone: "Enter your phone number",
  avatar: "Avatar",
  optional: "Optional",
  createAccount: "Create account",

  // Terms
  termsText: "By creating an account you agree to the",
  termsOfUse: "Terms of Use",
  andOur: "and our",
  privacyPolicy: "Privacy Policy",

  // Register Validation
  firstNameRequired: "First name is required",
  lastNameRequired: "Last name is required",
  companyNameRequired: "Company name is required",

  // Email Verification
  verifyYourEmail: "Verify Your Email",
  checkYourEmail: "Check Your Email",
  verificationDescription:
    "We've sent a verification code to your email. Enter the code below to verify your account.",
  verifyEmail: "Verify Email",
  didntReceiveCode: "Didn't receive the code?",
  resendCode: "Resend Code",
  resending: "Resending...",
  changeEmail: "Change Email",

  almostThere: "Almost There!",
  completeAccountSetup: "Verify your email to complete your account setup.",

  // Industry Selection — must stay in sync with the backend's
  // BUSINESS_TYPES (medical_clinics / real_estate / auto_spare_parts).
  welcomeToOrbit: "Welcome to Orbit CRM",
  chooseBusinessIndustry: "Choose your business industry",
  chooseWorkspaceDescription:
    "Choose the workspace that best fits your business.",

  medicalClinics: "Medical Clinics",
  medicalClinicsDescription: "Manage patients, appointments and treatments.",

  realEstate: "Real Estate",
  realEstateDescription: "Manage properties, leads, clients and deals.",

  autoSpareParts: "Auto Spare Parts",
  autoSparePartsDescription:
    "Manage inventory, suppliers, orders and sales.",

  continue: "Continue",

  // Dashboard
  logout: "Logout",
  welcomeBack: "Welcome back, {{name}}!",
  dashboardSubtitle: "Here's what's happening with your business today.",
  totalContacts: "Total Contacts",
  teamMembers: "Team Members",
  accountOwner: "Account Owner",
  yes: "Yes",
  no: "No",
  dashboardComingSoon:
    "More CRM tools are on the way. This is your starting point.",

  // Alerts (SweetAlert2)
  ok: "OK",
  genericErrorMessage: "Something went wrong. Please try again.",

  loginFailedTitle: "Login Failed",
  loginFailedMessage:
    "The email or password you entered is incorrect. Please try again.",
  loginSuccessTitle: "Welcome Back",
  loginSuccessMessage: "You've successfully logged in.",

  registerSuccessTitle: "Account Created",
  registerSuccessMessage:
    "Your account has been created. Please check your email to verify your account.",
  registerFailedTitle: "Registration Failed",
  registerFailedMessage:
    "We couldn't create your account. Please check your details and try again.",

  verifyEmailSuccessTitle: "Email Verified",
  verifyEmailSuccessMessage: "Your email has been verified successfully.",
  verifyEmailFailedTitle: "Verification Failed",
  verifyEmailFailedMessage:
    "The code you entered is invalid or has expired. Please try again.",

  resendCodeSuccessTitle: "Code Resent",
  resendCodeSuccessMessage:
    "A new verification code has been sent to your email.",
  resendCodeFailedTitle: "Couldn't Resend Code",
  resendCodeFailedMessage:
    "We couldn't resend the verification code. Please try again.",

  businessTypeSuccessTitle: "Business Type Saved",
  businessTypeSuccessMessage:
    "Your business type has been saved successfully.",
  businessTypeFailedTitle: "Couldn't Save Business Type",
  businessTypeFailedMessage:
    "We couldn't save your business type. Please try again.",

  forgotPasswordSuccessTitle: "Check Your Email",
  forgotPasswordSuccessMessage:
    "If an account with this email exists, a password reset link has been sent.",
  forgotPasswordFailedTitle: "Something Went Wrong",
  forgotPasswordFailedMessage:
    "We couldn't process your request. Please try again.",

  resetPasswordSuccessTitle: "Password Reset",
  resetPasswordSuccessMessage:
    "Your password has been reset successfully. Please log in with your new password.",
  resetPasswordFailedTitle: "Couldn't Reset Password",
  resetPasswordFailedMessage:
    "This reset link is invalid or has expired. Please request a new one.",

  socialLoginFailedTitle: "Sign-in Failed",
};

export default en;